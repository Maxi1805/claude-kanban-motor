class GUIFactory:
    pass

class WinFactory(GUIFactory):
    def create_button(self):
        return WinButton()
    def create_checkbox(self):
        return WinCheckbox()

class MacFactory(GUIFactory):
    def create_button(self):
        return MacButton()
    def create_checkbox(self):
        return MacCheckbox()


# --- POSITIVO (mutacion A: clone-duplicate) ---
class GUIFactory2:
    pass

class WinFactory2(GUIFactory2):
    def create_button(self):
        return WinButton()
    def create_checkbox(self):
        return WinCheckbox()

class MacFactory2(GUIFactory2):
    def create_button(self):
        return MacButton()
    def create_checkbox(self):
        return MacCheckbox()

