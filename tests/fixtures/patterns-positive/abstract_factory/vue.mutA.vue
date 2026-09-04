<script>
class GUIFactory {}
class WinFactory extends GUIFactory {
  createButton() { return new WinButton(); }
  createCheckbox() { return new WinCheckbox(); }
}
class MacFactory extends GUIFactory {
  createButton() { return new MacButton(); }
  createCheckbox() { return new MacCheckbox(); }
}


// --- POSITIVO (mutacion A: clone-duplicate) ---

class GUIFactory2 {}
class WinFactory2 extends GUIFactory2 {
  createButton() { return new WinButton(); }
  createCheckbox() { return new WinCheckbox(); }
}
class MacFactory2 extends GUIFactory2 {
  createButton() { return new MacButton(); }
  createCheckbox() { return new MacCheckbox(); }
}

</script>
<template><div /></template>
