// Command check-coverage compares core backend coverage against the committed baseline.
package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
)

const coverageMetric = "statements"

var coreModules = []string{"handlers", "middleware", "services", "storage"}

type baseline struct {
	Schema  int                `json:"schema"`
	Metric  string             `json:"metric"`
	Modules map[string]float64 `json:"modules"`
}

type coverageCount struct {
	statements int
	covered    int
}

func (count coverageCount) percentage() float64 {
	if count.statements == 0 {
		return 0
	}
	return float64(count.covered) * 100 / float64(count.statements)
}

func main() {
	profilePath := flag.String("profile", "coverage.out", "path to a Go coverage profile")
	baselinePath := flag.String("baseline", "coverage-baseline.json", "path to the coverage baseline")
	writeBaseline := flag.Bool("write", false, "write the current results as the baseline")
	printBaseline := flag.Bool("print", false, "print the current results as baseline JSON")
	flag.Parse()

	if *writeBaseline && *printBaseline {
		fail(errors.New("-write and -print cannot be used together"))
	}

	actual, err := moduleCoverage(*profilePath)
	if err != nil {
		fail(err)
	}

	current := baseline{
		Schema:  1,
		Metric:  coverageMetric,
		Modules: percentages(actual),
	}

	if *printBaseline {
		printJSON(current)
		return
	}
	if *writeBaseline {
		data, err := json.MarshalIndent(current, "", "  ")
		if err != nil {
			fail(fmt.Errorf("encode baseline: %w", err))
		}
		if err := os.WriteFile(*baselinePath, append(data, '\n'), 0o644); err != nil {
			fail(fmt.Errorf("write baseline: %w", err))
		}
		fmt.Printf("Wrote backend coverage baseline to %s\n", *baselinePath)
		return
	}

	expected, err := readBaseline(*baselinePath)
	if err != nil {
		fail(err)
	}
	if err := checkBaseline(expected, current, actual); err != nil {
		fail(err)
	}
}

func moduleCoverage(profilePath string) (map[string]coverageCount, error) {
	file, err := os.Open(profilePath)
	if err != nil {
		return nil, fmt.Errorf("open coverage profile: %w", err)
	}
	defer file.Close()

	result := make(map[string]coverageCount, len(coreModules))
	for _, module := range coreModules {
		result[module] = coverageCount{}
	}

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 1024), 1024*1024)
	lineNumber := 0
	for scanner.Scan() {
		lineNumber++
		line := scanner.Text()
		if lineNumber == 1 && strings.HasPrefix(line, "mode: ") {
			continue
		}

		module, statements, covered, ok, err := parseProfileLine(line)
		if err != nil {
			return nil, fmt.Errorf("parse coverage profile line %d: %w", lineNumber, err)
		}
		if !ok {
			continue
		}

		count := result[module]
		count.statements += statements
		if covered {
			count.covered += statements
		}
		result[module] = count
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read coverage profile: %w", err)
	}

	for _, module := range coreModules {
		if result[module].statements == 0 {
			return nil, fmt.Errorf("coverage profile has no statements for %s", module)
		}
	}
	return result, nil
}

func parseProfileLine(line string) (string, int, bool, bool, error) {
	fields := strings.Fields(line)
	if len(fields) != 3 {
		return "", 0, false, false, fmt.Errorf("expected 3 fields, got %d", len(fields))
	}

	separator := strings.LastIndex(fields[0], ":")
	if separator == -1 {
		return "", 0, false, false, errors.New("missing file position separator")
	}
	module, ok := moduleFor(fields[0][:separator])
	if !ok {
		return "", 0, false, false, nil
	}

	statements, err := strconv.Atoi(fields[1])
	if err != nil || statements < 0 {
		return "", 0, false, false, fmt.Errorf("invalid statement count %q", fields[1])
	}
	count, err := strconv.Atoi(fields[2])
	if err != nil || count < 0 {
		return "", 0, false, false, fmt.Errorf("invalid execution count %q", fields[2])
	}
	return module, statements, count > 0, true, nil
}

func moduleFor(path string) (string, bool) {
	for _, module := range coreModules {
		if strings.HasPrefix(path, module+"/") || strings.Contains(path, "/"+module+"/") {
			return module, true
		}
	}
	return "", false
}

func percentages(counts map[string]coverageCount) map[string]float64 {
	result := make(map[string]float64, len(counts))
	for module, count := range counts {
		result[module] = count.percentage()
	}
	return result
}

func readBaseline(path string) (baseline, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return baseline{}, fmt.Errorf("read baseline: %w", err)
	}

	var value baseline
	if err := json.Unmarshal(data, &value); err != nil {
		return baseline{}, fmt.Errorf("decode baseline: %w", err)
	}
	if value.Schema != 1 || value.Metric != coverageMetric {
		return baseline{}, errors.New("unsupported coverage baseline format")
	}
	for _, module := range coreModules {
		if _, ok := value.Modules[module]; !ok {
			return baseline{}, fmt.Errorf("baseline is missing %s", module)
		}
	}
	return value, nil
}

func checkBaseline(expected, current baseline, counts map[string]coverageCount) error {
	var failures []string
	for _, module := range coreModules {
		actual := current.Modules[module]
		minimum := expected.Modules[module]
		count := counts[module]
		fmt.Printf("%s: %.2f%% (%d/%d statements), baseline %.2f%%\n",
			module, actual, count.covered, count.statements, minimum)
		if actual+0.0001 < minimum {
			failures = append(failures, fmt.Sprintf("%s dropped from %.2f%% to %.2f%%", module, minimum, actual))
		}
	}
	if len(failures) > 0 {
		sort.Strings(failures)
		return fmt.Errorf("core coverage regression: %s", strings.Join(failures, "; "))
	}
	fmt.Println("Backend core coverage meets the committed baseline.")
	return nil
}

func printJSON(value baseline) {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		fail(fmt.Errorf("encode baseline: %w", err))
	}
	fmt.Println(string(data))
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "coverage check failed:", err)
	os.Exit(1)
}
