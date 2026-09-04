# Fixture canónica: Proxy (Ruby). MISMA firma que Decorator (campo único de
# la propia familia + delegación), pero el campo se AUTO-INSTANCIA (#11) en
# vez de inyectarse, y NO TODOS los métodos son reenvío puro (paint agrega
# una traza antes de delegar) — la distinción real y barata frente a Decorator.
class ShapeProxy < Shape
  def initialize
    @real = RealShape.new
  end

  def area
    @real.area
  end

  def paint(color)
    puts "painting"
    @real.paint(color)
  end
end

# Control negativo: MISMO auto-instanciado, pero TODOS los métodos son
# reenvío puro (ningún control de acceso agregado) — un wrapper trivial, no
# un Proxy real; la regla lo excluye a propósito.
class PureWrapper < Shape
  def initialize
    @real = RealShape.new
  end

  def area
    @real.area
  end

  def paint(color)
    @real.paint(color)
  end
end


# --- POSITIVO (mutacion A: clone-duplicate) ---
# Fixture canónica: Proxy (Ruby). MISMA firma que Decorator (campo único de
# la propia familia + delegación), pero el campo se AUTO-INSTANCIA (#11) en
# vez de inyectarse, y NO TODOS los métodos son reenvío puro (paint agrega
# una traza antes de delegar) — la distinción real y barata frente a Decorator.
class ShapeProxy2 < Shape
  def initialize
    @real = RealShape.new
  end

  def area
    @real.area
  end

  def paint(color)
    puts "painting"
    @real.paint(color)
  end
end

# Control negativo: MISMO auto-instanciado, pero TODOS los métodos son
# reenvío puro (ningún control de acceso agregado) — un wrapper trivial, no
# un Proxy real; la regla lo excluye a propósito.
class PureWrapper2 < Shape
  def initialize
    @real = RealShape.new
  end

  def area
    @real.area
  end

  def paint(color)
    @real.paint(color)
  end
end

