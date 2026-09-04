// Fixture canónica: Template Method ya aplicado (JavaScript). El esqueleto
// `mine` vive UNA sola vez en la superclase; las subclases solo overridean
// el paso variable (`extractData`), cuerpo de una sola llamada.
class DataMiner {
  mine(path) {
    this.openFile(path);
    this.extractData();
    this.analyzeData();
    this.sendReport();
    this.closeFile();
  }

  extractData() {
    throw new Error("not implemented");
  }
}

class CsvDataMiner extends DataMiner {
  extractData() {
    this.extractCsvData();
  }
}

class LogDataMiner extends DataMiner {
  extractData() {
    this.extractLogLines();
  }
}

module.exports = { DataMiner, CsvDataMiner, LogDataMiner };


// --- POSITIVO (mutacion A: clone-duplicate) ---
// Fixture canónica: Template Method ya aplicado (JavaScript). El esqueleto
// `mine` vive UNA sola vez en la superclase; las subclases solo overridean
// el paso variable (`extractData`), cuerpo de una sola llamada.
class DataMiner2 {
  mine(path) {
    this.openFile(path);
    this.extractData();
    this.analyzeData();
    this.sendReport();
    this.closeFile();
  }

  extractData() {
    throw new Error("not implemented");
  }
}

class CsvDataMiner2 extends DataMiner2 {
  extractData() {
    this.extractCsvData();
  }
}

class LogDataMiner2 extends DataMiner2 {
  extractData() {
    this.extractLogLines();
  }
}

module.exports = { DataMiner2, CsvDataMiner2, LogDataMiner2 };

