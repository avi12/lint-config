//! Lines that end in a flag comment, or follow a flag-next comment, must raise exactly the lints it names, and no other line may

/// Not flagged: documented, named, early return.
pub fn clean(value: Option<u32>) -> u32 {
    let Some(inner) = value else {
        return 0;
    };
    inner
}

pub fn undocumented() {} // flag: missing_docs

/// Flagged: unwrap, expect, panic.
pub fn unchecked(value: Option<u32>) -> u32 {
    let first = value.unwrap(); // flag: clippy::unwrap_used
    let second = value.expect("present"); // flag: clippy::expect_used
    if first > second { // flag: clippy::manual_assert
        panic!("order"); // flag: clippy::panic
    }
    first
}

/// Flagged: indexing.
pub fn indexing(values: &[u32]) -> u32 {
    values[0] // flag: clippy::indexing_slicing
}

/// Flagged: casts.
pub fn casts(value: u64) -> u32 {
    value as u32 // flag: clippy::as_conversions, clippy::cast_possible_truncation
}

/// Flagged: unsafe.
pub fn danger(pointer: *const u32) -> u32 {
    unsafe { *pointer } // flag: unsafe_code, clippy::undocumented_unsafe_blocks, clippy::not_unsafe_ptr_arg_deref
}

/// Flagged: suppression.
#[allow(dead_code)] // flag: clippy::allow_attributes, clippy::allow_attributes_without_reason
fn suppressed() {}

/// Flagged: an expectation without a reason.
#[expect(dead_code)] // flag: clippy::allow_attributes_without_reason
fn expected() {}

/// Flagged: placeholders.
pub fn placeholders() {
    todo!(); // flag: clippy::todo
}

/// Flagged: more placeholders.
pub fn more_placeholders() {
    unimplemented!(); // flag: clippy::unimplemented
}

/// Flagged: debugging.
pub fn debugging() {
    dbg!(1); // flag: clippy::dbg_macro
}

/// Flagged: short names.
pub fn names(ab: u32) -> u32 { // flag: clippy::min_ident_chars
    ab
}

/// Flagged: a needless return and an else after a return.
pub fn returns(value: u32) -> u32 {
    if value > 1 {
        return 1; // flag: clippy::needless_return
        // flag-next: clippy::redundant_else
    } else {
        return value; // flag: clippy::needless_return
    }
}

/// Flagged: a collapsible else if.
pub fn collapsible(value: u32) -> u32 {
    if value > 1 {
        1
        // flag-next: clippy::collapsible_else_if
    } else {
        if value > 0 {
            2
        } else {
            3
        }
    }
}

/// Flagged: too many arguments.
pub fn many(first: u32, second: u32, third: u32, fourth: u32, fifth: u32, sixth: u32) -> u32 { // flag: clippy::too_many_arguments
    first + second + third + fourth + fifth + sixth
}

/// Flagged: unused things.
pub fn unused() {
    let mut mutable = 1; // flag: unused_mut
    let unread = 2; // flag: unused_variables
    std::collections::HashMap::<u32, u32>::new(); // flag: unused_must_use
    let _ = std::hint::black_box(mutable);
}

/// Flagged: a function with too many branches.
pub fn deep(value: u32) -> u32 { // flag: clippy::cognitive_complexity
    let mut total = 0;
    if value == 1 {
        total += 1;
    }
    if value == 2 {
        total += 2;
    }
    if value == 3 {
        total += 3;
    }
    if value == 4 {
        total += 4;
    }
    if value == 5 {
        total += 5;
    }
    if value == 6 {
        total += 6;
    }
    if value == 7 {
        total += 7;
    }
    if value == 8 {
        total += 8;
    }
    if value == 9 {
        total += 9;
    }
    if value == 10 {
        total += 10;
    }
    if value == 11 {
        total += 11;
    }
    if value == 12 {
        total += 12;
    }
    if value == 13 {
        total += 13;
    }
    if value == 14 {
        total += 14;
    }
    if value == 15 {
        total += 15;
    }
    if value == 16 {
        total += 16;
    }
    if value == 17 {
        total += 17;
    }
    if value == 18 {
        total += 18;
    }
    if value == 19 {
        total += 19;
    }
    if value == 20 {
        total += 20;
    }
    if value == 21 {
        total += 21;
    }
    if value == 22 {
        total += 22;
    }
    total
}

