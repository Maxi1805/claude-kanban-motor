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
