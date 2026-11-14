class ComplexCondition {
  fun check(isA: Boolean, isB: Boolean, isC: Boolean, isD: Boolean): Int {
    if (isA && isB || isC && isD) {
      return 1
    }
    return 0
  }
}
