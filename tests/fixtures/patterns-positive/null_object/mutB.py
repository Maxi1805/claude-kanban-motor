class ConsoleLogger:
    def log(self, msg):
        print(msg)


# POSITIVO (mutación B: sin Null Object, guardas nulas repetidas en 2 sitios).
def report_start(logger):
    if logger is not None:
        logger.log("start")


def report_end(logger):
    if logger is not None:
        logger.log("end")
