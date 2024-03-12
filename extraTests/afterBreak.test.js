let count, i
count = 10
i = 1
while(count > 0) {
    i = i * count
    count = count - 1
    console.log('the value of i is', i)
    if (i > 100) {
        break;
        i = 1; // this is unreachable due to the break
    } else {
        i = 100;
        break;
        console.log('i is', i) // unreachable due to the break
    }
    count = 1 // unreachable since both branches break
    console.log('cannot reach here!') // unreachable since both branches break
}

