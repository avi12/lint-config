#ifndef OK_H_
#define OK_H_

namespace ok {

constexpr int kRetryLimit = 5;

class Counter {
 public:
  Counter() = default;
  Counter(const Counter&) = delete;
  Counter(Counter&&) = delete;
  Counter& operator=(const Counter&) = delete;
  Counter& operator=(Counter&&) = delete;
  virtual ~Counter() = default;

  void Add(int amount);
  [[nodiscard]] int Total() const;

 private:
  int total = 0;
};

[[nodiscard]] int Clamp(int value, int limit);

}  // namespace ok

#endif  // OK_H_
