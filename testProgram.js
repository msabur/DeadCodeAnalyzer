let input, output, i

// Calculating factorial
input = 10, output = 1, i = input
while (i > 0) {
    output = output * i
    i = i - 1
}
console.log('the factorial of', input, 'is', output)

// Dead code scenario
i = 23 // a dead assignment
i = 34
console.log('i is now equal to', i)
