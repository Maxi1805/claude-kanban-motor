# Fixture canónica: Chain of Responsibility (Ruby).
# Positivo: reenvío CONDICIONAL (dentro de un if) al mismo mensaje ("handle")
# sobre un campo de la propia familia ("next") — a diferencia de Decorator
# (incondicional) y Composite (itera TODOS).
class Handler
  def initialize
    @next = nil
  end

  def set_next(handler)
    @next = handler
  end

  def handle(request)
    if @next
      @next.handle(request)
    end
  end
end

# Control negativo: chequeo condicional real, pero el mensaje reenviado NO
# coincide con el nombre del método contenedor — no es "el mismo mensaje,
# tal vez pasado al siguiente", es una operación distinta.
class Cache
  def initialize(logger)
    @logger = logger
  end

  def reset
    if @logger
      @logger.flush
    end
  end
end
