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
