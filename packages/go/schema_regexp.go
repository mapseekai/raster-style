package rasterstyle

import (
	"fmt"
	"time"

	"github.com/dlclark/regexp2/v2"
	"github.com/santhosh-tekuri/jsonschema/v6"
)

// JSON Schema patterns follow the ECMAScript Unicode dialect, including
// lookarounds, backreferences and ECMAScript whitespace classes.
func compileSchemaRegexp(pattern string) (jsonschema.Regexp, error) {
	compiled, err := regexp2.Compile(pattern, regexp2.ECMAScript|regexp2.Unicode)
	if err != nil {
		return nil, err
	}
	compiled.MatchTimeout = time.Second
	return schemaRegexp{compiled}, nil
}

type schemaRegexp struct{ *regexp2.Regexp }

func (pattern schemaRegexp) MatchString(value string) bool {
	matched, err := pattern.Regexp.MatchString(value)
	if err != nil {
		// The schema library's regexp interface returns only bool. Carry the
		// engine failure to the validation boundary instead of treating it as
		// a non-match (which could incorrectly satisfy a negated condition).
		panic(schemaRegexpError{err})
	}
	return matched
}

type schemaRegexpError struct{ err error }

func validateSchemaInstance(schema *jsonschema.Schema, value any, message string) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			if engine, ok := recovered.(schemaRegexpError); ok {
				err = failure("E_LIMIT", fmt.Sprintf("Schema regexp evaluation stopped: %v", engine.err), "")
				return
			}
			panic(recovered)
		}
	}()
	if err := schema.Validate(value); err != nil {
		return failure("E_SCHEMA", message, "")
	}
	return nil
}
