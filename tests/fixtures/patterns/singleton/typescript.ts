class AppConfig {
  private static instance: AppConfig | null = null;
  private loadedAt: number;
  private constructor() {
    this.loadedAt = Date.now();
  }
  static getInstance(): AppConfig {
    AppConfig.instance ||= new AppConfig();
    return AppConfig.instance;
  }
}
class RequestContext {
  userId: string;
  constructor(userId: string) {
    this.userId = userId;
  }
}
