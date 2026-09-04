class AppConfig {
  static instance: AppConfig | null = null;
  loadedAt: number;
  constructor() {
    this.loadedAt = Date.now();
  }
  static getInstance(): AppConfig {
    AppConfig.instance ||= new AppConfig();
    return AppConfig.instance;
  }
}

// POSITIVO (mutación B: fuga de construcción). getInstance() sigue ahí, pero
// estos dos sitios construyen AppConfig directamente en vez de pasar por él.
function bootStartup(): AppConfig {
  return new AppConfig();
}
function bootWorker(): AppConfig {
  return new AppConfig();
}
