package services

import (
	"net/http"
	"time"
)

var sharedHTTPClient = &http.Client{
	Timeout: 120 * time.Second,
	// Provider URLs are explicit. A redirect must never forward a signed or
	// credential-bearing request to a different endpoint.
	CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	Transport: &http.Transport{
		MaxIdleConns:        10,
		MaxIdleConnsPerHost: 5,
		IdleConnTimeout:     90 * time.Second,
	},
}
