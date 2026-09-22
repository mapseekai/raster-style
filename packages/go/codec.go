package rasterstyle

import (
	"encoding/json"
	"math"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/mapseekai/raster-style/packages/go/internal/assets"
)

// Options controls transport budgets. Zero fields use the documented defaults.
type Options struct {
	MaxQueryBytes int
	MaxParameters int
}

// Codec holds immutable configuration and can be shared by request handlers.
type Codec struct {
	maxQueryBytes int
	maxParameters int
}

type binding struct {
	Key   string `json:"key"`
	Path  string `json:"path"`
	Codec string `json:"codec"`
}

var bindingsOnce sync.Once
var bindings []binding
var bindingsByKey map[string]binding
var bindingsError error
var numberPattern = regexp.MustCompile(`^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$`)
var colorPattern = regexp.MustCompile(`^[a-fA-F0-9]{8}$`)

func loadBindings() error {
	bindingsOnce.Do(func() {
		var registry struct {
			Bindings []binding `json:"bindings"`
		}
		if bindingsError = json.Unmarshal(assets.Bindings, &registry); bindingsError != nil {
			return
		}
		bindings = registry.Bindings
		sort.Slice(bindings, func(left, right int) bool { return bindings[left].Key < bindings[right].Key })
		bindingsByKey = make(map[string]binding, len(bindings))
		for _, item := range bindings {
			bindingsByKey[item.Key] = item
		}
	})
	if bindingsError != nil {
		return failure("E_CONFIG", "Invalid embedded binding registry", "")
	}
	return nil
}

func NewCodec(options Options) (*Codec, error) {
	if options.MaxQueryBytes < 0 || options.MaxParameters < 0 {
		return nil, failure("E_CONFIG", "Budgets cannot be negative", "")
	}
	if options.MaxQueryBytes == 0 {
		options.MaxQueryBytes = 8192
	}
	if options.MaxParameters == 0 {
		options.MaxParameters = 256
	}
	if _, err := loadSchema(); err != nil {
		return nil, err
	}
	if err := loadBindings(); err != nil {
		return nil, err
	}
	return &Codec{maxQueryBytes: options.MaxQueryBytes, maxParameters: options.MaxParameters}, nil
}

func escapeComponent(value string) string {
	return strings.ReplaceAll(url.QueryEscape(value), "+", "%20")
}

func unescapeComponent(value string) (string, error) {
	for _, char := range value {
		if char < 0x21 || char > 0x7E || char == '+' || char == '#' {
			return "", failure("E_QUERY_SYNTAX", "Query components must be URI-encoded ASCII", "")
		}
	}
	decoded, err := url.PathUnescape(value)
	if err != nil || !utf8.ValidString(decoded) {
		return "", failure("E_QUERY_SYNTAX", "Invalid Q2 percent encoding or UTF-8", "")
	}
	return decoded, nil
}

func numeric(value string, integer bool) (float64, error) {
	number, err := strconv.ParseFloat(value, 64)
	if !numberPattern.MatchString(value) || err != nil || math.IsNaN(number) || math.IsInf(number, 0) || (integer && (math.Trunc(number) != number || math.Abs(number) > 9007199254740991)) {
		return 0, failure("E_QUERY_SYNTAX", "Expected a finite numeric token", "")
	}
	return number, nil
}

func encodeValue(value any, codec string) (string, error) {
	switch codec {
	case "formula", "post_formula":
		return encodeFormula(value)
	case "nodata":
		if value == "nan" {
			return "nan", nil
		}
		data, err := canonicalJSON(value)
		return string(data), err
	case "string":
		return value.(string), nil
	case "boolean":
		return strconv.FormatBool(value.(bool)), nil
	case "color":
		return value.(string)[1:], nil
	case "number", "integer", "json":
		data, err := canonicalJSON(value)
		return string(data), err
	case "pair":
		pair := value.([]any)
		first, err := canonicalJSON(pair[0])
		if err != nil {
			return "", err
		}
		second, err := canonicalJSON(pair[1])
		return string(first) + "," + string(second), err
	default:
		return "", failure("E_CONFIG", "Unknown binding codec", "")
	}
}

func decodeValue(value, codec string) (any, error) {
	switch codec {
	case "formula", "post_formula":
		return decodeFormula(value, codec == "post_formula")
	case "nodata":
		if value == "nan" {
			return "nan", nil
		}
		return numeric(value, false)
	case "string":
		return value, nil
	case "number":
		return numeric(value, false)
	case "integer":
		return numeric(value, true)
	case "boolean":
		if value != "true" && value != "false" {
			return nil, failure("E_QUERY_SYNTAX", "Expected true or false", "")
		}
		return value == "true", nil
	case "color":
		if !colorPattern.MatchString(value) {
			return nil, failure("E_QUERY_SYNTAX", "Expected 8-digit RGBA", "")
		}
		return "#" + strings.ToLower(value), nil
	case "json":
		return parseJSONStrict([]byte(value))
	case "pair":
		parts := strings.Split(value, ",")
		if len(parts) != 2 {
			return nil, failure("E_QUERY_SYNTAX", "Expected a numeric pair", "")
		}
		first, err := numeric(parts[0], false)
		if err != nil {
			return nil, err
		}
		second, err := numeric(parts[1], false)
		if err != nil {
			return nil, err
		}
		return []any{first, second}, nil
	default:
		return nil, failure("E_CONFIG", "Unknown binding codec", "")
	}
}

