# POSITIVO (mutación B: cadena de responsabilidad aplanada; pila de guardas repetida).
class RequestPipeline:
    def handle_a(self, request, validator, logger):
        if validator:
            validator.check(request)
        if logger:
            logger.log(request)

    def handle_b(self, request, validator, logger):
        if validator:
            validator.check(request)
        if logger:
            logger.log(request)
