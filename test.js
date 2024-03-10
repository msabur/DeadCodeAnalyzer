import { argv } from 'node:process'
import { readFileSync } from 'node:fs'
import * as acorn from "acorn"
import { walk } from 'estree-walker'

(function main() {
    let inputFilename = "testProgram.js"
    if (argv.length > 2) {
        inputFilename = argv[2]
    }

    let inputCode = readFileSync(inputFilename)
    let ast = acorn.parse(inputCode, { ecmaVersion: 2023 })

    let { generated, killed } = getGenAndKillSets(ast)

    console.log("Gen sets:")
    for (let [location, variables] of generated) {
        if (variables.size > 0) {
            console.log(`${location}: { ${Array.from(variables).join(", ")} }`)
        }
    }

    console.log("\nKill sets:")
    for (let [location, variables] of killed) {
        if (variables.size > 0) {
            console.log(`${location}: { ${Array.from(variables).join(", ")} }`)
        }
    }

    let flows = getFlows(ast)

    console.log("\nFlows:")
    console.log(flows.map(flow => `(${flow[0]}, ${flow[1]})`).join(" "))
})()

/**
 * 
 * @param {acorn.Program} ast 
 * @returns {{generated: Map<number, Set<string>>, killed: Map<number, Set<string>>}}
 */
function getGenAndKillSets(ast) {
    let generated = new Map()

    /**
     * @type {Map<number, Set<string>>}
     * Maps a statement's location to the set of variables it kills
     */
    let killed = new Map()

    let currentLocation = 0

    // Walk the AST and build the gen/kill sets
    walk(ast, {
        enter(node) {
            currentLocation = node.start

            if (node.type === "AssignmentExpression") {
                killed.set(currentLocation, killed.get(currentLocation) || new Set())
                generated.set(currentLocation, generated.get(currentLocation) || new Set())

                killed.get(currentLocation).add(node.left.name)

                walk(node.right, {
                    enter(node) {
                        if (node.type === "Identifier") {
                            generated.get(currentLocation).add(node.name)
                        }
                    }
                })
            } else if (node.type == "UpdateExpression") {
                killed.set(currentLocation, killed.get(currentLocation) || new Set())
                generated.set(currentLocation, generated.get(currentLocation) || new Set())

                walk(node.argument, {
                    enter(node) {
                        if (node.type == "Identifier") {
                            killed.get(currentLocation).add(node.name)

                            generated.get(currentLocation).add(node.name)
                        }
                    }
                })
            } else if (node.type == "CallExpression") {
                killed.set(currentLocation, killed.get(currentLocation) || new Set())
                generated.set(currentLocation, generated.get(currentLocation) || new Set())

                if (node.callee.object.name == "console" && node.callee.property.name == "log") {
                    for (let argument of node.arguments) {
                        if (argument.type == "Identifier") {
                            generated.get(currentLocation).add(argument.name)
                        }
                    }
                }
            } else if (node.type == "WhileStatement") {
                killed.set(currentLocation, killed.get(currentLocation) || new Set())
                generated.set(currentLocation, generated.get(currentLocation) || new Set())

                walk(node.test, {
                    enter(node) {
                        if (node.type == "Identifier") {
                            generated.get(currentLocation).add(node.name)
                        }
                    }
                })
            } else if (node.type == "IfStatement") {
                killed.set(currentLocation, killed.get(currentLocation) || new Set())
                generated.set(currentLocation, generated.get(currentLocation) || new Set())

                walk(node.test, {
                    enter(node) {
                        if (node.type == "Identifier") {
                            generated.get(currentLocation).add(node.name)
                        }
                    }
                })
            }
        }
    })
    return { generated, killed }
}

/**
 * Get the location of the first statement in the AST.
 * @param {acorn.Program} ast - The AST to analyze.
 * @returns {number | undefined} - The location of the first statement.
 */
function getInitialLocation(ast) {
    if (ast.type === "ExpressionStatement") { // Elementary block
        return ast.start;
    } else if (ast.body) { // Compound block
        return ast.body[0]?.start;
    }
}

/**
 * Get the location of the last statement in the AST.
 * @param {acorn.Program} ast - The AST to analyze.
 * @returns {number | undefined} - The location of the last statement.
 */
function getFinalLocation(ast) {
    if (ast.type === "ExpressionStatement") { // Elementary block
        return ast.start;
    } else if (ast.body) { // Compound block
        return ast.body[ast.body.length - 1]?.start;
    }
}

/**
 * 
 * @param {acorn.AnyNode} ast 
 * @returns {[number, number][]} - A list of flows (as (from, to) pairs like in the book).
 */
function getFlows(ast) {
    let result = []
    let prevLocations = [] // Locations that flow into the current statement

    if (["Program", "BlockStatement"].includes(ast.type)) {
        for (let statement of ast.body) {
            console.log(statement.type, statement.start)
            if (statement.type === "ExpressionStatement") {
                prevLocations.forEach(location => result.push([location, statement.start]))
                prevLocations = [statement.start]
            } else if (statement.type === "VariableDeclaration") {
                prevLocations.forEach(location => result.push([location, statement.start]))
                prevLocations = [statement.start]
            } else if (statement.type === "ThrowStatement") {
                prevLocations.forEach(location => result.push([location, statement.start]))
                prevLocations = [statement.start]
            } else if (statement.type === "IfStatement") {
                prevLocations.forEach(location => result.push([location, statement.test.start]))
				
				// flows from the test into the consequent and alternate (then and else)
				result.push([statement.test.start, getInitialLocation(statement.consequent)])
				if(statement.alternate) {
					result.push([statement.test.start, getInitialLocation(statement.alternate)])
                }
				
				// flows within the consequent and alternate (then and else)
				result.push(...getFlows(statement.consequent))
				if(statement.alternate) {
					result.push(...getFlows(statement.alternate))
                }
				
				prevLocations = [getFinalLocation(statement.consequent)]
				if(statement.alternate) {
					prevLocations.push(getFinalLocation(statement.alternate))
                } else {
					prevLocations.push(statement.test.start)
                }
            } else if (statement.type === "WhileStatement") {
                prevLocations.forEach(location => result.push([location, statement.test.start]))
                
                if (statement.body.body.length > 0) {
                    // flows from test into the while body
                    result.push([statement.test.start, getInitialLocation(statement.body)])
                    result.push(...getFlows(statement.body))
                    
                    // flows from end of while body to test
                    prevLocations = [getFinalLocation(statement.body)]
                    prevLocations.forEach(location => result.push([location, statement.test.start]))
                } else {
                    result.push([statement.test.start, statement.test.start])
                    prevLocations = [statement.test.start]
                }
            } else if (statement.type === "TryStatement") {
                if (statement.block.body.length > 0) {
                    prevLocations.forEach(location => result.push([location, getInitialLocation(statement.block)]))
                    result.push(...getFlows(statement.block))
                    prevLocations = [getFinalLocation(statement.block)]
                }

                if (statement.handler) {
                    if (statement.handler.body.body.length > 0) {
                        prevLocations.forEach(location => result.push([location, getInitialLocation(statement.handler.body)]))
                        result.push(...getFlows(statement.handler.body))
                        prevLocations.push(getFinalLocation(statement.handler.body))
                    }
                }

                if (statement.finalizer) {
                    if (statement.finalizer.body.length > 0) {
                        prevLocations.forEach(location => result.push([location, getInitialLocation(statement.finalizer)]))
                        result.push(...getFlows(statement.finalizer))
                        prevLocations = [getFinalLocation(statement.finalizer)]
                    }
                }
            }
        }   
    }
    return result
}