func (codec *Codec) EncodeQuery(style *Style) (string, error) {
	if codec == nil {
		return "", failure("E_CONFIG", "Nil Codec", "")
	}
	if style == nil || style.document == nil {
		return "", failure("E_SCHEMA", "Uninitialized Style", "")
	}
	pairs := make([]string, 0, len(bindings))
	for _, binding := range bindings {
		value, present := getPath(style.document, binding.Path)
		if !present {
			continue
		}
		values := []any{value}
		if strings.HasPrefix(binding.Codec, "repeat_") {
			values = value.([]any)
		}
		for _, item := range values {
			encoded, err := encodeValue(item, strings.TrimPrefix(binding.Codec, "repeat_"))
			if err != nil {
				return "", err
			}
			pairs = append(pairs, escapeComponent(binding.Key)+"="+escapeComponent(encoded))
			if len(pairs) > codec.maxParameters {
				return "", failure("E_LIMIT", "Query parameter budget exceeded", "")
			}
		}
	}
	query := strings.Join(pairs, "&")
	if len(query) > codec.maxQueryBytes {
		return "", failure("E_LIMIT", "Inline query is too long; use a style reference", "")
	}
	return query, nil
}

func (codec *Codec) DecodeQuery(query string) (*Style, error) {
	if codec == nil {
		return nil, failure("E_CONFIG", "Nil Codec", "")
	}
	raw := strings.TrimPrefix(query, "?")
	if len(raw) > codec.maxQueryBytes {
		return nil, failure("E_LIMIT", "Query byte budget exceeded", "")
	}
	parts := []string{}
	if raw != "" {
		parts = strings.Split(raw, "&")
	}
	if len(parts) > codec.maxParameters {
		return nil, failure("E_LIMIT", "Query parameter budget exceeded", "")
	}
	document := make(map[string]any)
	seen := make(map[string]bool)
	for _, part := range parts {
		rawKey, rawValue, found := strings.Cut(part, "=")
		if !found || rawKey == "" {
			return nil, failure("E_QUERY_SYNTAX", "Expected key=value", "")
		}
		key, err := unescapeComponent(rawKey)
		if err != nil {
			return nil, err
		}
		value, err := unescapeComponent(rawValue)
		if err != nil {
			return nil, err
		}
		binding, known := bindingsByKey[key]
		if !known {
			return nil, failure("E_UNKNOWN_PARAMETER", "Unknown Q2 query parameter", key)
		}
		repeated := strings.HasPrefix(binding.Codec, "repeat_")
		if !repeated && seen[key] {
			return nil, failure("E_DUPLICATE_PARAMETER", "Duplicate singleton parameter", key)
		}
		seen[key] = true
		decoded, err := decodeValue(value, strings.TrimPrefix(binding.Codec, "repeat_"))
		if err != nil {
			return nil, err
		}
		if repeated {
			old, _ := getPath(document, binding.Path)
			array, _ := old.([]any)
			setPath(document, binding.Path, append(array, decoded))
		} else {
			setPath(document, binding.Path, decoded)
		}
	}
	return newStyle(document)
}

func (codec *Codec) JSONToQuery(data []byte) (string, error) {
	style, err := ParseJSON(data)
	if err != nil {
		return "", err
	}
	return codec.EncodeQuery(style)
}
func (codec *Codec) QueryToJSON(query string) ([]byte, error) {
	style, err := codec.DecodeQuery(query)
	if err != nil {
		return nil, err
	}
	return style.JSON(), nil
}

var defaultOnce sync.Once
var defaultCodec *Codec
var defaultError error

func defaults() (*Codec, error) {
	defaultOnce.Do(func() { defaultCodec, defaultError = NewCodec(Options{}) })
	return defaultCodec, defaultError
}
func EncodeQuery(style *Style) (string, error) {
	codec, err := defaults()
	if err != nil {
		return "", err
	}
	return codec.EncodeQuery(style)
}
func DecodeQuery(query string) (*Style, error) {
	codec, err := defaults()
	if err != nil {
		return nil, err
	}
	return codec.DecodeQuery(query)
}
func JSONToQuery(data []byte) (string, error) {
	codec, err := defaults()
	if err != nil {
		return "", err
	}
	return codec.JSONToQuery(data)
}
func QueryToJSON(query string) ([]byte, error) {
	codec, err := defaults()
	if err != nil {
		return nil, err
	}
	return codec.QueryToJSON(query)
}
