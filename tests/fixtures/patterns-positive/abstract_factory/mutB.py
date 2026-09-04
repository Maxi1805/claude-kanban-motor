# POSITIVO (mutación B: Abstract Factory aplanada en 2 cadenas condicionales paralelas).
def create_button(kind):
    if kind == "win":
        return WinButton()
    elif kind == "mac":
        return MacButton()
    raise ValueError("kind desconocido")


def create_checkbox(kind):
    if kind == "win":
        return WinCheckbox()
    elif kind == "mac":
        return MacCheckbox()
    raise ValueError("kind desconocido")
