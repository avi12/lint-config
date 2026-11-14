class EmptyCatchBlock {
  fun check() {
    try {
      error("bad")
    } catch (exception: IllegalStateException) {
    }
  }
}
