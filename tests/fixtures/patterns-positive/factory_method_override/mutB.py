# POSITIVO (mutación B: Factory Method aplanado; cadena que instancia tipos).
def create_button(kind):
    if kind == "windows":
        return WindowsButton()
    elif kind == "web":
        return WebButton()
    raise ValueError("kind desconocido")
