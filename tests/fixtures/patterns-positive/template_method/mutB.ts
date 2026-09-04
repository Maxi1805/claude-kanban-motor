// POSITIVO (mutación B: sin Template Method; esqueleto duplicado en 2 unidades).
function mineCsv(path: string): void {
  openFile(path);
  extractCsvData();
  analyzeData();
  sendReport();
  closeFile();
}
function mineLog(path: string): void {
  openFile(path);
  extractLogLines();
  analyzeData();
  sendReport();
  closeFile();
}
