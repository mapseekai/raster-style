package rasterstyle

import (
	"encoding/json"
	"strings"
	"sync"

	"github.com/mapseekai/raster-style/packages/go/internal/assets"
	"github.com/santhosh-tekuri/jsonschema/v6"
)

// Style is a validated, normalized document. Its fields are intentionally private:
// preserving omitted fields and union variants is part of the wire contract.
// A successfully constructed Style is immutable and safe for concurrent readers.
type Style struct {
	document  map[string]any
	canonical []byte
}

var schemaOnce sync.Once
var schemaValidator *jsonschema.Schema
var schemaError error

func loadSchema() (*jsonschema.Schema, error) {
	schemaOnce.Do(func() {
		var document any
		if schemaError = json.Unmarshal(assets.Schema, &document); schemaError != nil {
			return
		}
		compiler := jsonschema.NewCompiler()
		schemaError = compiler.AddResource("urn:mapseek:raster-style:2.0", document)
		if schemaError != nil {
			return
		}
		schemaValidator, schemaError = compiler.Compile("urn:mapseek:raster-style:2.0")
	})
	if schemaError != nil {
		return nil, failure("E_CONFIG", "Embedded schema could not be compiled", "")
	}
	return schemaValidator, nil
}

func newStyle(value any) (*Style, error) {
	validator, err := loadSchema()
	if err != nil {
		return nil, err
	}
	if err := validator.Validate(value); err != nil {
		return nil, failure("E_SCHEMA", "Raster style does not match draft.2 schema", "")
	}
	document := value.(map[string]any)
	if err := validateSemantics(document); err != nil {
		return nil, err
	}
	normalizeColors(document)
	canonical, err := canonicalJSON(document)
	if err != nil {
		return nil, err
	}
	return &Style{document: document, canonical: canonical}, nil
}

// ParseJSON validates the complete JSON style; it never inserts renderer defaults.
func ParseJSON(data []byte) (*Style, error) {
	value, err := parseJSONStrict(data)
	if err != nil {
		return nil, err
	}
	return newStyle(value)
}

// MarshalJSON enables json.Marshal(style) and Fiber's c.JSON(style).
func (style Style) MarshalJSON() ([]byte, error) {
	if style.document == nil {
		return nil, failure("E_SCHEMA", "Uninitialized Style", "")
	}
	return append([]byte(nil), style.canonical...), nil
}

// UnmarshalJSON validates before replacing the receiver; failures leave it intact.
func (style *Style) UnmarshalJSON(data []byte) error {
	parsed, err := ParseJSON(data)
	if err != nil {
		return err
	}
	*style = *parsed
	return nil
}

// JSON returns an owned copy; callers cannot mutate the validated document.
func (style Style) JSON() []byte { return append([]byte(nil), style.canonical...) }

// Document returns an independent map for callers that need to edit a style.
// Submit edits through ParseJSON before encoding again.
func (style Style) Document() map[string]any {
	return cloneObject(style.document)
}

func cloneObject(source map[string]any) map[string]any {
	if source == nil {
		return nil
	}
	result := make(map[string]any, len(source))
	for key, value := range source {
		result[key] = cloneValue(value)
	}
	return result
}
func cloneValue(value any) any {
	switch current := value.(type) {
	case map[string]any:
		return cloneObject(current)
	case []any:
		result := make([]any, len(current))
		for index, item := range current {
			result[index] = cloneValue(item)
		}
		return result
	default:
		return value
	}
}

func objectAt(object map[string]any, key string) map[string]any {
	result, _ := object[key].(map[string]any)
	return result
}
func arrayAt(object map[string]any, key string) []any {
	result, _ := object[key].([]any)
	return result
}
func getPath(object map[string]any, path string) (any, bool) {
	parts := strings.Split(path, ".")
	for _, key := range parts[:len(parts)-1] {
		object = objectAt(object, key)
		if object == nil {
			return nil, false
		}
	}
	value, present := object[parts[len(parts)-1]]
	return value, present
}
func setPath(object map[string]any, path string, value any) {
	parts := strings.Split(path, ".")
	for _, key := range parts[:len(parts)-1] {
		next := objectAt(object, key)
		if next == nil {
			next = make(map[string]any)
			object[key] = next
		}
		object = next
	}
	object[parts[len(parts)-1]] = value
}
func normalizeColor(color string) string {
	color = strings.ToLower(color)
	if len(color) == 7 {
		color += "ff"
	}
	return color
}
func normalizeColors(style map[string]any) {
	for _, path := range []string{"renderer.color", "opacity.nodata_color", "image.background"} {
		if color, found := getPath(style, path); found {
			setPath(style, path, normalizeColor(color.(string)))
		}
	}
	colorMap := objectAt(objectAt(style, "renderer"), "color_map")
	for _, key := range []string{"under", "over", "outside_color", "fallback_color"} {
		if color, ok := colorMap[key].(string); ok && strings.HasPrefix(color, "#") {
			colorMap[key] = normalizeColor(color)
		}
	}
	for _, key := range []string{"stops", "entries"} {
		for _, item := range arrayAt(colorMap, key) {
			entry := item.(map[string]any)
			entry["color"] = normalizeColor(entry["color"].(string))
		}
	}
	for index, color := range arrayAt(colorMap, "colors") {
		colorMap["colors"].([]any)[index] = normalizeColor(color.(string))
	}
}
