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

    let { LVentry, LVexit } = doLiveVariableAnalysis(flows, killed, generated)

    console.log("\nLive variables:")
    let data = {}
    for (let label of LVentry.keys()) {
        data[label] = {LVentry: Array.from(LVentry.get(label)), LVexit: Array.from(LVexit.get(label))}
    }
    console.table(data)

    for (let [location, variables] of killed) {
        let continueFlag = 0
        if (variables.size > 0) {
            let killedVariable = Array.from(variables)[0]
            if ((Array.from(LVexit.keys())).includes(location)) {
                for (let variable of Array.from(LVexit.get(location))) {
                    if (variable == killedVariable) {
                        continueFlag = 1
                        break
                    }
                }
                if (continueFlag)
                    continue
                console.warn(`Dead assignment found: ${killedVariable} at char offset ${location}`)
            }
        }
    }
})()

/**
 * @param {[number, number][]} flows 
 * @param {Map<number, Set<string>>} killed 
 * @param {Map<number, Set<string>>} generated 
 */
function doLiveVariableAnalysis(flows, killed, generated) {
    /** @type {Set<number>} */
    let allLabels = new Set()
    for (let [from, to] of flows) {
        allLabels.add(from)
        allLabels.add(to)
    }

    /** @type {Map<number, Set<string>} */
    let LVentry = new Map()

    /** @type {Map<number, Set<string>} */
    let LVexit = new Map()

    /** @type {Map<number, number[]>} */
    let successors = new Map()

    for (let label of allLabels) {
        LVentry.set(label, new Set())
        LVexit.set(label, new Set())
        let outflows = flows.filter(([from, _]) => (from == label))
        successors.set(label, outflows.map(([_, to]) => to))
    }

    // Chaotic iteration for finding LV_entry and LV_exit for each label
    while (true) {
        let changed = false

        for (let label of allLabels) {
            // find new LV_exit for this label
            // LV_exit(l) = U{ LV_entry(l') | (l, l') in flow(S*) }
            let new_LVexit = new Set()
            for (let successor of successors.get(label)) {
                for (let value of LVentry.get(successor).values()) {
                    new_LVexit.add(value)
                }
            }

            // find new LV_entry for this label
            // LV_entry(l) = (LV_exit(l) - kill(B^l)) + gen(B^l)
            let new_LVentry = new Set(new_LVexit)
            if (killed.has(label)) {
                for (let kill of killed.get(label).values()) {
                    new_LVentry.delete(kill)
                }
            }
            if (generated.has(label)) {
                for (let gen of generated.get(label).values()) {
                    new_LVentry.add(gen)
                }
            }

            // update old LV_entry/LV_exit if the new ones differ
            if (!setsAreEqual(LVentry.get(label), new_LVentry)) {
                changed = true
                LVentry.set(label, new_LVentry)
            }
            if (!setsAreEqual(LVexit.get(label), new_LVexit)) {
                changed = true
                LVexit.set(label, new_LVexit)
            }
        }

        if (!changed) {
            break
        }
    }
    return { LVentry, LVexit }
}

// source: https://stackoverflow.com/a/31129384
function setsAreEqual(xs, ys) {
    return xs.size === ys.size && [...xs].every((x) => ys.has(x));
}

/**
 * 
 * @param {acorn.Program} ast 
 * @returns {{generated: Map<number, Set<string>>, killed: Map<number, Set<string>>}}
 */
function getGenAndKillSets(ast) {
    let generated = new Map()

    /** @type {Map<number, Set<string>>} */
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
                const testLocation = node.test.start

                killed.set(testLocation, killed.get(testLocation) || new Set())
                generated.set(testLocation, generated.get(testLocation) || new Set())

                walk(node.test, {
                    enter(node) {
                        if (node.type == "Identifier") {
                            generated.get(testLocation).add(node.name)
                        }
                    }
                })
            } else if (node.type == "IfStatement") {
                const testLocation = node.test.start

                killed.set(testLocation, killed.get(testLocation) || new Set())
                generated.set(testLocation, generated.get(testLocation) || new Set())

                walk(node.test, {
                    enter(node) {
                        if (node.type == "Identifier") {
                            generated.get(testLocation).add(node.name)
                        }
                    }
                })
            }
        }
    })
    return { generated, killed }
}

/**
 * @param {acorn.AnyNode} ast 
 * @returns {{flows: [number, number][], 
 *            throwLocation: number | null, 
 *            breakLocations: number[], 
 *            continueLocations: number[],
 *            initial: number,
 *            finals: number[],
 *            finalIsReachable: boolean}}
 */
