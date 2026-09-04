// POSITIVO (mutación B: Abstract Factory aplanada en 2 cadenas condicionales paralelas).
function createButton(kind: "win" | "mac"): Button {
  if (kind === "win") {
    return new WinButton();
  } else if (kind === "mac") {
    return new MacButton();
  }
  throw new Error("kind desconocido");
}
function createCheckbox(kind: "win" | "mac"): Checkbox {
  if (kind === "win") {
    return new WinCheckbox();
  } else if (kind === "mac") {
    return new MacCheckbox();
  }
  throw new Error("kind desconocido");
}
