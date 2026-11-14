fun check(a: Boolean, b: Boolean, x: Int): Int {
  val isReady = a && b
  if (isReady) {
    return 1
  }
  if (a && b) { // flag
    return 2
  }
  while (x > 3) { // flag
    return 3
  }
  if (!a) {
    return 4
  }
  val doubled = if (isReady) 1 else 2
  if (a || (x == 1 && b)) { // flag
    return 5
  }
  return x
}
