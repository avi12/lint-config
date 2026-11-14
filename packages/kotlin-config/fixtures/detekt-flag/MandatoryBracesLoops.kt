class MandatoryBracesLoops {
  fun check(items: List<Int>): Int {
    var total = 0
    for (item in items)
      total += item
    return total
  }
}
