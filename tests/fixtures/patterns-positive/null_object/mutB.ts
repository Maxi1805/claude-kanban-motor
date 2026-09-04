class ConsoleLogger {
  log(msg: string): void {
    console.log(msg);
  }
}

// POSITIVO (mutación B: sin Null Object, guardas nulas repetidas en 2 sitios).
function reportStart(logger: ConsoleLogger | null): void {
  if (logger !== null) {
    logger.log("start");
  }
}
function reportEnd(logger: ConsoleLogger | null): void {
  if (logger !== null) {
    logger.log("end");
  }
}
