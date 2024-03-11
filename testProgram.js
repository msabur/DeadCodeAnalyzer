// Calculating factorial
let input, output, i

input = 10
output = 1
i = input

while (i > 0) {
    output = output * i
    i = i - 1
}
console.log('the factorial of', input, 'is', output)

if (output > 100) {
  console.log('the factorial is greater than 100')
}  else {
  difference = 100 - output
  console.log('the factorial is', difference, ' less than 100')
}

// Dead code scenario
i = 23 // a dead assignment
i = 34
console.log('i is now equal to', i)

// Try/catch/finally
try {
  // assuming any statement here <may> throw an exception, but throw statements <must>
  i = 12
  i = 13
  throw "Oh no!"
  i = 14
} catch {
  console.log("Oh no!")
} finally {
  console.log('Finally!')
}

// Try/catch without finally
try {
  // assuming any statement here <may> throw an exception, but throw statements <must>
  i = 12
  i = 13/0
  i = 1923
  i = 14
} catch {
  console.log("No finally!")
}

console.log('Whew!')
