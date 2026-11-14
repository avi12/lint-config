fun pick(a: Boolean, b: Boolean): Int {
  if (a) { // flag
    return 1
  } else {
    println("other")
  }
  if (b) return 2 else println("x") // flag
  if (a) {
    println("one")
  } else {
    println("two")
  }
  if (a) {
    return 3
  } else if (b) {
    println("three")
  }
  if (b) {
    return 4
  }
  return 5
}
