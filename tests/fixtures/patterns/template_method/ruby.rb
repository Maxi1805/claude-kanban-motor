# Fixture canónica: Template Method ya aplicado (Ruby). El esqueleto
# `mine` vive UNA sola vez en la superclase; las subclases solo overridean
# el paso variable (`extract_data`), cuerpo de una sola llamada.
class DataMiner
  def mine(path)
    open_file(path)
    extract_data
    analyze_data
    send_report
    close_file
  end

  def extract_data
    raise NotImplementedError
  end
end

class CsvDataMiner < DataMiner
  def extract_data
    extract_csv_data
  end
end

class LogDataMiner < DataMiner
  def extract_data
    extract_log_lines
  end
end
