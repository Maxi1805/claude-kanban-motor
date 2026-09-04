# Fixture canónica: Null Object / override trivial (Ruby).
# Positivo: NullLogger tiene el mismo método ("log") que ConsoleLogger, pero
# con cuerpo vacío — trivial DENTRO de una familia por lo demás activa.
class ConsoleLogger
  def log(msg)
    puts msg
  end
end

class NullLogger
  def log(msg)
  end
end

# Control negativo: método corto, pero SIN familia con hermanos activos —
# es solo un método sin implementar todavía, no un Null Object.
class ReportOptions
  def middle_name
  end
end
