class UnsafeCallOnNullableType {
  fun check(value: String?) = value!!.length
}
