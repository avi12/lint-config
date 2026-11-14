fun forgive(text: String?, other: String?): Int {
  val length = text!!.length // flag
  val safe = other?.length ?: 0
  return length + safe
}
