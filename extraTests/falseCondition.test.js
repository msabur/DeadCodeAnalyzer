let i
i = 0
while(false) {
    // unreachable body
    i = i + 1
    console.log('iteration ', i)
}

if (false) {
    // unreachable then
    i = 0
} else {
    console.log('Welcome to the else block!')
}

if (true) {
    console.log('Welcome to the then block!')
} else {
    // unreachable else
    console.log('Cannot enter the else block!')
}
