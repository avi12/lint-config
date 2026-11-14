class Forgiving {
  int Run(string? text, string? other) {
    var length = text!.Length; // flag
    var safe = other?.Length ?? 0;
    var increment = 1;
    increment++;
    return length + safe + increment;
  }
}
