//! Code clippy can fix: after `clippy --fix` and `cargo fmt` a second pass changes nothing.

/// Holds two values.
pub struct Holder {
    /// The first value.
    pub first: u32,
    /// The second value.
    pub second: u32,
}

/// Builds a holder with redundant field names.
pub fn build(first: u32, second: u32) -> Holder {
    Holder { first: first, second: second }
}

/// Doubles every value with a redundant closure and a needless return.
pub fn doubled(values: Vec<u32>) -> Vec<u32> {
    return values.into_iter().map(|value| double(value)).collect();
}

/// Doubles one value.
pub fn double(value: u32) -> u32 {
    value.saturating_mul(2)
}
