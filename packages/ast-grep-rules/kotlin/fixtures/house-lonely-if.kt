fun pick(a: Boolean, b: Boolean) {
  if (a) { // flag
    println("one")
  } else {
    if (b) {
      println("two")
    }
  }
  if (a) {
    println("one")
  } else {
    println("two")
    if (b) {
      println("three")
    }
  }
  if (a) {
    println("one")
  } else if (b) {
    println("two")
  }
}
