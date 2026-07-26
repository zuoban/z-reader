// Command loadtest measures authenticated Z Reader core API scenarios against a
// running instance. It intentionally uses only the Go standard library so a
// contributor can reproduce a run without installing a separate load tool.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const sessionCookieName = "z_reader_session"

type config struct {
	baseURL        string
	username       string
	password       string
	passwordEnv    string
	bookID         string
	searchQuery    string
	scenarios      []string
	concurrency    int
	duration       time.Duration
	requestTimeout time.Duration
}

type scenario struct {
	name    string
	request func(context.Context, uint64) (*http.Request, error)
}

type sample struct {
	elapsed time.Duration
	status  int
	err     error
}

type report struct {
	name      string
	elapsed   time.Duration
	requests  int
	failures  int
	latencies []time.Duration
}

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "load test failed:", err)
		os.Exit(1)
	}
}

func run(args []string, output io.Writer) error {
	cfg, err := parseConfig(args)
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: cfg.requestTimeout}
	cookie, loginLatency, err := login(client, cfg)
	if err != nil {
		return err
	}
	fmt.Fprintf(output, "login\trequests=1\tfailures=0\tp50=%s\tp95=%s\tp99=%s\tthroughput=1.00 req/s\n",
		formatDuration(loginLatency), formatDuration(loginLatency), formatDuration(loginLatency))

	scenarios, err := buildScenarios(cfg, cookie)
	if err != nil {
		return err
	}
	for _, current := range scenarios {
		ctx, cancel := context.WithTimeout(context.Background(), cfg.duration)
		startedAt := time.Now()
		currentReport := runScenario(ctx, client, current, cfg.concurrency)
		currentReport.elapsed = time.Since(startedAt)
		cancel()

		printReport(output, currentReport)
		if currentReport.failures > 0 {
			return fmt.Errorf("%s had %d failed requests", current.name, currentReport.failures)
		}
	}
	return nil
}

func parseConfig(args []string) (config, error) {
	flags := flag.NewFlagSet("loadtest", flag.ContinueOnError)
	flags.SetOutput(io.Discard)

	cfg := config{}
	var scenarioList string
	flags.StringVar(&cfg.baseURL, "base-url", "", "Running Z Reader base URL")
	flags.StringVar(&cfg.username, "username", "", "Dedicated load-test username")
	flags.StringVar(&cfg.password, "password", "", "Load-test password (prefer --password-env)")
	flags.StringVar(&cfg.passwordEnv, "password-env", "Z_READER_LOADTEST_PASSWORD", "Environment variable containing the load-test password")
	flags.StringVar(&cfg.bookID, "book-id", "", "Existing test book ID for progress saves")
	flags.StringVar(&cfg.searchQuery, "search-query", "性能测试", "Search query")
	flags.StringVar(&scenarioList, "scenarios", "shelf,search,progress", "Comma-separated scenarios")
	flags.IntVar(&cfg.concurrency, "concurrency", 4, "Concurrent workers per scenario")
	flags.DurationVar(&cfg.duration, "duration", 30*time.Second, "Duration per scenario")
	flags.DurationVar(&cfg.requestTimeout, "request-timeout", 10*time.Second, "HTTP request timeout")
	if err := flags.Parse(args); err != nil {
		return config{}, err
	}

	cfg.baseURL = strings.TrimRight(strings.TrimSpace(cfg.baseURL), "/")
	cfg.username = strings.TrimSpace(cfg.username)
	cfg.searchQuery = strings.TrimSpace(cfg.searchQuery)
	cfg.bookID = strings.TrimSpace(cfg.bookID)
	if cfg.password == "" && cfg.passwordEnv != "" {
		cfg.password = os.Getenv(cfg.passwordEnv)
	}
	for _, name := range strings.Split(scenarioList, ",") {
		if trimmed := strings.TrimSpace(name); trimmed != "" {
			cfg.scenarios = append(cfg.scenarios, trimmed)
		}
	}

	if cfg.baseURL == "" || cfg.username == "" || cfg.password == "" {
		return config{}, errors.New("--base-url, --username, and a password are required")
	}
	parsedURL, err := url.Parse(cfg.baseURL)
	if err != nil || parsedURL.Host == "" ||
		(parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		return config{}, errors.New("--base-url must be an absolute HTTP(S) URL")
	}
	if cfg.concurrency < 1 || cfg.concurrency > 128 {
		return config{}, errors.New("--concurrency must be between 1 and 128")
	}
	if cfg.duration < 10*time.Millisecond {
		return config{}, errors.New("--duration must be at least 10ms")
	}
	if cfg.requestTimeout <= 0 {
		return config{}, errors.New("--request-timeout must be positive")
	}
	if len(cfg.scenarios) == 0 {
		return config{}, errors.New("--scenarios must not be empty")
	}
	return cfg, nil
}

func login(client *http.Client, cfg config) (string, time.Duration, error) {
	payload, err := json.Marshal(map[string]string{
		"username": cfg.username,
		"password": cfg.password,
	})
	if err != nil {
		return "", 0, err
	}

	request, err := http.NewRequest(http.MethodPost, cfg.baseURL+"/api/login", bytes.NewReader(payload))
	if err != nil {
		return "", 0, err
	}
	request.Header.Set("Content-Type", "application/json")

	startedAt := time.Now()
	response, err := client.Do(request)
	elapsed := time.Since(startedAt)
	if err != nil {
		return "", 0, fmt.Errorf("login request: %w", err)
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, response.Body)

	if response.StatusCode != http.StatusOK {
		return "", 0, fmt.Errorf("login returned HTTP %d", response.StatusCode)
	}
	for _, cookie := range response.Cookies() {
		if cookie.Name == sessionCookieName && cookie.Value != "" {
			return sessionCookieName + "=" + cookie.Value, elapsed, nil
		}
	}
	return "", 0, errors.New("login response did not set a session cookie")
}

