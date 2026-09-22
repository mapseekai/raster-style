package rasterstyle

import (
	"math"
	"strconv"
	"strings"
	"unicode/utf8"
)

func decodeFormula(text string, post bool) ([]any, error) {
	fail := func(message string) ([]any, error) { return nil, failure("E_SEMANTIC", message, "effects") }
	steps := strings.Split(text, ",")
	if len(steps) > 64 {
		return fail("At most 64 operations are allowed")
	}
	result := make([]any, 0, len(steps))
	for _, step := range steps {
		t := strings.FieldsFunc(step, func(c rune) bool { return c == ' ' || c == '\t' || c == '\r' || c == '\n' })
		if len(t) == 0 {
			return fail("Empty operation")
		}
		op := t[0]
		expected := map[string]int{"gamma": 3, "sigmoidal": 4, "saturation": 2}[op]
		if post {
			if n := map[string]int{"brightness": 3, "contrast": 3, "grayscale": 2, "invert": 2}[op]; n > 0 {
				expected = n
			}
		}
		if expected == 0 || len(t) != expected {
			return fail("Invalid operation or argument count")
		}
		item := map[string]any{"op": op}
		if op == "grayscale" {
			item["method"] = t[1]
		} else {
			start := 1
			if op != "saturation" {
				item["channels"] = t[1]
				start = 2
			}
			for i := start; i < len(t); i++ {
				n, err := numeric(t[i], false)
				if err != nil {
					return fail("Expected a finite numeric argument")
				}
				key := "value"
				if op == "sigmoidal" {
					if i == 2 {
						key = "contrast"
					} else {
						key = "midpoint"
					}
				}
				item[key] = n
			}
		}
		result = append(result, item)
	}
	return result, nil
}

func encodeFormula(value any) (string, error) {
	steps := []string{}
	for _, raw := range value.([]any) {
		item := raw.(map[string]any)
		args := []string{item["op"].(string)}
		for _, key := range []string{"channels", "method"} {
			if v, ok := item[key]; ok {
				args = append(args, v.(string))
			}
		}
		for _, key := range []string{"value", "contrast", "midpoint"} {
			if v, ok := item[key]; ok {
				b, err := canonicalJSON(v)
				if err != nil {
					return "", err
				}
				args = append(args, string(b))
			}
		}
		steps = append(steps, strings.Join(args, " "))
	}
	return strings.Join(steps, ", "), nil
}

func normalizeProfile(document map[string]any) error {
	fail := func(path, message string) error { return failure("E_SEMANTIC", message, path) }
	style := objectAt(document, "renderer")
	channels := 1
	if expression, ok := style["expression"].(string); ok {
		parts := strings.Split(expression, ";")
		if len(parts) > 3 {
			return fail("renderer.expression", "Expected one to three outputs")
		}
		for i, part := range parts {
			parts[i] = strings.Trim(part, " \t\r\n")
			n := utf8.RuneCountInString(parts[i])
			if n == 0 || n > 2048 {
				return fail("renderer.expression", "Invalid expression length")
			}
		}
		style["expression"] = strings.Join(parts, ";")
		channels = len(parts)
	}
	if bands, ok := style["bidx"]; ok {
		channels = len(bands.([]any))
	}
	effects := objectAt(document, "effects")
	for _, key := range []string{"color_formula", "post_color_formula"} {
		for _, raw := range arrayAt(effects, key) {
			item := raw.(map[string]any)
			op := item["op"]
			if op != "saturation" && op != "grayscale" {
				if _, ok := item["channels"]; !ok {
					item["channels"] = "rgb"
					if key == "color_formula" && channels == 1 {
						item["channels"] = "r"
					}
				}
				if key == "color_formula" {
					for _, c := range item["channels"].(string) {
						if strings.IndexRune("rgb", c) >= channels {
							return fail("effects."+key, "Selected channel does not exist")
						}
					}
				}
			} else if key == "color_formula" && channels != 3 {
				return fail("effects."+key, "Saturation requires three output channels")
			}
		}
	}
	if intervals, ok := style["colormap"].([]any); ok {
		end := math.Inf(-1)
		for _, raw := range intervals {
			pair := raw.([]any)[0].([]any)
			lo, hi := pair[0].(float64), pair[1].(float64)
			if lo >= hi || lo < end {
				return fail("renderer.colormap", "Intervals must increase and not overlap")
			}
			end = hi
		}
	} else if entries, ok := style["colormap"].(map[string]any); ok {
		for k := range entries {
			v, e := strconv.ParseFloat(k, 64)
			if e != nil || math.Abs(v) > 9007199254740991 {
				return fail("renderer.colormap", "Colormap keys must be safe integers")
			}
		}
	}
	return nil
}
