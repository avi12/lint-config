fn check(a: bool, b: bool, x: i32) -> i32 {
    let is_ready = a && b;
    if is_ready {
        return 1;
    }
    if a && b { // flag
        return 2;
    }
    while x > 3 { // flag
        return 3;
    }
    if !a {
        return 4;
    }
    for i in 0..10 {
        let doubled = i * 2;
    }
    if a || (x == 1 && b) { // flag
        return 5;
    }
    x
}
