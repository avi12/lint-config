// A "flag:" comment names the clang-tidy checks that must fire on its own line,
// and no other check may fire anywhere in this file.
namespace {

class Base {  // flag: cppcoreguidelines-special-member-functions,cppcoreguidelines-virtual-class-destructor
 public:
  Base() = default;
  Base(const Base&) = default;
  virtual void Run();
};

class Derived : public Base {  // flag: cppcoreguidelines-virtual-class-destructor
 public:
  void Run();  // flag: modernize-use-override
};

struct Wrapper {
  Wrapper(int size);  // flag: google-explicit-constructor
  int size = 0;
};

typedef unsigned int Index;  // flag: modernize-use-using

int g_counter = 0;  // flag: cppcoreguidelines-avoid-non-const-global-variables

int bad_function_name(int value) {  // flag: readability-identifier-naming
  return value;
}

int ShortNames(int a) {  // flag: readability-identifier-length
  return a;
}

int MagicNumber(int value) {
  return value * 37;  // flag: readability-magic-numbers
}

int ElseAfterReturn(int value) {
  if (value > 0) {
    return 1;
  } else {  // flag: readability-else-after-return
    return 2;
  }
}

int NoBraces(int value) {
  if (value > 0)  // flag: google-readability-braces-around-statements,readability-braces-around-statements
    return 1;
  return 0;
}

bool ImplicitBool(int value) {
  return value;  // flag: readability-implicit-bool-conversion
}

bool Simplify(bool isReady) {
  if (isReady) {
    return true;  // flag: readability-simplify-boolean-expr
  } else {  // flag: readability-else-after-return
    return false;
  }
}

int CStyleCast(double value) {
  return (int)value;  // flag: google-readability-casting,modernize-avoid-c-style-cast
}

int* ConstCast(const int* pointer) {
  return const_cast<int*>(pointer);  // flag: cppcoreguidelines-pro-type-const-cast
}

long ReinterpretCast(int* pointer) {
  return reinterpret_cast<long>(pointer);  // flag: cppcoreguidelines-pro-type-reinterpret-cast
}

int* RawNew() {
  int* made = new int(1);  // flag: cppcoreguidelines-owning-memory
  return made;
}

void* NullInteger() {
  void* none = 0;  // flag: modernize-use-nullptr
  return none;
}

int Uninitialised() {
  int value;  // flag: cppcoreguidelines-init-variables
  value = 1;
  return value;
}

int UnusedParameter(int used, int unused) {  // flag: misc-unused-parameters
  return used;
}

int NeverChanged() {
  int value = 1;  // flag: misc-const-correctness
  return value;
}

int TwoAtOnce() {
  const int first = 1, second = 2;  // flag: readability-isolate-declaration
  return first + second;
}

int DeepNesting(int value) {  // flag: readability-function-cognitive-complexity,readability-function-size
  int total = 0;
  for (int i = 0; i < value; ++i) {
    if (i > 1) {
      for (int j = 0; j < i; ++j) {
        if (j > 1) {
          total += j;
        }
      }
    }
  }
  return total;
}

int BranchClone(int value) {
  if (value > 0) {  // flag: bugprone-branch-clone
    return 1;
  } else if (value < 0) {  // flag: readability-else-after-return
    return 1;
  }
  return 0;
}

}  // namespace
