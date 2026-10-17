package rasterstyle

import (
	"errors"
	"testing"

	"github.com/dlclark/regexp2/v2"
	"github.com/santhosh-tekuri/jsonschema/v6"
)

func TestSchemaRegexpEngineFailureCannotSatisfyNegation(t *testing.T) {
	for _, negated := range []bool{false, true} {
		compiler := jsonschema.NewCompiler()
		compiler.DefaultDraft(jsonschema.Draft2020)
		compiler.UseRegexpEngine(func(pattern string) (jsonschema.Regexp, error) {
			compiled, err := regexp2.Compile(pattern, regexp2.ECMAScript|regexp2.Unicode, regexp2.OptionMaxBacktrackingStackSize(32))
			if err != nil {
				return nil, err
			}
			return schemaRegexp{compiled}, nil
		})
		document := map[string]any{"type": "string", "pattern": "(?:^){100}"}
		if negated {
			document = map[string]any{"not": document}
		}
		if err := compiler.AddResource("urn:regexp-limit", document); err != nil {
			t.Fatal(err)
		}
		schema, err := compiler.Compile("urn:regexp-limit")
		if err != nil {
			t.Fatal(err)
		}
		err = validateSchemaInstance(schema, "", "schema validation failed")
		var failure *Error
		if !errors.As(err, &failure) || failure.Code != "E_LIMIT" {
			t.Fatalf("negated=%v: expected E_LIMIT, got %v", negated, err)
		}
	}
}

func TestSchemaRegexpCompileFailure(t *testing.T) {
	if _, err := compileSchemaRegexp("["); err == nil {
		t.Fatal("invalid pattern was accepted")
	}
}