/// Flagged: an index loop.
pub fn ranges(values: &[u32]) -> u32 {
    let mut total = 0;
    for position in 0..values.len() { // flag: clippy::needless_range_loop
        total += values[position]; // flag: clippy::indexing_slicing
    }
    total
}

/// Flagged: a function too long.
pub fn long() { // flag: clippy::too_many_lines
    std::hint::black_box(0);
    std::hint::black_box(1);
    std::hint::black_box(2);
    std::hint::black_box(3);
    std::hint::black_box(4);
    std::hint::black_box(5);
    std::hint::black_box(6);
    std::hint::black_box(7);
    std::hint::black_box(8);
    std::hint::black_box(9);
    std::hint::black_box(10);
    std::hint::black_box(11);
    std::hint::black_box(12);
    std::hint::black_box(13);
    std::hint::black_box(14);
    std::hint::black_box(15);
    std::hint::black_box(16);
    std::hint::black_box(17);
    std::hint::black_box(18);
    std::hint::black_box(19);
    std::hint::black_box(20);
    std::hint::black_box(21);
    std::hint::black_box(22);
    std::hint::black_box(23);
    std::hint::black_box(24);
    std::hint::black_box(25);
    std::hint::black_box(26);
    std::hint::black_box(27);
    std::hint::black_box(28);
    std::hint::black_box(29);
    std::hint::black_box(30);
    std::hint::black_box(31);
    std::hint::black_box(32);
    std::hint::black_box(33);
    std::hint::black_box(34);
    std::hint::black_box(35);
    std::hint::black_box(36);
    std::hint::black_box(37);
    std::hint::black_box(38);
    std::hint::black_box(39);
    std::hint::black_box(40);
    std::hint::black_box(41);
    std::hint::black_box(42);
    std::hint::black_box(43);
    std::hint::black_box(44);
    std::hint::black_box(45);
    std::hint::black_box(46);
    std::hint::black_box(47);
    std::hint::black_box(48);
    std::hint::black_box(49);
    std::hint::black_box(50);
    std::hint::black_box(51);
    std::hint::black_box(52);
    std::hint::black_box(53);
    std::hint::black_box(54);
    std::hint::black_box(55);
    std::hint::black_box(56);
    std::hint::black_box(57);
    std::hint::black_box(58);
    std::hint::black_box(59);
    std::hint::black_box(60);
    std::hint::black_box(61);
    std::hint::black_box(62);
    std::hint::black_box(63);
    std::hint::black_box(64);
    std::hint::black_box(65);
    std::hint::black_box(66);
    std::hint::black_box(67);
    std::hint::black_box(68);
    std::hint::black_box(69);
    std::hint::black_box(70);
    std::hint::black_box(71);
    std::hint::black_box(72);
    std::hint::black_box(73);
    std::hint::black_box(74);
    std::hint::black_box(75);
    std::hint::black_box(76);
    std::hint::black_box(77);
    std::hint::black_box(78);
    std::hint::black_box(79);
    std::hint::black_box(80);
    std::hint::black_box(81);
    std::hint::black_box(82);
    std::hint::black_box(83);
    std::hint::black_box(84);
    std::hint::black_box(85);
    std::hint::black_box(86);
    std::hint::black_box(87);
    std::hint::black_box(88);
    std::hint::black_box(89);
    std::hint::black_box(90);
    std::hint::black_box(91);
    std::hint::black_box(92);
    std::hint::black_box(93);
    std::hint::black_box(94);
    std::hint::black_box(95);
    std::hint::black_box(96);
    std::hint::black_box(97);
    std::hint::black_box(98);
    std::hint::black_box(99);
    std::hint::black_box(100);
    std::hint::black_box(101);
    std::hint::black_box(102);
    std::hint::black_box(103);
    std::hint::black_box(104);
}

mod inner {
    pub fn hidden() {} // flag: unreachable_pub, dead_code
}

/// Flagged: naming.
pub struct bad_type; // flag: non_camel_case_types

/// Flagged: naming.
pub fn BadFunction() {} // flag: non_snake_case

/// Flagged: naming.
pub const bad_constant: u32 = 1; // flag: non_upper_case_globals

fn never_called() {} // flag: dead_code

#[cfg(test)]
mod tests {
    #[test]
    fn tests_may_unwrap() {
        let value: Option<u32> = std::hint::black_box(Some(1));
        let value = value.unwrap();
        assert_eq!(value, 1);
    }
}
