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


// --- POSITIVO (mutacion A: clone-duplicate) ---
// Fixture canónica: override-constructor / Factory Method (JavaScript).
class Dialog2 {
  createButton() {
    throw new Error("not implemented");
  }
}

class WindowsDialog2 extends Dialog2 {
  createButton() {
    return new WindowsButton();
  }
}

class WebDialog2 extends Dialog2 {
  createButton() {
    return new WebButton();
  }
}

// Control negativo: construye, pero NO es el único statement.
class BuggyDialog2 extends Dialog2 {
  createButton() {
    this.logCreation();
    return new WindowsButton();
  }
}

