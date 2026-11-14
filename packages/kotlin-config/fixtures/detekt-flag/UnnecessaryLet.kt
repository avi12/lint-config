class UnnecessaryLet {
  fun check(value: String) = value.let { it.length }
}