function doFlowAnalysis(ast) {
    let flows = []
    let prevLocations = [] // Locations that flow into the current statement
    let throwLocation = null // Location of the throw statement in case of early termination
    let breakLocations = [] // Location of the break statements in case of early termination
    let continueLocations = [] // Location of the continue statements in case of early termination
    let initial = null // Location of the first statement in the block
    let finals = [] // Locations of the last statements in the block (if reachable)
    let unreachable = false // Whether the current statement is unreachable due to throw/break/continue

    if (["Program", "BlockStatement"].includes(ast.type)) {
        for (let statement of ast.body) {
            if (unreachable) {
                prevLocations = []
                console.warn(`Unreachable statement found: ${statement.type} at char offset ${statement.start}`)
            } else if (statement.type === "ExpressionStatement") {
                if (!initial) initial = statement.start
                prevLocations.forEach(location => flows.push([location, statement.start]))
                prevLocations = [statement.start]
            } else if (statement.type === "VariableDeclaration") {
                if (!initial) initial = statement.start
                prevLocations.forEach(location => flows.push([location, statement.start]))
                prevLocations = [statement.start]
            } else if (statement.type === "ThrowStatement") {
                if (!initial) initial = statement.start
                prevLocations.forEach(location => flows.push([location, statement.start]))
                throwLocation = statement.start
                unreachable = true
            } else if (statement.type === "BreakStatement") {
                if (!initial) initial = statement.start
                prevLocations.forEach(location => flows.push([location, statement.start]))
                breakLocations = [statement.start]
                unreachable = true
            } else if (statement.type === "ContinueStatement") {
                if (!initial) initial = statement.start
                prevLocations.forEach(location => flows.push([location, statement.start]))
                continueLocations = [statement.start]
                unreachable = true
            } else if (statement.type === "IfStatement") {
                if (!initial) initial = statement.test.start
                prevLocations.forEach(location => flows.push([location, statement.test.start]))

                if (statement.test.type === "Literal") {
                    if (statement.test.value === false || statement.test.value === null) {
                        console.warn(`Unreachable IfStatement consequent found at char offset ${statement.consequent.start}`)
                        statement.consequent.body = statement.alternate.body
                        statement.alternate.body = []
                    } else if (statement.test.value === true) {
                        console.warn(`Unreachable IfStatement alternate found at char offset ${statement.alternate.start}`)
                        statement.alternate.body = []
                    }
                }

                let alternateRes
                let consequentRes = doFlowAnalysis(statement.consequent)
                if (statement.alternate?.body.length > 0) {
                    alternateRes = doFlowAnalysis(statement.alternate)
                }

				// flows from the test into the consequent and alternate (then and else)
                if (statement.consequent.body.length > 0) {
				    flows.push([statement.test.start, consequentRes.initial])
                }
				if(alternateRes) {
					flows.push([statement.test.start, alternateRes.initial])
                }
				
				// flows within the consequent and alternate (then and else)
				flows.push(...consequentRes.flows)

				if(statement.alternate?.body.length > 0) {
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
                    prevLocations = [...consequentRes.finals]
                }

				if(statement.alternate) {
                    if (alternateRes?.breakLocations.length > 0) {
                        alternateRes.breakLocations.forEach(location => breakLocations.push(location))
                    } else if (alternateRes?.continueLocations.length > 0) {
                        alternateRes.continueLocations.forEach(location => continueLocations.push(location))
                    } else if (statement.alternate.body.length > 0) {
					    prevLocations.push(...alternateRes.finals)
                    }
                } else {
					prevLocations.push(statement.test.start)
                }
                
                // if both the consequent and alternate have break/continue, the
                // rest of the statements in this block will be unreachable
                let consequentHasBreak = consequentRes.breakLocations.length > 0
                let consequentHasContinue = consequentRes.continueLocations.length > 0
                let alternateHasBreak = alternateRes?.breakLocations.length > 0
                let alternateHasContinue = alternateRes?.continueLocations.length > 0
                if ((consequentHasBreak || consequentHasContinue) && (alternateHasBreak || alternateHasContinue)) {
                    unreachable = true
                }
            } else if (statement.type === "WhileStatement") {
                if (!initial) initial = statement.test.start
                prevLocations.forEach(location => flows.push([location, statement.test.start]))

                if (statement.test.type === "Literal") {
                    if (statement.test.value === false || statement.test.value === null) {
                        console.warn(`Unreachable WhileLoop body found at char offset ${statement.body.start}`)
                        prevLocations = [statement.test.start]
                        continue // no flows to or in unreachable body
                    }
                }
                
                if (statement.body.body.length > 0) {
                    // flows from test into the while body
                    let res = doFlowAnalysis(statement.body)
                    flows.push([statement.test.start, res.initial])
                    flows.push(...res.flows)
                    
                    // flows from end of while body to test
                    prevLocations = []
                    if (res.finalIsReachable) {
                        prevLocations = [...res.finals]
                    }
                    if (res.continueLocations.length > 0) {
                        res.continueLocations.forEach(location => prevLocations.push(location))
                    }
                    prevLocations.forEach(location => flows.push([location, statement.test.start]))

                    // Can only flow out of the while statement from the test condition or breaks
                    prevLocations = [statement.test.start]
                    if (res.breakLocations.length > 0) {
                        res.breakLocations.forEach(location => prevLocations.push(location))
                    }
                } else {
                    flows.push([statement.test.start, statement.test.start])
                    prevLocations = [statement.test.start]
                }
            } else if (statement.type === "TryStatement") {
                let res = doFlowAnalysis(statement.block)
                if (!initial) initial = res.initial
                prevLocations.forEach(location => flows.push([location, res.initial]))
                flows.push(...res.flows)
                
                // Assuming we always have a catch, and possibly a finally

                let handlerRes = doFlowAnalysis(statement.handler.body)
                let finalizerRes
                if (statement.finalizer) {
                    finalizerRes = doFlowAnalysis(statement.finalizer)
                }
                
                if (res.throwLocation) {
                    prevLocations = [...handlerRes.finals]
                } else {
                    prevLocations = [...res.finals, ...handlerRes.finals]
                }
                
                // Flows from try to catch
                for (let s of statement.block.body) {
                    if (res.throwLocation && s.start > res.throwLocation) break;
                    flows.push([s.start, handlerRes.initial])
                }

                // add flows within the catch
                flows.push(...handlerRes.flows)
                
                // if finally is also present, add the additional flows
                if (statement.finalizer) {
                    flows.push(...finalizerRes.flows)
                    for (let location of handlerRes.finals) {
                        flows.push([location, finalizerRes.initial])
                    }
                    prevLocations = [...finalizerRes.finals]
                }
            }
        }   
    }
    finals = prevLocations // the last statement's prevLocations are the finals of the block
    return {flows, throwLocation, breakLocations, continueLocations, initial, finals, finalIsReachable: !unreachable}
}
