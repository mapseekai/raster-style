package rasterstyle

import (
	"bytes"
	"encoding/json"
	"io"
	"math"
	"strconv"
	"unicode/utf8"

	"github.com/cyberphone/json-canonicalization/go/src/webpki.org/jsoncanonicalizer"
)

const (
	MaxJSONBytes = 2 * 1024 * 1024
	maxDepth     = 64
	maxNodes     = 300000
)

// preflightJSON checks resource limits and Unicode before encoding/json could
// replace malformed UTF-8 or an unpaired surrogate with U+FFFD.
func preflightJSON(data []byte) error {
	if len(data) > MaxJSONBytes {
		return failure("E_LIMIT", "JSON byte budget exceeded", "")
	}
	if !utf8.Valid(data) {
		return failure("E_JSON", "Invalid UTF-8 JSON", "")
	}
	depth := 0
	for i := 0; i < len(data); i++ {
		switch data[i] {
		case '{', '[':
			depth++
			if depth > maxDepth+1 {
				return failure("E_LIMIT", "JSON depth budget exceeded", "")
			}
		case '}', ']':
			depth--
		case '"':
			i++
			for ; i < len(data) && data[i] != '"'; i++ {
				if data[i] != '\\' {
					continue
				}
				i++
				if i >= len(data) {
					return failure("E_JSON", "Unterminated JSON escape", "")
				}
				if data[i] != 'u' {
					continue
				}
				if i+4 >= len(data) {
					return failure("E_JSON", "Incomplete Unicode escape", "")
				}
				code, err := strconv.ParseUint(string(data[i+1:i+5]), 16, 16)
				if err != nil {
					return failure("E_JSON", "Invalid Unicode escape", "")
				}
				i += 4
				if code >= 0xD800 && code <= 0xDBFF {
					if i+6 >= len(data) || data[i+1] != '\\' || data[i+2] != 'u' {
						return failure("E_JSON", "Unpaired Unicode surrogate", "")
					}
					low, err := strconv.ParseUint(string(data[i+3:i+7]), 16, 16)
					if err != nil || low < 0xDC00 || low > 0xDFFF {
						return failure("E_JSON", "Unpaired Unicode surrogate", "")
					}
					i += 6
				} else if code >= 0xDC00 && code <= 0xDFFF {
					return failure("E_JSON", "Unpaired Unicode surrogate", "")
				}
			}
		}
	}
	return nil
}

func parseJSONStrict(data []byte) (any, error) {
	if err := preflightJSON(data); err != nil {
		return nil, err
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	nodes := 0
	var readValue func(int) (any, error)
	readValue = func(depth int) (any, error) {
		nodes++
		if depth > maxDepth || nodes > maxNodes {
			return nil, failure("E_LIMIT", "JSON complexity budget exceeded", "")
		}
		token, err := decoder.Token()
		if err != nil {
			return nil, failure("E_JSON", "Malformed JSON", "")
		}
		delimiter, isDelimiter := token.(json.Delim)
		if !isDelimiter {
			if number, ok := token.(float64); ok && (math.IsNaN(number) || math.IsInf(number, 0)) {
				return nil, failure("E_JSON", "JSON numbers must be finite", "")
			}
			return token, nil
		}
		switch delimiter {
		case '{':
			object := make(map[string]any)
			for decoder.More() {
				token, err := decoder.Token()
				if err != nil {
					return nil, failure("E_JSON", "Invalid object key", "")
				}
				key, ok := token.(string)
				if !ok {
					return nil, failure("E_JSON", "Expected an object key", "")
				}
				if _, duplicate := object[key]; duplicate {
					return nil, failure("E_JSON", "Duplicate JSON key", key)
				}
				value, err := readValue(depth + 1)
				if err != nil {
					return nil, err
				}
				object[key] = value
			}
			if end, err := decoder.Token(); err != nil || end != json.Delim('}') {
				return nil, failure("E_JSON", "Expected object end", "")
			}
			return object, nil
		case '[':
			array := make([]any, 0)
			for decoder.More() {
				value, err := readValue(depth + 1)
				if err != nil {
					return nil, err
				}
				array = append(array, value)
			}
			if end, err := decoder.Token(); err != nil || end != json.Delim(']') {
				return nil, failure("E_JSON", "Expected array end", "")
			}
			return array, nil
		default:
			return nil, failure("E_JSON", "Unexpected JSON delimiter", "")
		}
	}
	value, err := readValue(0)
	if err != nil {
		return nil, err
	}
	if _, err := decoder.Token(); err != io.EOF {
		return nil, failure("E_JSON", "Trailing JSON content", "")
	}
	return value, nil
}

func canonicalJSON(value any) ([]byte, error) {
	// The JCS dependency requires an object or array at the document root.
	// A one-element envelope also supports scalar query values without
	// introducing a second implementation of ECMAScript number formatting.
	data, err := json.Marshal([]any{value})
	if err != nil {
		return nil, failure("E_JSON", "Value is not JSON-compatible", "")
	}
	canonical, err := jsoncanonicalizer.Transform(data)
	if err != nil {
		return nil, failure("E_JSON", "JCS serialization failed", "")
	}
	canonical = canonical[1 : len(canonical)-1]
	if len(canonical) > MaxJSONBytes {
		return nil, failure("E_LIMIT", "JSON byte budget exceeded", "")
	}
	return canonical, nil
}

// CanonicalJSON validates raw JSON and emits RFC 8785 bytes. Duplicate keys fail.
func CanonicalJSON(data []byte) ([]byte, error) {
	value, err := parseJSONStrict(data)
	if err != nil {
		return nil, err
	}
	return canonicalJSON(value)
}
