# Fixture canónica: Template Method ya aplicado (Python). El esqueleto
# `mine` vive UNA sola vez en la superclase; las subclases solo overridean
# el paso variable (`extract_data`), cuerpo de una sola llamada.
class DataMiner:
    def mine(self, path):
        self.open_file(path)
        self.extract_data()
        self.analyze_data()
        self.send_report()
        self.close_file()

    def extract_data(self):
        raise NotImplementedError


class CsvDataMiner(DataMiner):
    def extract_data(self):
        self.extract_csv_data()


class LogDataMiner(DataMiner):
    def extract_data(self):
        self.extract_log_lines()
