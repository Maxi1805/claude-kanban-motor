class GUIFactory
end

class WinFactory < GUIFactory
  def create_button
    WinButton.new
  end
  def create_checkbox
    WinCheckbox.new
  end
end

class MacFactory < GUIFactory
  def create_button
    MacButton.new
  end
  def create_checkbox
    MacCheckbox.new
  end
end


# --- POSITIVO (mutacion A: clone-duplicate) ---
class GUIFactory2
end

class WinFactory2 < GUIFactory2
  def create_button
    WinButton.new
  end
  def create_checkbox
    WinCheckbox.new
  end
end

class MacFactory2 < GUIFactory2
  def create_button
    MacButton.new
  end
  def create_checkbox
    MacCheckbox.new
  end
end

