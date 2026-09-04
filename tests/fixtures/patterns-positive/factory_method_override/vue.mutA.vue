<script>
// LÍMITE DECLARADO: la Composition API (el estilo idiomático de Vue) no
// tiene herencia de clases — no hay "override" de nada. Esta relación SOLO
// existe en un .vue si alguien escribe una clase JS/TS DENTRO del <script>
// (válido pero no idiomático) — se prueba esa forma acá para no inventar un
// caso que no ocurre en código Vue real; ver generalidad.md por el límite.
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

// LÍMITE DECLARADO: la Composition API (el estilo idiomático de Vue) no
// tiene herencia de clases — no hay "override" de nada. Esta relación SOLO
// existe en un .vue si alguien escribe una clase JS/TS DENTRO del <script>
// (válido pero no idiomático) — se prueba esa forma acá para no inventar un
// caso que no ocurre en código Vue real; ver generalidad.md por el límite.
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

</script>

<template>
  <div />
</template>
