// Fixture canónica: override-constructor / Factory Method (JavaScript).
class Dialog {
  createButton() {
    throw new Error("not implemented");
  }
}

class WindowsDialog extends Dialog {
  createButton() {
    return new WindowsButton();
  }
}

class WebDialog extends Dialog {
  createButton() {
    return new WebButton();
  }
}

// Control negativo: construye, pero NO es el único statement.
class BuggyDialog extends Dialog {
  createButton() {
    this.logCreation();
    return new WindowsButton();
  }
}
