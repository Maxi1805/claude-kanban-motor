package gui

type WinFactory struct{}

func (f *WinFactory) CreateButton() *WinButton {
	return &WinButton{}
}
func (f *WinFactory) CreateCheckbox() *WinCheckbox {
	return &WinCheckbox{}
}

type MacFactory struct{}

func (f *MacFactory) CreateButton() *MacButton {
	return &MacButton{}
}
func (f *MacFactory) CreateCheckbox() *MacCheckbox {
	return &MacCheckbox{}
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
type WinFactory2 struct{}

func (f *WinFactory2) CreateButton() *WinButton {
	return &WinButton{}
}
func (f *WinFactory2) CreateCheckbox() *WinCheckbox {
	return &WinCheckbox{}
}

type MacFactory2 struct{}

func (f *MacFactory2) CreateButton() *MacButton {
	return &MacButton{}
}
func (f *MacFactory2) CreateCheckbox() *MacCheckbox {
	return &MacCheckbox{}
}

