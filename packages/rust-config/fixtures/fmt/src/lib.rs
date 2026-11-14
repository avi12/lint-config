//! Badly laid out on purpose: rustfmt must settle it in one pass.

use std::collections::BTreeMap;
use std::collections::BTreeSet;

pub struct Pair { pub left: u32, pub right: u32 }

/// Builds a pair and a long sentence of arguments so that the line has to wrap at one hundred columns.
pub fn build(left: u32, right: u32, label: &str, other_label: &str, third_label: &str) -> (Pair, String) {
    let pair = Pair { left: left, right: right };
    let text = format!("{label} {other_label} {third_label} and some more words to push it past the width");
    (pair, text)
}

pub fn maps() -> (BTreeMap<u32, u32>, BTreeSet<u32>) { (BTreeMap::new(), BTreeSet::new()) }
