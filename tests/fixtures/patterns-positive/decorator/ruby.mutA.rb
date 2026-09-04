# Fixture canónica: Decorator (Ruby, sin anotaciones de tipo).
# Positivo: ColorDecorator envuelve un Shape inyectado y delega su interfaz.
class ColorDecorator < Shape
  def initialize(shape)
    @shape = shape
  end

  def area
    @shape.area
  end

  def describe
    @shape.describe
  end
end

# Control negativo: un colaborador cualquiera (Logger), NO de la propia
# familia, usado con un nombre de método DISTINTO al del contenedor — no
# debe reconocerse como Decorator (ni por invocación homónima ni por
# convención léxica de rol).
class ReportGenerator
  def initialize(logger)
    @logger = logger
  end

  def generate
    @logger.info("generating")
  end
end


# --- POSITIVO (mutacion A: clone-duplicate) ---
# Fixture canónica: Decorator (Ruby, sin anotaciones de tipo).
# Positivo: ColorDecorator2 envuelve un Shape inyectado y delega su interfaz.
class ColorDecorator2 < Shape
  def initialize(shape)
    @shape = shape
  end

  def area
    @shape.area
  end

  def describe
    @shape.describe
  end
end

# Control negativo: un colaborador cualquiera (Logger), NO de la propia
# familia, usado con un nombre de método DISTINTO al del contenedor — no
# debe reconocerse como Decorator (ni por invocación homónima ni por
# convención léxica de rol).
class ReportGenerator2
  def initialize(logger)
    @logger = logger
  end

  def generate
    @logger.info("generating")
  end
end

