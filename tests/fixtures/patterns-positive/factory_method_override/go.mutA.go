package dialogs

// LÍMITE DECLARADO: Go no tiene herencia de implementación (composición +
// interfaces en su lugar), así que no existe "override" en el sentido que
// esta relación busca — no hay una superclase declarada de la que
// `WindowsDialog`/`WebDialog` sean subclase textual. Se documenta la forma
// MÁS CERCANA (interfaz + implementaciones independientes) para dejar
// registrado que la relación, tal como está definida, NO tiene vía
// sintáctica en Go — ver generalidad.md.
type Dialog interface {
	CreateButton() Button
}

type WindowsDialog struct{}

func (d WindowsDialog) CreateButton() Button {
	return NewWindowsButton()
}

type WebDialog struct{}

func (d WebDialog) CreateButton() Button {
	return NewWebButton()
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
type Dialog2 interface {
	CreateButton() Button
}

type WindowsDialog2 struct{}

func (d WindowsDialog2) CreateButton() Button {
	return NewWindowsButton()
}

type WebDialog2 struct{}

func (d WebDialog2) CreateButton() Button {
	return NewWebButton()
}

