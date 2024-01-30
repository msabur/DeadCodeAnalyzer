import { argv } from 'node:process';
import { readFileSync } from 'node:fs';
import * as acorn from "acorn";
import { walk } from 'estree-walker';

// console.log(acorn.parse("1 + 1", {ecmaVersion: 2023}));

// let jsx = require("acorn-jsx");
// let JSXParser = acorn.Parser.extend(jsx());
// console.log(JSXParser.parse("foo(<bar/>)", {ecmaVersion: 2023}))

let inputFilename = "testProgram.js"
if (argv.length > 2) {
    inputFilename = argv[2]
}

let inputCode = readFileSync(inputFilename);
let ast = acorn.parse(inputCode, { ecmaVersion: 2023 });

walk(ast, {
    enter(node) {
        if (node.type === "AssignmentExpression") {
            console.log(`KILL ${node.left.name}: location ${node.start}`);
            walk(node.right, {
                enter(node) {
                    if (node.type === "Identifier") {
                        console.log(`GEN ${node.name}: location ${node.start}`);
                    }
                }
            });
        } else if (node.type == "CallExpression") {
            if (node.callee.object.name == "console" && node.callee.property.name == "log") {
                for (let argument of node.arguments) {
                    if (argument.type == "Identifier") {
                        console.log(`GEN ${argument.name}: location ${argument.start}`)
                    }
                }
            }
        } else if (node.type == "WhileStatement") {
            walk(node.test, {
                enter(node) {
                    if (node.type == "Identifier") {
                        console.log(`GEN ${node.name}: location ${node.start}`)
                    }
                }
            })
        }
    }
});
