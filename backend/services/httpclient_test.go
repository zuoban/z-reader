package services

import (
	"net/http"
	"testing"
	"time"
)

func TestSharedHTTPClientTransportDefaults(t *testing.T) {
	transport, ok := sharedHTTPClient.Transport.(*http.Transport)
	if !ok || transport == nil {
		t.Fatalf("sharedHTTPClient.Transport = %T, want non-nil *http.Transport", sharedHTTPClient.Transport)
	}
	defaultTransport := http.DefaultTransport.(*http.Transport)
	if transport == defaultTransport {
		t.Fatal("sharedHTTPClient.Transport must be a clone of http.DefaultTransport, not the shared instance")
	}

	if transport.Proxy == nil {
		t.Fatal("expected Proxy to be configured from DefaultTransport")
	}
	if transport.DialContext == nil {
		t.Fatal("expected DialContext to be configured from DefaultTransport")
	}
	if transport.TLSHandshakeTimeout != defaultTransport.TLSHandshakeTimeout || transport.TLSHandshakeTimeout <= 0 {
		t.Fatalf("TLSHandshakeTimeout = %v, want %v (> 0)", transport.TLSHandshakeTimeout, defaultTransport.TLSHandshakeTimeout)
	}
	if transport.ExpectContinueTimeout != defaultTransport.ExpectContinueTimeout || transport.ExpectContinueTimeout <= 0 {
		t.Fatalf("ExpectContinueTimeout = %v, want %v (> 0)", transport.ExpectContinueTimeout, defaultTransport.ExpectContinueTimeout)
	}
	if !transport.ForceAttemptHTTP2 {
		t.Fatal("expected ForceAttemptHTTP2 to remain true")
	}
	if transport.MaxIdleConns != 10 {
		t.Fatalf("MaxIdleConns = %d, want 10", transport.MaxIdleConns)
	}
	if transport.MaxIdleConnsPerHost != 5 {
		t.Fatalf("MaxIdleConnsPerHost = %d, want 5", transport.MaxIdleConnsPerHost)
	}
	if transport.IdleConnTimeout != 90*time.Second {
		t.Fatalf("IdleConnTimeout = %v, want 90s", transport.IdleConnTimeout)
	}
	if transport.ResponseHeaderTimeout != 30*time.Second {
		t.Fatalf("ResponseHeaderTimeout = %v, want 30s", transport.ResponseHeaderTimeout)
	}
}
