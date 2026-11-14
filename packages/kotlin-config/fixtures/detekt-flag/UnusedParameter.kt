class UnusedParameter {
  private fun check(unused: Int) = 1

  fun call() = check(1)
}
