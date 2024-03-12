let i
i = 20

try {
    i = 210 * i
    console.log(i)
    throw "football"
    console.log('Just threw the football') // unreachable due to throw
} catch {
    console.log('caught football')
} finally {
    console.log('finally')
}
