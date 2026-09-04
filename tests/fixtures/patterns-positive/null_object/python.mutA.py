# Fixture canónica: Null Object / override trivial (Python).
class ConsoleLogger:
    def log(self, msg):
        print(msg)


class NullLogger:
    def log(self, msg):
        pass


# Control negativo: método corto, SIN familia con hermanos activos.
class ReportOptions:
    def middle_name(self):
        pass


# --- POSITIVO (mutacion A: clone-duplicate) ---
# Fixture canónica: Null Object / override trivial (Python).
class ConsoleLogger2:
    def log(self, msg):
        print(msg)


class NullLogger2:
    def log(self, msg):
        pass


# Control negativo: método corto, SIN familia con hermanos activos.
class ReportOptions2:
    def middle_name(self):
        pass

