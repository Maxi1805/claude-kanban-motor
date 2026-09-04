# Fixture canónica: similitud de interfaz (#9), SIN herencia común (Ruby).
class CreditCardPayment
  def pay(amount)
  end

  def refund(amount)
  end
end

class PayPalPayment
  def pay(amount)
  end

  def refund(amount)
  end
end

# Control negativo: solo 1 nombre en común (por debajo del umbral) — no es
# una familia por forma, es una coincidencia de nombre aislada.
class Report
  def generate
  end

  def export
  end
end

class Widget
  def generate
  end

  def render
  end
end
