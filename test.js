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

    let flows = doFlowAnalysis(ast).flows

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
    if (ast.body && ast.body.length > 0) { // Compound block with statements
        return ast.body[0].start;
    } else { // Elementary block or empty compound block
        return ast.start;
    }
}

/**
 * Get the location of the last statement in the AST.
 * @param {acorn.Program} ast - The AST to analyze.
 * @returns {number | undefined} - The location of the last statement.
 */
function getFinalLocation(ast) {
    if (ast.body && ast.body.length > 0) { // Compound block with statements
        return ast.body[ast.body.length - 1].start;
    } else { // Elementary block or empty compound block
        return ast.start;
    }
}

/**
 * 
 * @param {acorn.AnyNode} ast 
 * @returns {{flows: [number, number][], 
 *            throwLocation: number | null, 
 *            breakLocations: number[], 
 *            continueLocations: number[]}}
 */
function doFlowAnalysis(ast) {
    let flows = []
    let prevLocations = [] // Locations that flow into the current statement
    let throwLocation = null // Location of the throw statement in case of early termination
    let breakLocations = [] // Location of the break statements in case of early termination
    let continueLocations = [] // Location of the continue statements in case of early termination
    let unreachable = false // Whether the current statement is unreachable due to throw/break/continue

    if (["Program", "BlockStatement"].includes(ast.type)) {
        for (let statement of ast.body) {
            if (unreachable) {
                console.warn(`Unreachable statement found: ${statement.type} at char offset ${statement.start}`)
            } else if (statement.type === "ExpressionStatement") {
                prevLocations.forEach(location => flows.push([location, statement.start]))
                prevLocations = [statement.start]
            } else if (statement.type === "VariableDeclaration") {
                prevLocations.forEach(location => flows.push([location, statement.start]))
                prevLocations = [statement.start]
            } else if (statement.type === "ThrowStatement") {
                prevLocations.forEach(location => flows.push([location, statement.start]))
                throwLocation = statement.start
                // break;
                unreachable = true
            } else if (statement.type === "BreakStatement") {
                prevLocations.forEach(location => flows.push([location, statement.start]))
                breakLocations = [statement.start]
                // break;
                unreachable = true
            } else if (statement.type === "ContinueStatement") {
                prevLocations.forEach(location => flows.push([location, statement.start]))
                continueLocations = [statement.start]
                // break;
                unreachable = true
            } else if (statement.type === "IfStatement") {
                prevLocations.forEach(location => flows.push([location, statement.test.start]))
				
				// flows from the test into the consequent and alternate (then and else)
				flows.push([statement.test.start, getInitialLocation(statement.consequent)])
				if(statement.alternate) {
					flows.push([statement.test.start, getInitialLocation(statement.alternate)])
                }
				
				// flows within the consequent and alternate (then and else)
                let alternateRes
                let consequentRes = doFlowAnalysis(statement.consequent)
				flows.push(...consequentRes.flows)

				if(statement.alternate) {
                    alternateRes = doFlowAnalysis(statement.alternate)
					flows.push(...alternateRes.flows)
                }
				
                // Accounting for break/continue statements
                if (consequentRes.breakLocations.length > 0) {
                    consequentRes.breakLocations.forEach(location => breakLocations.push(location))
                    prevLocations = []
                } else if (consequentRes.continueLocations.length > 0) {
                    consequentRes.continueLocations.forEach(location => continueLocations.push(location))
                    prevLocations = []
                } else {
                    prevLocations = [getFinalLocation(statement.consequent)]
                }

				if(statement.alternate) {
                    if (alternateRes.breakLocations.length > 0) {
                        alternateRes.breakLocations.forEach(location => breakLocations.push(location))
                    } else if (alternateRes.continueLocations.length > 0) {
                        alternateRes.continueLocations.forEach(location => continueLocations.push(location))
                    } else {
					    prevLocations.push(getFinalLocation(statement.alternate))
                    }
                } else {
					prevLocations.push(statement.test.start)
                }
            } else if (statement.type === "WhileStatement") {
                prevLocations.forEach(location => flows.push([location, statement.test.start]))
                
                if (statement.body.body.length > 0) {
                    // flows from test into the while body
                    flows.push([statement.test.start, getInitialLocation(statement.body)])
                    let res = doFlowAnalysis(statement.body)
                    flows.push(...res.flows)
                    
                    // flows from end of while body to test
                    prevLocations = [getFinalLocation(statement.body)]
                    if (res.continueLocations.length > 0) {
                        res.continueLocations.forEach(location => prevLocations.push(location))
                    }
                    prevLocations.forEach(location => flows.push([location, statement.test.start]))

                    // Can only flow out of the while statement from the test condition
                    prevLocations = [statement.test.start]
                    if (res.breakLocations.length > 0) {
                        res.breakLocations.forEach(location => prevLocations.push(location))
                    }
                } else {
                    flows.push([statement.test.start, statement.test.start])
                    prevLocations = [statement.test.start]
                }
            } else if (statement.type === "TryStatement") {
                prevLocations.forEach(location => flows.push([location, getInitialLocation(statement.block)]))
                let res = doFlowAnalysis(statement.block)
                flows.push(...res.flows)
                
                // Assuming we always have a catch, and possibly a finally
                
                if (res.throwLocation) {
                    prevLocations = [getFinalLocation(statement.handler.body)]
                } else {
                    prevLocations = [getFinalLocation(statement.block), getFinalLocation(statement.handler.body)]
                }
                
                // Flows from try to catch
                for (let s of statement.block.body) {
                    if (res.throwLocation && s.start > res.throwLocation) break;
                    flows.push([s.start, getInitialLocation(statement.handler.body)])
                }

                // add flows within the catch
                flows.push(...doFlowAnalysis(statement.handler.body).flows)
                
                // if finally is also present, add the additional flows
                if (statement.finalizer) {
                    flows.push(...doFlowAnalysis(statement.finalizer).flows)
                    flows.push([getFinalLocation(statement.handler.body), getInitialLocation(statement.finalizer)])
                    prevLocations = [getFinalLocation(statement.finalizer)]
                }
            }
        }   
    }
    return {flows, throwLocation, breakLocations, continueLocations}
}
