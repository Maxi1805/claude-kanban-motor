# Fixture canónica: similitud de interfaz (#9), SIN herencia común (Python).
class CreditCardPayment:
    def pay(self, amount):
        pass

    def refund(self, amount):
        pass


class PayPalPayment:
    def pay(self, amount):
        pass

    def refund(self, amount):
        pass


# Control negativo: solo 1 nombre en común (por debajo del umbral).
class Report:
    def generate(self):
        pass

    def export(self):
        pass


class Widget:
    def generate(self):
        pass

    def render(self):
        pass
