import { argv } from 'node:process'
import { readFileSync } from 'node:fs'
import * as acorn from "acorn"
import { walk } from 'estree-walker'

let inputFilename = "testProgram.js"
if (argv.length > 2) {
    inputFilename = argv[2]
}

let inputCode = readFileSync(inputFilename)
let ast = acorn.parse(inputCode, { ecmaVersion: 2023 })

/**
 * @type {Map<number, Set<string>>}
 * Maps a statement's location to the set of variables it generates
 */
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
            // init gen/kill sets for this location if they don't exist
            killed.set(currentLocation, killed.get(currentLocation) || new Set())
            generated.set(currentLocation, generated.get(currentLocation) || new Set())

            // console.log(`KILL ${node.left.name}: location ${node.start}`)
            killed.get(currentLocation).add(node.left.name)

            walk(node.right, {
                enter(node) {
                    if (node.type === "Identifier") {
                        // console.log(`GEN ${node.name}: location ${node.start}`)
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
                        // console.log(`KILL ${node.name}: location ${node.start}`)
                        killed.get(currentLocation).add(node.name)

                        // console.log(`GEN ${node.name}: location ${node.start}`)
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
                        // console.log(`GEN ${argument.name}: location ${argument.location}`)
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
                        // console.log(`GEN ${node.name}: location ${node.start}`)
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
                        // console.log(`GEN: ${node.name}: location ${node.start}`)
                        generated.get(currentLocation).add(node.name)
                    }
                }
            })
        }
    }
})

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

