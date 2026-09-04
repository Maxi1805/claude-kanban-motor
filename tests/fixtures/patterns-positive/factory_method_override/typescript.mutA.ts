// Fixture canónica: override-constructor / Factory Method (TypeScript).
abstract class Dialog {
  abstract createButton(): Button;
}

class WindowsDialog extends Dialog {
  createButton(): Button {
    return new WindowsButton();
  }
}

class WebDialog extends Dialog {
  createButton(): Button {
    return new WebButton();
  }
}

// Control negativo: construye, pero NO es el único statement.
class BuggyDialog extends Dialog {
  createButton(): Button {
    this.logCreation();
    return new WindowsButton();
  }
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
// Fixture canónica: override-constructor / Factory Method (TypeScript).
abstract class Dialog2 {
  abstract createButton(): Button;
}

class WindowsDialog2 extends Dialog2 {
  createButton(): Button {
    return new WindowsButton();
  }
}

class WebDialog2 extends Dialog2 {
  createButton(): Button {
    return new WebButton();
  }
}

// Control negativo: construye, pero NO es el único statement.
class BuggyDialog2 extends Dialog2 {
  createButton(): Button {
    this.logCreation();
    return new WindowsButton();
  }
}

