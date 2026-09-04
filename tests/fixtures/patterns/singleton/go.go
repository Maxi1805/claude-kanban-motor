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