func buildScenarios(cfg config, cookie string) ([]scenario, error) {
	scenarios := make([]scenario, 0, len(cfg.scenarios))
	for _, name := range cfg.scenarios {
		switch name {
		case "shelf":
			scenarios = append(scenarios, scenario{
				name: "shelf",
				request: authenticatedRequest(
					http.MethodGet,
					cfg.baseURL+"/api/books?limit=50&sort=recent_added",
					cookie,
					nil,
				),
			})
		case "search":
			query := url.QueryEscape(cfg.searchQuery)
			scenarios = append(scenarios, scenario{
				name: "search",
				request: authenticatedRequest(
					http.MethodGet,
					cfg.baseURL+"/api/books/search?q="+query+"&limit=50&sort=title",
					cookie,
					nil,
				),
			})
		case "progress":
			if cfg.bookID == "" {
				return nil, errors.New("--book-id is required when running the progress scenario")
			}
			endpoint := cfg.baseURL + "/api/progress/" + url.PathEscape(cfg.bookID)
			scenarios = append(scenarios, scenario{
				name: "progress",
				request: func(ctx context.Context, sequence uint64) (*http.Request, error) {
					payload, err := json.Marshal(map[string]any{
						"cfi":        fmt.Sprintf("epubcfi(/6/2[loadtest]!/4/1:%d)", sequence),
						"percentage": float64(sequence%10_000) / 100,
						"device_id":  "loadtest",
					})
					if err != nil {
						return nil, err
					}
					request, err := http.NewRequestWithContext(
						ctx,
						http.MethodPost,
						endpoint,
						bytes.NewReader(payload),
					)
					if err != nil {
						return nil, err
					}
					request.Header.Set("Cookie", cookie)
					request.Header.Set("Content-Type", "application/json")
					return request, nil
				},
			})
		default:
			return nil, fmt.Errorf("unsupported scenario %q (use shelf, search, or progress)", name)
		}
	}
	return scenarios, nil
}

func authenticatedRequest(
	method, endpoint, cookie string, body []byte,
) func(context.Context, uint64) (*http.Request, error) {
	return func(ctx context.Context, _ uint64) (*http.Request, error) {
		request, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		request.Header.Set("Cookie", cookie)
		return request, nil
	}
}

func runScenario(
	ctx context.Context, client *http.Client, current scenario, concurrency int,
) report {
	samples := make(chan sample, concurrency)
	var workers sync.WaitGroup

	for worker := 0; worker < concurrency; worker++ {
		workers.Add(1)
		go func(workerID uint64) {
			defer workers.Done()
			sequence := workerID
			for {
				if ctx.Err() != nil {
					return
				}
				sequence += uint64(concurrency)
				request, err := current.request(ctx, sequence)
				if err != nil {
					samples <- sample{err: err}
					continue
				}

				startedAt := time.Now()
				response, err := client.Do(request)
				elapsed := time.Since(startedAt)
				if err != nil {
					if ctx.Err() != nil {
						return
					}
					samples <- sample{elapsed: elapsed, err: err}
					continue
				}
				_, _ = io.Copy(io.Discard, response.Body)
				_ = response.Body.Close()
				samples <- sample{elapsed: elapsed, status: response.StatusCode}
			}
		}(uint64(worker))
	}

	go func() {
		workers.Wait()
		close(samples)
	}()

	currentReport := report{name: current.name}
	for currentSample := range samples {
		currentReport.requests++
		currentReport.latencies = append(currentReport.latencies, currentSample.elapsed)
		if currentSample.err != nil || currentSample.status < http.StatusOK ||
			currentSample.status >= http.StatusMultipleChoices {
			currentReport.failures++
		}
	}
	return currentReport
}

func printReport(output io.Writer, current report) {
	p50 := percentile(current.latencies, 0.50)
	p95 := percentile(current.latencies, 0.95)
	p99 := percentile(current.latencies, 0.99)
	throughput := 0.0
	if current.elapsed > 0 {
		throughput = float64(current.requests) / current.elapsed.Seconds()
	}
	fmt.Fprintf(
		output,
		"%s\trequests=%d\tfailures=%d\tp50=%s\tp95=%s\tp99=%s\tthroughput=%.2f req/s\n",
		current.name,
		current.requests,
		current.failures,
		formatDuration(p50),
		formatDuration(p95),
		formatDuration(p99),
		throughput,
	)
}

func percentile(values []time.Duration, ratio float64) time.Duration {
	if len(values) == 0 {
		return 0
	}
	sorted := append([]time.Duration(nil), values...)
	sort.Slice(sorted, func(left, right int) bool { return sorted[left] < sorted[right] })
	index := int(math.Ceil(ratio*float64(len(sorted)))) - 1
	if index < 0 {
		index = 0
	}
	if index >= len(sorted) {
		index = len(sorted) - 1
	}
	return sorted[index]
}

func formatDuration(value time.Duration) string {
	return strconv.FormatFloat(
		float64(value.Microseconds())/1_000,
		'f',
		2,
		64,
	) + "ms"
}
