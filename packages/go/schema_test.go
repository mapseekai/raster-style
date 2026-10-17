package rasterstyle

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"reflect"
	"testing"
)

type schemaFixture struct {
	Name      string           `json:"name"`
	Op        string           `json:"op"`
	Style     json.RawMessage  `json:"style"`
	Schemas   []string         `json:"schemas"`
	Supported []string         `json:"supported"`
	Code      string           `json:"code"`
	Expected  ValidationReport `json:"expected"`
}

type schemaFixtures struct {
	Resources map[string]json.RawMessage `json:"resources"`
	Cases     []schemaFixture            `json:"cases"`
}

func TestSchemaCases(t *testing.T) {
	fixtures := loadSchemaFixtures(t)
	for _, fixture := range fixtures.Cases {
		t.Run(fixture.Name, func(t *testing.T) {
			registry, err := NewSchemaRegistry()
			var report ValidationReport
			if err == nil {
				for _, key := range fixture.Schemas {
					if err = registry.Register(fixtures.Resources[key]); err != nil {
						break
					}
				}
			}
			if err == nil {
				var style *Style
				style, err = registry.ParseJSON(fixture.Style)
				if err == nil {
					report = style.Validation()
					switch fixture.Op {
					case "validate":
						err = registry.ValidateJSON(fixture.Style)
					case "support":
						err = style.RequireExtensionSupport(fixture.Supported)
					}
				}
			}
			if fixture.Code != "" {
				var failure *Error
				if !errors.As(err, &failure) || failure.Code != fixture.Code {
					t.Fatalf("expected %s, got %v", fixture.Code, err)
				}
			} else {
				if err != nil {
					t.Fatal(err)
				}
				if !reflect.DeepEqual(report, fixture.Expected) {
					t.Fatalf("report: %#v, expected %#v", report, fixture.Expected)
				}
			}
		})
	}
}

func TestSchemaResolution(t *testing.T) {
	fixtures := loadSchemaFixtures(t)
	registry, err := NewSchemaRegistry()
	if err != nil {
		t.Fatal(err)
	}
	var fixture schemaFixture
	for _, item := range fixtures.Cases {
		if item.Name == "schema-defines-unprefixed-and-multiple-fields" {
			fixture = item
		}
	}
	before, err := registry.ParseJSON(fixture.Style)
	if err != nil {
		t.Fatal(err)
	}
	report := before.Validation()
	if report.Complete {
		t.Fatal("unregistered schema reported complete")
	}
	url := report.UnresolvedSchemas[0]
	calls := 0
	err = registry.Resolve(url, func(request string) ([]byte, error) {
		calls++
		if request != url {
			t.Fatalf("unexpected URL %s", request)
		}
		return fixtures.Resources["multi"], nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := registry.ValidateJSON(fixture.Style); err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatalf("resolver called %d times", calls)
	}
	report.UnresolvedSchemas[0] = "mutated"
	if before.Validation().UnresolvedSchemas[0] != url {
		t.Fatal("validation report exposes mutable state")
	}
	if err := registry.Register(fixtures.Resources["multi"]); err == nil {
		t.Fatal("duplicate identity accepted")
	}
	if err := registry.Resolve("https://example.test/wrong/v1/schema.json", func(string) ([]byte, error) { return fixtures.Resources["multi"], nil }); err == nil {
		t.Fatal("resolver identity mismatch accepted")
	}
}

func TestGenericExtensionQuery(t *testing.T) {
	data := []byte(`{"version":"3.0","renderer":{"type":"gray","bidx":[1]},"extensions":["https://example.test/unresolved/v7.2.3/schema.json"],"unrelated_field":{"color":"#ABCDEF","nested":[null,true,"中+文",2]},"a.b/c~d":false,"__proto__":{"safe":true},"😀":1,"\ue000":2}`)
	style, err := ParseJSON(data)
	if err != nil {
		t.Fatal(err)
	}
	query, err := EncodeQuery(style)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := DecodeQuery(query)
	if err != nil {
		t.Fatal(err)
	}
	if string(decoded.JSON()) != string(style.JSON()) {
		t.Fatal("opaque extension JSON changed")
	}
	if decoded.Validation().Complete {
		t.Fatal("unknown schema reported complete")
	}
}

func TestReferenceSchemas(t *testing.T) {
	registry, err := NewSchemaRegistry()
	if err != nil {
		t.Fatal(err)
	}
	if err := registry.Register(loadSchemaFixtures(t).Resources["square"]); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile("../../testdata/rendering-vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct {
		Name  string          `json:"name"`
		Style json.RawMessage `json:"style"`
	}
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, fixture := range fixtures {
		t.Run(fixture.Name, func(t *testing.T) {
			if err := registry.ValidateJSON(fixture.Style); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestRegisteredExtensionQueryRoundTrip(t *testing.T) {
	fixtures := loadSchemaFixtures(t)
	for _, fixture := range fixtures.Cases {
		if !fixture.Expected.Complete {
			continue
		}
		t.Run(fixture.Name, func(t *testing.T) {
			registry, err := NewSchemaRegistry()
			if err != nil {
				t.Fatal(err)
			}
			for _, name := range fixture.Schemas {
				if err := registry.Register(fixtures.Resources[name]); err != nil {
					t.Fatal(err)
				}
			}
			original, err := registry.ParseJSON(fixture.Style)
			if err != nil {
				t.Fatal(err)
			}
			query, err := EncodeQuery(original)
			if err != nil {
				t.Fatal(err)
			}
			decoded, err := DecodeQuery(query)
			if err != nil {
				t.Fatal(err)
			}
			restored, err := registry.ParseJSON(decoded.JSON())
			if err != nil {
				t.Fatal(err)
			}
			if !restored.Validation().Complete || string(original.JSON()) != string(restored.JSON()) {
				t.Fatal("registered extension changed on query round trip")
			}
		})
	}
}

// This example uses an unknown declaration to show the preservation boundary.
func ExampleSchemaRegistry_InspectJSON() {
	registry, err := NewSchemaRegistry()
	if err != nil {
		fmt.Println(err)
		return
	}
	report, err := registry.InspectJSON([]byte(`{"version":"3.0","renderer":{"type":"gray","bidx":[1]},"extensions":["https://example.test/custom/v1.0.0/schema.json"]}`))
	if err != nil {
		fmt.Println(err)
		return
	}
	fmt.Println(report.Complete)
	fmt.Println(report.UnresolvedSchemas)
	// Output:
	// false
	// [https://example.test/custom/v1.0.0/schema.json]
}

func loadSchemaFixtures(t *testing.T) schemaFixtures {
	t.Helper()
	data, err := os.ReadFile("../../testdata/schema-cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures schemaFixtures
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	return fixtures
}
