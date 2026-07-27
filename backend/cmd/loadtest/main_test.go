package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestRunMeasuresAuthenticatedCoreScenarios(t *testing.T) {
	var requestCount atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/api/login":
			if request.Method != http.MethodPost {
				t.Errorf("login method = %s", request.Method)
			}
			http.SetCookie(response, &http.Cookie{Name: sessionCookieName, Value: "session-token"})
			response.WriteHeader(http.StatusOK)
		case "/api/books", "/api/books/search", "/api/progress/book-1":
			if request.Header.Get("Cookie") != sessionCookieName+"=session-token" {
				t.Errorf("cookie = %q", request.Header.Get("Cookie"))
			}
			requestCount.Add(1)
			response.WriteHeader(http.StatusOK)
		default:
			t.Errorf("unexpected path %s", request.URL.Path)
			response.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	var output bytes.Buffer
	err := run([]string{
		"--base-url", server.URL,
		"--username", "loadtest",
		"--password", "password-123",
		"--book-id", "book-1",
		"--duration", "15ms",
		"--concurrency", "1",
	}, &output)
	if err != nil {
		t.Fatalf("run() error = %v", err)
	}
	for _, scenario := range []string{"login", "shelf", "search", "progress"} {
		if !strings.Contains(output.String(), scenario+"\t") {
			t.Fatalf("output missing %s report: %s", scenario, output.String())
		}
	}
	if requestCount.Load() == 0 {
		t.Fatal("expected authenticated scenario requests")
	}
}

func TestRunFailsWhenScenarioReturnsError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/api/login" {
			http.SetCookie(response, &http.Cookie{Name: sessionCookieName, Value: "session-token"})
			response.WriteHeader(http.StatusOK)
			return
		}
		response.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	var output bytes.Buffer
	err := run([]string{
		"--base-url", server.URL,
		"--username", "loadtest",
		"--password", "password-123",
		"--scenarios", "shelf",
		"--duration", "15ms",
	}, &output)
	if err == nil || !strings.Contains(err.Error(), "shelf had") {
		t.Fatalf("run() error = %v, want failed shelf scenario", err)
	}
}

func TestPercentile(t *testing.T) {
	values := []time.Duration{
		4 * time.Millisecond,
		1 * time.Millisecond,
		3 * time.Millisecond,
		2 * time.Millisecond,
	}
	if got := percentile(values, 0.5); got != 2*time.Millisecond {
		t.Fatalf("p50 = %s, want 2ms", got)
	}
	if got := percentile(values, 0.95); got != 4*time.Millisecond {
		t.Fatalf("p95 = %s, want 4ms", got)
	}
}

func TestParseConfigRejectsNonHTTPBaseURL(t *testing.T) {
	_, err := parseConfig([]string{
		"--base-url", "ftp://reader.example.com",
		"--username", "loadtest",
		"--password", "password-123",
	})
	if err == nil || !strings.Contains(err.Error(), "absolute HTTP") {
		t.Fatalf("parseConfig() error = %v, want HTTP URL error", err)
	}
}

func TestParseConfigReadsPasswordFromEnvironment(t *testing.T) {
	t.Setenv("Z_READER_LOADTEST_PASSWORD", "password-from-environment")
	cfg, err := parseConfig([]string{
		"--base-url", "http://reader.example.com",
		"--username", "loadtest",
	})
	if err != nil {
		t.Fatalf("parseConfig() error = %v", err)
	}
	if cfg.password != "password-from-environment" {
		t.Fatalf("password = %q, want environment value", cfg.password)
	}
}
