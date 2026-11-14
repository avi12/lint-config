object Registry {
  val names = mutableListOf<String>()

  init { // flag
    names.add("first")
  }
}

class Plain {
  init {
    println("fine")
  }

  companion object {
    init { // flag
      println("loaded")
    }
  }
}
