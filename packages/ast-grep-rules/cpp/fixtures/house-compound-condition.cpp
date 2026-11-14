int check(bool a, bool b, int x) {
  bool isReady = a && b;
  if (isReady) {
    return 1;
  }
  if (a && b) { // flag
    return 2;
  }
  while (x > 3) { // flag
    return 3;
  }
  if (!a) {
    return 4;
  }
  for (int i = 0; i < 10; ++i) {
    x += i;
  }
  if (a || (x == 1 && b)) { // flag
    return 5;
  }
  return x;
}
