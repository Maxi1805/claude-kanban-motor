package config

import "sync"

type AppConfig struct {
	LoadedAt int64
}

var appConfigInstance *AppConfig
var appConfigOnce sync.Once

func GetAppConfig() *AppConfig {
	appConfigOnce.Do(func() {
		appConfigInstance = &AppConfig{LoadedAt: 0}
	})
	return appConfigInstance
}

type RequestContext struct {
	UserID string
}

func NewRequestContext(userID string) *RequestContext {
	return &RequestContext{UserID: userID}
}


// --- POSITIVO (mutacion A: clone-duplicate) ---
type AppConfig2 struct {
	LoadedAt int64
}

var appConfigInstance2 *AppConfig2
var appConfigOnce2 sync.Once

func GetAppConfig2() *AppConfig2 {
	appConfigOnce2.Do(func() {
		appConfigInstance2 = &AppConfig2{LoadedAt: 0}
	})
	return appConfigInstance2
}

type RequestContext2 struct {
	UserID string
}

func NewRequestContext2(userID string) *RequestContext2 {
	return &RequestContext2{UserID: userID}
}

