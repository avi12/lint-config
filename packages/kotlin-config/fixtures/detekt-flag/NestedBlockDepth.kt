class NestedBlockDepth {
  fun check(isA: Boolean, isB: Boolean, isC: Boolean, isD: Boolean): Int {
    if (isA) {
      if (isB) {
        if (isC) {
          if (isD) {
            return 1
          }
        }
      }
    }
    return 0
  }
}
