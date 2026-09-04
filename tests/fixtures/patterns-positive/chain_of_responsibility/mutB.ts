// POSITIVO (mutación B: cadena de responsabilidad aplanada; pila de guardas repetida).
class RequestPipeline {
  handleA(request: Request, validator: Validator | null, logger: Logger | null): void {
    if (validator) {
      validator.check(request);
    }
    if (logger) {
      logger.log(request);
    }
  }
  handleB(request: Request, validator: Validator | null, logger: Logger | null): void {
    if (validator) {
      validator.check(request);
    }
    if (logger) {
      logger.log(request);
    }
  }
}
