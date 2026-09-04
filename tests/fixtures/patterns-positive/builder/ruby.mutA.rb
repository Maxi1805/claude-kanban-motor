# Fixture canónica: Builder / encadenamiento fluido (Ruby).
class PizzaBuilder
  def initialize
    @toppings = []
  end

  def set_size(size)
    @size = size
    self
  end

  def add_topping(topping)
    @toppings << topping
    self
  end
end

# Control negativo: mismos pasos, pero SIN encadenamiento (no retorna self).
class PizzaOrder
  def initialize
    @toppings = []
  end

  def set_size(size)
    @size = size
  end

  def add_topping(topping)
    @toppings << topping
  end
end


# --- POSITIVO (mutacion A: clone-duplicate) ---
# Fixture canónica: Builder / encadenamiento fluido (Ruby).
class PizzaBuilder2
  def initialize
    @toppings = []
  end

  def set_size(size)
    @size = size
    self
  end

  def add_topping(topping)
    @toppings << topping
    self
  end
end

# Control negativo: mismos pasos, pero SIN encadenamiento (no retorna self).
class PizzaOrder2
  def initialize
    @toppings = []
  end

  def set_size(size)
    @size = size
  end

  def add_topping(topping)
    @toppings << topping
  end
end

