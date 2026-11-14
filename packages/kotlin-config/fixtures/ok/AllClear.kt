/** Every pattern the house rules want, written the way they ask. */
class AllClear {
  private val limit = SIZE_LIMIT

  /** Whether the value is within the limit. */
  fun isWithin(value: Int): Boolean {
    val isOver = value > limit
    if (isOver) {
      return false
    }

    return value * 2 > 0
  }

  /** The length, or zero for an absent value. */
  fun length(value: String?) = value?.length ?: 0

  /** The doubled value; TODO(avi): extend. */
  fun double(value: Int) = value * 2

  private companion object {
    const val SIZE_LIMIT = 37
  }
}

/** The colours. */
enum class Colour {
  RED,
  GREEN
}
