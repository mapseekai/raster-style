package rasterstyle

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

type fixture struct {
	Name      string          `json:"name"`
	Query     string          `json:"query"`
	JSON      string          `json:"json"`
	Code      string          `json:"code"`
	Canonical string          `json:"canonical"`
	Style     json.RawMessage `json:"raster_style"`
}

func fixtures(t testing.TB, name string) []fixture {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "testdata", name+".json"))
	if err != nil {
		t.Fatal(err)
	}
	var values []fixture
	if err := json.Unmarshal(data, &values); err != nil {
		t.Fatal(err)
	}
	return values
}
func assertCode(t *testing.T, err error, code string) {
	t.Helper()
	var failure *Error
	if !errors.As(err, &failure) || failure.Code != code {
		t.Fatalf("expected %s, got %v", code, err)
	}
}
func TestGoldenFixtures(t *testing.T) {
	for _, value := range fixtures(t, "roundtrip") {
		t.Run(value.Name, func(t *testing.T) {
			query, err := JSONToQuery(value.Style)
			if err != nil {
				t.Fatal(err)
			}
			if query != value.Query {
				t.Fatalf("query mismatch\nexpected %s\nactual   %s", value.Query, query)
			}
			style, err := DecodeQuery("?" + query)
			if err != nil {
				t.Fatal(err)
			}
			expected, err := ParseJSON(value.Style)
			if err != nil {
				t.Fatal(err)
			}
			if string(style.JSON()) != string(expected.JSON()) {
				t.Fatal("round trip changed the normalized JSON")
			}
		})
	}
}
func TestInvalidQueries(t *testing.T) {
	for _, value := range fixtures(t, "invalid-queries") {
		t.Run(value.Name, func(t *testing.T) { _, err := DecodeQuery(value.Query); assertCode(t, err, value.Code) })
	}
}
func TestInvalidStyles(t *testing.T) {
	for _, value := range fixtures(t, "invalid-styles") {
		t.Run(value.Name, func(t *testing.T) { _, err := ParseJSON([]byte(value.JSON)); assertCode(t, err, value.Code) })
	}
}
func TestCanonicalJSON(t *testing.T) {
	for _, value := range fixtures(t, "canonical") {
		t.Run(value.Name, func(t *testing.T) {
			actual, err := CanonicalJSON([]byte(value.JSON))
			if err != nil {
				t.Fatal(err)
			}
			if string(actual) != value.Canonical {
				t.Fatalf("expected %s, got %s", value.Canonical, actual)
			}
		})
	}
}
func TestInvalidJSON(t *testing.T) {
	for _, value := range fixtures(t, "invalid-json") {
		t.Run(value.Name, func(t *testing.T) { _, err := CanonicalJSON([]byte(value.JSON)); assertCode(t, err, value.Code) })
	}
}
func TestBudgetsAndOwnership(t *testing.T) {
	codec, err := NewCodec(Options{MaxQueryBytes: 8})
	if err != nil {
		t.Fatal(err)
	}
	_, err = codec.DecodeQuery("version=2.0&type=gray")
	assertCode(t, err, "E_LIMIT")
	_, err = ParseJSON([]byte(strings.Repeat(" ", MaxJSONBytes+1)))
	assertCode(t, err, "E_LIMIT")
	_, err = ParseJSON([]byte{'"', 0xff, '"'})
	assertCode(t, err, "E_JSON")
	_, err = NewCodec(Options{MaxQueryBytes: -1})
	assertCode(t, err, "E_CONFIG")
	style, err := ParseJSON(fixtures(t, "roundtrip")[0].Style)
	if err != nil {
		t.Fatal(err)
	}
	first := string(style.JSON())
	document := style.Document()
	document["version"] = "oops"
	data := style.JSON()
	data[0] = '['
	if string(style.JSON()) != first {
		t.Fatal("caller mutated style")
	}
	if err := json.Unmarshal([]byte(`{"version":"bad"}`), style); err == nil {
		t.Fatal("invalid unmarshal accepted")
	}
	if string(style.JSON()) != first {
		t.Fatal("failed unmarshal changed receiver")
	}
}
func TestConcurrentCodec(t *testing.T) {
	codec, err := NewCodec(Options{})
	if err != nil {
		t.Fatal(err)
	}
	query := fixtures(t, "roundtrip")[0].Query
	var workers sync.WaitGroup
	for i := 0; i < 20; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for j := 0; j < 10; j++ {
				style, err := codec.DecodeQuery(query)
				if err != nil {
					t.Error(err)
					return
				}
				actual, err := codec.EncodeQuery(style)
				if err != nil || actual != query {
					t.Errorf("concurrent round trip: %v", err)
					return
				}
			}
		}()
	}
	workers.Wait()
}
func BenchmarkDecodeRGB(b *testing.B) {
	codec, err := NewCodec(Options{})
	if err != nil {
		b.Fatal(err)
	}
	query := fixtures(b, "roundtrip")[0].Query
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := codec.DecodeQuery(query); err != nil {
			b.Fatal(err)
		}
	}
}
func FuzzDecodeQuery(f *testing.F) {
	for _, value := range fixtures(f, "roundtrip") {
		f.Add(value.Query)
	}
	f.Add("version=2.0&foo=%FF")
	f.Fuzz(func(t *testing.T, query string) {
		style, err := DecodeQuery(query)
		if err != nil {
			return
		}
		encoded, err := EncodeQuery(style)
		if err != nil {
			t.Fatal(err)
		}
		decoded, err := DecodeQuery(encoded)
		if err != nil || string(decoded.JSON()) != string(style.JSON()) {
			t.Fatalf("round trip failed: %v", err)
		}
	})
}
