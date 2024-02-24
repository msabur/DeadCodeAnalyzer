import { argv } from 'node:process'
import { readFileSync, writeFile } from 'node:fs'
import * as acorn from "acorn"

let inputFilename = "testProgram.js"
if (argv.length > 2) {
    inputFilename = argv[2]
}

let inputCode = readFileSync(inputFilename)

let ast = JSON.stringify(acorn.parse(inputCode, { ecmaVersion: 2023 }))

let outputFilename = inputFilename + "on"
writeFile(outputFilename, ast, (err) => {if (err) throw err;})