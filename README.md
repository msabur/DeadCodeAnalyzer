# DeadCodeAnalyzer
A tool that can analyze a program to find unreachable statements and dead variables (variables which are defined but never used afterwards). It works with a limited subset of JavaScript that includes variable declaration/assignment, if/else statements, continue/break, while loops, try/catch blocks, and throw statements. 

The file "Project Documentation.docx" contains details on the analyses implemented.

This was a group project with [Judah Rowe](https://github.com/JudahRowe) for the class COP 5021 (Program Analysis) at the University of Central Florida.

## Usage
Assuming Node.js and npm are installed.

To use our tool:

1. Open a terminal in this directory
2. Run command `npm install`
3. Run command `node analyzer.js <inputFilename>`, replacing `<inputFilename>` with the desired input filename

Example:

```
> node analyzer.js  testProgram.js
Unreachable statement found: ExpressionStatement at char offset 611
Unreachable statement found: ExpressionStatement at char offset 1002
Unreachable statement found: ExpressionStatement at char offset 1070
Dead assignment found: i at char offset 388
Dead assignment found: i at char offset 576
Dead assignment found: i at char offset 585
Dead assignment found: i at char offset 984
```
