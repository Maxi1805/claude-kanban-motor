<script>
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


// --- POSITIVO (mutacion A: clone-duplicate) ---

class AppConfig2 {
  static instance = null;
  constructor() {
    this.loadedAt = Date.now();
  }
  static getInstance() {
    AppConfig2.instance ||= new AppConfig2();
    return AppConfig2.instance;
  }
}
class RequestContext2 {
  constructor(userId) {
    this.userId = userId;
  }
}

</script>
<template><div /></template>
