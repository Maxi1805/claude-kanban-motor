# Fixture canónica: parámetro invocable (#18, modismo `yield` de Ruby) y SAM (#23).
class Collection
  def initialize(items)
    @items = items
  end

  # Positivo #18: usa `yield` — el parámetro invocable IMPLÍCITO de Ruby, sin
  # que exista un parámetro nombrado en la firma.
  def each_valid
    @items.each { |item| yield item if valid?(item) }
  end

  def valid?(item)
    !item.nil?
  end
end

# Control negativo #18: el "callback" se guarda pero NUNCA se invoca en este
# método — no es parámetro invocable, es solo almacenado.
class EventBus
  def initialize
    @subscribers = []
  end

  def subscribe(callback)
    @subscribers << callback
  end
end

# Positivo #23 (SAM): un solo método público, nombre genérico.
class PrintCommand
  def execute
    puts "printing"
  end
end
