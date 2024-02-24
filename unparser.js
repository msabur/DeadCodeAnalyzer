import { argv } from 'node:process'
import { readFileSync, writeFile } from 'node:fs'
import { generate } from 'astring'

let inputFilename = "testProgram.json"
if (argv.length > 2) {
    inputFilename = argv[2]
}

let inputAST = readFileSync(inputFilename)
let ast = JSON.parse(inputAST)
let outputCode = generate(ast)

let outputFilename = "1_" + inputFilename.slice(0, -2)
writeFile(outputFilename, outputCode, (err) => {if (err) throw err;})