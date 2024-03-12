let count, i
count = 10
i = 1
while(count > 0) {
    i = i * count
    count = count - 1
    console.log('the value of i is', i)
    continue
    count = 1 // this is unreachable due to the continue
}

try {
    i = 210 * i
    console.log(i)
    throw "football"
} catch {
    console.log('caught football')
}
