class Panel {
  public bool IsOpen { get; set; }
  public bool Visible { get; set; } // flag
  private bool hasFocus;
  private bool focused; // flag

  void Toggle(bool enabled, bool canClose) { // flag
    bool ready = true; // flag
    bool isDone = false;
    int total = 3;
  }
}
