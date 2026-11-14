//! A crate no lint flags.

use std::collections::BTreeMap;

/// Counts the words of a text.
pub fn count_words(text: &str) -> BTreeMap<&str, usize> {
    let mut counts = BTreeMap::new();
    for word in text.split_whitespace() {
        *counts.entry(word).or_insert(0) += 1;
    }
    counts
}

#[cfg(test)]
mod tests {
    use super::count_words;

    #[test]
    fn counts_each_word() {
        let counts = count_words("a a b");
        assert_eq!(counts.get("a").copied().unwrap(), 2);
    }
}
