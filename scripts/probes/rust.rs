use std::collections::HashMap;
use std::fmt;

pub trait Shape {
    fn area(&self) -> f64;

    fn name(&self) -> String {
        String::from("shape")
    }
}

pub struct Circle {
    radius: f64,
    label: String,
}

pub enum Kind {
    Round,
    Square(u8),
}

impl Circle {
    pub fn new(radius: f64, label: String) -> Self {
        Circle { radius, label }
    }

    fn describe(&self, kind: &str) -> String {
        match kind {
            "circle" => String::from("circle"),
            "square" => String::from("square"),
            _ => String::from("unknown"),
        }
    }
}

impl Shape for Circle {
    fn area(&self) -> f64 {
        3.14 * self.radius * self.radius
    }
}

impl fmt::Display for Circle {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.label)
    }
}

pub fn loopy(items: &[i32]) -> i32 {
    let mut total = 0;
    for item in items {
        if *item > 0 {
            total += item;
        } else if *item == 0 {
            total += 1;
        } else {
            total -= item;
        }
    }
    while total > 100 {
        total -= 10;
    }
    loop {
        if total == 0 {
            break;
        }
        total -= 1;
    }
    let doubled: Vec<i32> = items.iter().map(|x| x * 2).collect();
    let flag = if total > 0 { 1 } else { 0 };
    total + doubled.len() as i32 + flag
}

pub fn risky(path: &str) -> Result<String, std::io::Error> {
    let data = std::fs::read_to_string(path)?;
    let mut map: HashMap<String, i32> = HashMap::new();
    map.insert(data.clone(), 1);
    match map.get(&data) {
        Some(v) => Ok(format!("{}", v)),
        None => Ok(data),
    }
}
