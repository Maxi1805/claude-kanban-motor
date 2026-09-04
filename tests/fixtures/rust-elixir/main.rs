// Segundo archivo Rust de la fixture D3: un CONSUMIDOR, para que el grafo
// tenga algo que resolver entre archivos (referencias cruzadas, `use`, y
// llamadas a funciones libres — la única forma de llamada que hoy produce
// arista `calls`, ver el informe del frente).
use crate::shapes::{Dispatcher, EmailNotifier, Notifier, SmsNotifier};

pub fn build_dispatcher(address: String, number: String) -> Dispatcher {
    let mut dispatcher = Dispatcher::new();
    dispatcher.register(Box::new(EmailNotifier::new(address)));
    dispatcher.register(Box::new(SmsNotifier::new(number)));
    dispatcher
}

pub fn broadcast(dispatcher: &mut Dispatcher, message: &str) -> u32 {
    let sent = dispatcher.dispatch(message);
    if sent == 0 {
        return 0;
    }
    sent
}

pub fn run() -> u32 {
    let mut dispatcher = build_dispatcher(String::from("a@b.c"), String::from("+1"));
    let total = broadcast(&mut dispatcher, "hello");
    describe_total(total)
}

fn describe_total(total: u32) -> u32 {
    match total {
        0 => 0,
        1 => 1,
        _ => total,
    }
}
