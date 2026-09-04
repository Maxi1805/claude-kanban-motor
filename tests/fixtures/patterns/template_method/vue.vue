<script lang="ts">
// Fixture canónica: Template Method ya aplicado (Vue). El esqueleto `mine`
// vive UNA sola vez en la superclase; las subclases solo overridean el
// paso variable (`extractData`), cuerpo de una sola llamada.
abstract class DataMiner {
  mine(path: string): void {
    this.openFile(path);
    this.extractData();
    this.analyzeData();
    this.sendReport();
    this.closeFile();
  }

  abstract extractData(): void;
}

class CsvDataMiner extends DataMiner {
  extractData(): void {
    this.extractCsvData();
  }
}

class LogDataMiner extends DataMiner {
  extractData(): void {
    this.extractLogLines();
  }
}
</script>

<template>
  <div />
</template>
