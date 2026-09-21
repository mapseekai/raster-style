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
func run(line []byte) map[string]string {
	var request struct {
		Op    string `json:"op"`
		JSON  string `json:"json"`
		Query string `json:"query"`
	}
	if err := json.Unmarshal(line, &request); err != nil {
		return map[string]string{"error": "E_JSON"}
	}
	var style *rasterstyle.Style
	var err error
	switch request.Op {
	case "encode":
		style, err = rasterstyle.ParseJSON([]byte(request.JSON))
	case "decode":
		style, err = rasterstyle.DecodeQuery(request.Query)
	default:
		return map[string]string{"error": "E_CONFIG"}
	}
	if err != nil {
		return errorResult(err)
	}
	query, err := rasterstyle.EncodeQuery(style)
	if err != nil {
		return errorResult(err)
	}
	return map[string]string{"query": query, "json": string(style.JSON())}
}
func errorResult(err error) map[string]string {
	var failure *rasterstyle.Error
	if errors.As(err, &failure) {
		return map[string]string{"error": failure.Code}
	}
	return map[string]string{"error": "E_INTERNAL"}
}
