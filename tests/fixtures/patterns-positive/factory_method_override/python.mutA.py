# Fixture canónica: override-constructor / Factory Method (Python).
class Dialog:
    def create_button(self):
        raise NotImplementedError


class WindowsDialog(Dialog):
    def create_button(self):
        return WindowsButton()


class WebDialog(Dialog):
    def create_button(self):
        return WebButton()


# Control negativo: construye, pero NO es el único statement.
class BuggyDialog(Dialog):
    def create_button(self):
        self.log_creation()
        return WindowsButton()


# --- POSITIVO (mutacion A: clone-duplicate) ---
# Fixture canónica: override-constructor / Factory Method (Python).
class Dialog2:
    def create_button(self):
        raise NotImplementedError


class WindowsDialog2(Dialog2):
    def create_button(self):
        return WindowsButton()


class WebDialog2(Dialog2):
    def create_button(self):
        return WebButton()


# Control negativo: construye, pero NO es el único statement.
class BuggyDialog2(Dialog2):
    def create_button(self):
        self.log_creation()
        return WindowsButton()

