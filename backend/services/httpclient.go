package services

import (
	"io"
	"net/http"
	"time"
)

const maxDrainErrorBodyBytes int64 = 4096

func drainResponseBody(body io.Reader) {
	if body == nil {
		return
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(body, maxDrainErrorBodyBytes))
}

func newSharedHTTPTransport() *http.Transport {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.MaxIdleConns = 10
	transport.MaxIdleConnsPerHost = 5
	transport.IdleConnTimeout = 90 * time.Second
	transport.ResponseHeaderTimeout = 30 * time.Second
	return transport
}

var sharedHTTPClient = &http.Client{
	Timeout: 120 * time.Second,
	// Provider URLs are explicit. A redirect must never forward a signed or
	// credential-bearing request to a different endpoint.
	CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	Transport:     newSharedHTTPTransport(),
}
