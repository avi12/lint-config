const LIMIT: u32 = 4096;
static RATE: f64 = 0.75;

#[derive(Clone)]
enum Level {
    Low = 10,
}

fn size(x: i32) -> i32 {
    let twice = x * 2;
    let step = x - 1;
    let zero = 0u8;
    let bytes = [0u8; 16];
    let scaled = x * 42; // flag
    let ratio = 0.5; // flag
    let hex = 0xFF; // flag
    println!("{}", 100);
    twice + step + scaled
}
