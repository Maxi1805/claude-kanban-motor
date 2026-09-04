package logging

// Fixture canónica: Null Object (Go). Nombres con sufijo `Go`, mismo motivo
// que typescript.ts de esta carpeta: nombre único por archivo para que la
// resolución no caiga en AMBIGUOUS entre los 4 archivos con clase.
//
// LÍMITE VIGENTE, verificado a mano volcando el grafo (no algo que este
// archivo pueda arreglar): `graph/symbols.ts` documenta que el método de Go
// con receptor es INVISIBLE a la contención de su ancestro — el
// `type X struct{}` nunca gana una arista `contains` hacia sus métodos (que
// viven como símbolos SUELTOS de nivel archivo), así que el tipo sale
// `family: "other"`, nunca `"class-like"`. La ruta ESTRUCTURAL de
// `hypotheses/null-object.ts` filtra por `family === "class-like"` — así que
// NINGUNA forma (COMPLETA/PARCIAL) puede emitir sobre Go hoy, sin importar
// cómo se escriba este archivo. Arreglarlo es tocar `graph/symbols.ts`
// (archivo compartido, "vara larga" de CONTRATO-F10.md §4.1), fuera de
// alcance de esta tarea. Se deja el archivo con la MISMA forma que los
// demás por completitud/documentación, no porque vaya a emitir.
type GoConsoleLogger struct{}

func (l GoConsoleLogger) Log(msg string) {
	println(msg)
}

func (l GoConsoleLogger) Flush() {
	println("(flush)")
}

type GoNullLogger struct{}

func (l GoNullLogger) Log(msg string) {
}

func (l GoNullLogger) Flush() {
}

func NewGoLogger(quiet bool) interface{} {
	if quiet {
		return GoNullLogger{}
	}
	return GoConsoleLogger{}
}

// Control negativo: método corto, SIN familia con hermanos activos NI sitio
// de instanciación.
type GoReportOptions struct{}

func (r GoReportOptions) MiddleName() {
}
