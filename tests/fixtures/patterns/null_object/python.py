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
