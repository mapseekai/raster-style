// Command conformance is a line-oriented runner for cross-language contract tests.
package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"

	rasterstyle "github.com/mapseekai/raster-style/packages/go"
)

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 4096), 8*1024*1024)
	writer := json.NewEncoder(os.Stdout)
	for scanner.Scan() {
		result := run(scanner.Bytes())
		if err := writer.Encode(result); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
	if err := scanner.Err(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run(line []byte) map[string]any {
	var request struct {
		Op        string            `json:"op"`
		Schemas   []json.RawMessage `json:"schemas"`
		Supported []string          `json:"supported"`
		JSON      string            `json:"json"`
		Query     string            `json:"query"`
	}
	if err := json.Unmarshal(line, &request); err != nil {
		return map[string]any{"error": "E_JSON"}
	}
	if request.Op == "inspect" || request.Op == "validate" || request.Op == "support" {
		registry, err := rasterstyle.NewSchemaRegistry()
		if err != nil {
			return errorResult(err)
		}
		for _, schema := range request.Schemas {
			if err := registry.Register(schema); err != nil {
				return errorResult(err)
			}
		}
		style, err := registry.ParseJSON([]byte(request.JSON))
		if err != nil {
			return errorResult(err)
		}
		if request.Op == "validate" {
			if err := registry.ValidateJSON([]byte(request.JSON)); err != nil {
				return errorResult(err)
			}
		}
		if request.Op == "support" {
			if err := style.RequireExtensionSupport(request.Supported); err != nil {
				return errorResult(err)
			}
		}
		report := style.Validation()
		return map[string]any{"complete": report.Complete, "unresolvedSchemas": report.UnresolvedSchemas}
	}
	var style *rasterstyle.Style
	var err error
	switch request.Op {
	case "encode":
		style, err = rasterstyle.ParseJSON([]byte(request.JSON))
	case "decode":
		style, err = rasterstyle.DecodeQuery(request.Query)
	default:
		return map[string]any{"error": "E_CONFIG"}
	}
	if err != nil {
		return errorResult(err)
	}
	query, err := rasterstyle.EncodeQuery(style)
	if err != nil {
		return errorResult(err)
	}
	return map[string]any{"query": query, "json": string(style.JSON())}
}
func errorResult(err error) map[string]any {
	var failure *rasterstyle.Error
	if errors.As(err, &failure) {
		return map[string]any{"error": failure.Code}
	}
	return map[string]any{"error": "E_INTERNAL"}
}
