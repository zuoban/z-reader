package config

import (
	"reflect"
	"testing"
)

func TestSplitCSVTrimsAndDeduplicates(t *testing.T) {
	got := splitCSV(" http://localhost:3000, http://localhost:3000 , ,http://127.0.0.1:3000 ")
	want := []string{
		"http://localhost:3000",
		"http://127.0.0.1:3000",
	}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("splitCSV() = %#v, want %#v", got, want)
	}
}

func TestUniqueStringsPreservesOrder(t *testing.T) {
	got := uniqueStrings([]string{"a", "b", "a", "c", "b"})
	want := []string{"a", "b", "c"}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("uniqueStrings() = %#v, want %#v", got, want)
	}
}
