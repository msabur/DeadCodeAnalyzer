let acorn = require("acorn");
console.log(acorn.parse("1 + 1", {ecmaVersion: 2023}));

let jsx = require("acorn-jsx");
let JSXParser = acorn.Parser.extend(jsx());
console.log(JSXParser.parse("foo(<bar/>)", {ecmaVersion: 2023}))
