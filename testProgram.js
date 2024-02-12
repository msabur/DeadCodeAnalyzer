let input, output, i, condition, update

// Calculating factorial
input = 10
output = 1
i = input
while (i > 0) {
    output = output * i
    i = i - 1
}
console.log('the factorial of', input, 'is', output)

// Dead code scenario
i = 23 // a dead assignment
i = 34
console.log('i is now equal to', i)

// Testing IfStatement and UpdateExpression node types for gen/kill variables
condition = 1
if (condition > 0) {
   ++update
}

// Try/catch
try {
   throw 1
} catch {
   console.log('error')
}
