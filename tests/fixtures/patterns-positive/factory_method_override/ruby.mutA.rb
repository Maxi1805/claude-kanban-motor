# Fixture canónica: override-constructor / Factory Method (Ruby).
class Dialog
  def create_button
    raise NotImplementedError
  end
end

class WindowsDialog < Dialog
  def create_button
    return WindowsButton.new
  end
end

class WebDialog < Dialog
  def create_button
    return WebButton.new
  end
end

# Control negativo: el override construye, pero NO es el único statement —
# la forma exige `return new X(...)` como cuerpo COMPLETO, no una línea más
# entre varias.
class BuggyDialog < Dialog
  def create_button
    log_creation
    return WindowsButton.new
  end
end


# --- POSITIVO (mutacion A: clone-duplicate) ---
# Fixture canónica: override-constructor / Factory Method (Ruby).
class Dialog2
  def create_button
    raise NotImplementedError
  end
end

class WindowsDialog2 < Dialog2
  def create_button
    return WindowsButton.new
  end
end

class WebDialog2 < Dialog2
  def create_button
    return WebButton.new
  end
end

# Control negativo: el override construye, pero NO es el único statement —
# la forma exige `return new X(...)` como cuerpo COMPLETO, no una línea más
# entre varias.
class BuggyDialog2 < Dialog2
  def create_button
    log_creation
    return WindowsButton.new
  end
end

