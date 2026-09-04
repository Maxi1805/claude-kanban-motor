// Fixture D3 (Ola 11b) — Rust real, no un archivo de juguete: trait con método
// por defecto, dos `impl` del mismo trait, un `impl` inherente con
// constructor-por-convención (`new`), match, guardas, y una función larga con
// varias ramas. Sirve para ver qué deriva el pipeline SIN una sola entrada de
// léxico por lenguaje.
use std::collections::HashMap;
use std::fmt;

pub trait Notifier {
    fn notify(&self, message: &str) -> String;

    fn channel(&self) -> String {
        String::from("generic")
    }
}

pub struct EmailNotifier {
    address: String,
    retries: u32,
}

pub struct SmsNotifier {
    number: String,
    retries: u32,
}

impl EmailNotifier {
    pub fn new(address: String) -> Self {
        EmailNotifier { address, retries: 3 }
    }

    fn envelope(&self, message: &str) -> String {
        format!("<{}> {}", self.address, message)
    }
}

impl SmsNotifier {
    pub fn new(number: String) -> Self {
        SmsNotifier { number, retries: 1 }
    }

    fn envelope(&self, message: &str) -> String {
        format!("[{}] {}", self.number, message)
    }
}

impl Notifier for EmailNotifier {
    fn notify(&self, message: &str) -> String {
        let mut out = self.envelope(message);
        let mut attempt = 0;
        while attempt < self.retries {
            attempt += 1;
            if attempt == self.retries {
                out.push_str(" (last)");
            }
        }
        out
    }

    fn channel(&self) -> String {
        String::from("email")
    }
}

impl Notifier for SmsNotifier {
    fn notify(&self, message: &str) -> String {
        let mut out = self.envelope(message);
        let mut attempt = 0;
        while attempt < self.retries {
            attempt += 1;
            if attempt == self.retries {
                out.push_str(" (last)");
            }
        }
        out
    }

    fn channel(&self) -> String {
        String::from("sms")
    }
}

impl fmt::Display for EmailNotifier {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.address)
    }
}

pub struct Dispatcher {
    notifiers: Vec<Box<dyn Notifier>>,
    stats: HashMap<String, u32>,
}

impl Dispatcher {
    pub fn new() -> Self {
        Dispatcher {
            notifiers: Vec::new(),
            stats: HashMap::new(),
        }
    }

    pub fn register(&mut self, notifier: Box<dyn Notifier>) {
        self.notifiers.push(notifier);
    }

    pub fn dispatch(&mut self, message: &str) -> u32 {
        let mut sent = 0;
        for notifier in &self.notifiers {
            let channel = notifier.channel();
            let body = notifier.notify(message);
            if body.is_empty() {
                continue;
            }
            let entry = self.stats.entry(channel).or_insert(0);
            *entry += 1;
            sent += 1;
        }
        sent
    }

    pub fn describe(&self, kind: &str) -> String {
        match kind {
            "email" => String::from("email channel"),
            "sms" => String::from("sms channel"),
            "push" => String::from("push channel"),
            _ => String::from("unknown channel"),
        }
    }
}
