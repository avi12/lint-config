#include "ok.h"

namespace ok {

void Counter::Add(int amount) {
  total_ += amount;
}

int Counter::Total() const {
  return total_;
}

int Clamp(int value, int limit) {
  if (value > limit) {
    return limit;
  }
  return value;
}

}  // namespace ok
