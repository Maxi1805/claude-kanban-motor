// POSITIVO (mutación B: Factory Method aplanado; cadena que instancia tipos).
function createButton(kind: "windows" | "web"): Button {
  if (kind === "windows") {
    return new WindowsButton();
  } else if (kind === "web") {
    return new WebButton();
  }
  throw new Error("kind desconocido");
}
