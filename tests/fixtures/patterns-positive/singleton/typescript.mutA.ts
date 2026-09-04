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


// --- POSITIVO (mutacion A: clone-duplicate) ---
class AppConfig2 {
  private static instance: AppConfig2 | null = null;
  private loadedAt: number;
  private constructor() {
    this.loadedAt = Date.now();
  }
  static getInstance(): AppConfig2 {
    AppConfig2.instance ||= new AppConfig2();
    return AppConfig2.instance;
  }
}
class RequestContext2 {
  userId: string;
  constructor(userId: string) {
    this.userId = userId;
  }
}

