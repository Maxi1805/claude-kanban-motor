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


# --- POSITIVO (mutacion A: clone-duplicate) ---
# Fixture canónica: similitud de interfaz (#9), SIN herencia común (Python).
class CreditCardPayment2:
    def pay(self, amount):
        pass

    def refund(self, amount):
        pass


class PayPalPayment2:
    def pay(self, amount):
        pass

    def refund(self, amount):
        pass


# Control negativo: solo 1 nombre en común (por debajo del umbral).
class Report2:
    def generate(self):
        pass

    def export(self):
        pass


class Widget2:
    def generate(self):
        pass

    def render(self):
        pass

