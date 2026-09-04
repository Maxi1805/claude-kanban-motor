class AppConfig {
  static instance = null;
  constructor() {
    this.loadedAt = Date.now();
  }
  static getInstance() {
    AppConfig.instance ||= new AppConfig();
    return AppConfig.instance;
  }
}
class RequestContext {
  constructor(userId) {
    this.userId = userId;
  }
}
