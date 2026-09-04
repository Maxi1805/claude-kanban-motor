package miners

// Fixture canónica: Template Method "a la Go" (sin herencia de
// implementación, ver generalidad.md): el esqueleto vive en una única
// función de orden superior que recibe el paso variable como parámetro
// invocable — la vía real en un lenguaje sin clases abstractas. No hay
// ningún método `Mine` repetido por tipo.
type ExtractStep func()

func Mine(path string, extract ExtractStep) {
	openFile(path)
	extract()
	analyzeData()
	sendReport()
	closeFile()
}

func MineCSV(path string) {
	Mine(path, extractCSVData)
}

func MineLog(path string) {
	Mine(path, extractLogLines)
}
