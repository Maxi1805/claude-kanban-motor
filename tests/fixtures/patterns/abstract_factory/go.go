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
