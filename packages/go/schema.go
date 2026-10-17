package rasterstyle

import (
	"fmt"
	"regexp"
	"slices"
	"sync"

	"github.com/mapseekai/raster-style/packages/go/internal/assets"
	"github.com/santhosh-tekuri/jsonschema/v6"
)

const (
	// CoreSchemaURL is the exact identity of the embedded Raster Style 3.0 core.
	CoreSchemaURL = "https://mapseekai.github.io/raster-style/spec/v3/raster-style-v3.schema.json"
	// MosaicSchemaURL is the exact identity of the embedded Mosaic 1.0.0 schema.
	MosaicSchemaURL = "https://mapseekai.github.io/raster-style/extensions/raster/mosaic/v1.0.0/schema.json"
	// TileSchemaURL is the exact identity of the embedded Tile 1.0.0 schema.
	TileSchemaURL = "https://mapseekai.github.io/raster-style/extensions/raster/tile/v1.0.0/schema.json"
	schemaDraft   = "https://json-schema.org/draft/2020-12/schema"
)

// ValidationReport distinguishes preserved documents from fully validated extensions.
type ValidationReport struct {
	// Complete reports that all declarations resolved and passed validation at construction time.
	Complete bool `json:"complete"`
	// UnresolvedSchemas lists unregistered declarations in their original order.
	UnresolvedSchemas []string `json:"unresolvedSchemas"`
}

// SchemaRegistry resolves exact schema identities locally. It is safe for concurrent use.
// Resource identities cannot be overwritten; remote access is never implicit.
// The zero value cannot parse styles; use NewSchemaRegistry. Do not copy a registry after use.
type SchemaRegistry struct {
	mu         sync.Mutex
	resources  map[string]any
	cache      schemaCache
	core       *jsonschema.Schema
	coreFields map[string]any
}

// NewSchemaRegistry creates an offline registry containing the core and official extensions.
// It returns an error if an embedded resource cannot be initialized.
func NewSchemaRegistry() (*SchemaRegistry, error) {
	registry := &SchemaRegistry{resources: make(map[string]any)}
	for _, data := range [][]byte{assets.Schema, assets.MosaicSchema, assets.TileSchema} {
		if err := registry.Register(data); err != nil {
			return nil, err
		}
	}
	registry.coreFields = objectAt(registry.resources[CoreSchemaURL].(map[string]any), "properties")
	var err error
	registry.core, err = compileSchemas(registry.resources, map[string]any{"$ref": CoreSchemaURL})
	if err != nil {
		return nil, err
	}
	return registry, nil
}

var schemaURLPattern = regexp.MustCompile(`^https?://[^\s#]+$`)

// Register adds a draft 2020-12 schema resource. Dependencies may be registered separately.
// It owns a parsed copy, rejects duplicate identities and leaves existing Style reports unchanged.
// Invalid JSON, budgets, identities, drafts and resources are returned as errors.
func (registry *SchemaRegistry) Register(data []byte) error {
	value, err := parseJSONStrict(data)
	if err != nil {
		return err
	}
	schema, ok := value.(map[string]any)
	if !ok {
		return failure("E_CONFIG", "A schema resource must be an object", "")
	}
	id, ok := schema["$id"].(string)
	if !ok || !schemaURLPattern.MatchString(id) {
		return failure("E_CONFIG", "Schema $id must be an absolute HTTP(S) URL without a fragment", "")
	}
	if draft, found := schema["$schema"]; found && draft != schemaDraft {
		return failure("E_CONFIG", "Extension composition requires JSON Schema draft 2020-12", id)
	}
	if err := validateSchemaResource(schema); err != nil {
		return err
	}
	registry.mu.Lock()
	defer registry.mu.Unlock()
	if registry.resources == nil {
		registry.resources = make(map[string]any)
	}
	if _, exists := registry.resources[id]; exists {
		return failure("E_CONFIG", "Schema identity is already registered", id)
	}
	registry.resources[id] = schema
	registry.cache.reset()
	return nil
}

// Resolve is explicit: the caller controls networking, allowlists, timeouts and byte budgets.
// It invokes resolver once, propagates its error and requires the returned $id to equal url.
func (registry *SchemaRegistry) Resolve(url string, resolver func(string) ([]byte, error)) error {
	if !schemaURLPattern.MatchString(url) {
		return failure("E_CONFIG", "Invalid schema URL", url)
	}
	data, err := resolver(url)
	if err != nil {
		return err
	}
	value, err := parseJSONStrict(data)
	if err != nil {
		return err
	}
	schema, ok := value.(map[string]any)
	if !ok || schema["$id"] != url {
		return failure("E_CONFIG", "Resolved schema $id does not match the request", url)
	}
	return registry.Register(data)
}

// ParseJSON parses and normalizes a style without modifying data.
// Unknown declarations are preserved with Complete=false; known errors are returned.
// Success alone does not authorize execution. Missing references return E_SCHEMA_UNRESOLVED.
func (registry *SchemaRegistry) ParseJSON(data []byte) (*Style, error) {
	value, err := parseJSONStrict(data)
	if err != nil {
		return nil, err
	}
	return registry.newStyle(value)
}

// InspectJSON returns an owned completeness snapshot or the same error as ParseJSON.
func (registry *SchemaRegistry) InspectJSON(data []byte) (ValidationReport, error) {
	style, err := registry.ParseJSON(data)
	if err != nil {
		return ValidationReport{}, err
	}
	return style.Validation(), nil
}

// ValidateJSON requires every declared extension schema and all referenced resources.
// It returns parsing, budget, schema or semantic errors; execution support is checked separately.
func (registry *SchemaRegistry) ValidateJSON(data []byte) error {
	report, err := registry.InspectJSON(data)
	if err != nil {
		return err
	}
	if !report.Complete {
		return failure("E_SCHEMA_UNRESOLVED", "Complete validation requires every declared schema", report.UnresolvedSchemas[0])
	}
	return nil
}

// ValidateJSON fully validates with the embedded offline registry.
// Unknown third-party declarations return E_SCHEMA_UNRESOLVED; use a registry to register them.
func ValidateJSON(data []byte) error {
	registry, err := schemaDefaults()
	if err != nil {
		return err
	}
	return registry.ValidateJSON(data)
}

func (registry *SchemaRegistry) newStyle(value any) (*Style, error) {
	if _, err := registry.check(value); err != nil {
		return nil, err
	}
	document := value.(map[string]any)
	if err := normalizeProfile(document); err != nil {
		return nil, err
	}
	if err := validateSemantics(document); err != nil {
		return nil, err
	}
	normalizeColors(document)
	report, err := registry.check(document)
	if err != nil {
		return nil, err
	}
	canonical, err := canonicalJSON(document)
	if err != nil {
		return nil, err
	}
	return &Style{document: document, canonical: canonical, validation: report}, nil
}

func (registry *SchemaRegistry) check(value any) (ValidationReport, error) {
	if registry == nil || registry.core == nil {
		return ValidationReport{}, failure("E_CONFIG", "Use NewSchemaRegistry to initialize schemas", "")
	}
	if err := validateSchemaInstance(registry.core, value, "Raster style does not match the core schema"); err != nil {
		return ValidationReport{}, err
	}
	schema, report, err := registry.composed(arrayAt(value.(map[string]any), "extensions"))
	if err != nil {
		return report, err
	}
	if err := validateSchemaInstance(schema, value, "Raster style does not match the composed schema"); err != nil {
		return report, err
	}
	return report, nil
}

type offlineSchemaLoader struct{ missing string }

func (loader *offlineSchemaLoader) Load(url string) (any, error) {
	loader.missing = url
	return nil, fmt.Errorf("schema resource has not been registered: %s", url)
}

func compileSchemas(resources map[string]any, composition any) (*jsonschema.Schema, error) {
	compiler := jsonschema.NewCompiler()
	compiler.DefaultDraft(jsonschema.Draft2020)
	compiler.UseRegexpEngine(compileSchemaRegexp)
	loader := &offlineSchemaLoader{}
	compiler.UseLoader(loader)
	for id, resource := range resources {
		if err := compiler.AddResource(id, resource); err != nil {
			return nil, failure("E_CONFIG", err.Error(), id)
		}
	}
	const composedURL = "urn:mapseek:raster-style:composed"
	if err := compiler.AddResource(composedURL, composition); err != nil {
		return nil, failure("E_CONFIG", err.Error(), "")
	}
	schema, err := compiler.Compile(composedURL)
	if loader.missing != "" {
		return nil, failure("E_SCHEMA_UNRESOLVED", "A schema reference has not been registered", loader.missing)
	}
	if err != nil {
		return nil, failure("E_CONFIG", "Schema composition could not be compiled: "+err.Error(), "")
	}
	return schema, nil
}

// Validation returns an owned snapshot captured when style was constructed.
// Later registrations do not update it; parse again to obtain a fresh report.
func (style Style) Validation() ValidationReport {
	return ValidationReport{Complete: style.validation.Complete, UnresolvedSchemas: append([]string{}, style.validation.UnresolvedSchemas...)}
}

// RequireExtensionSupport checks execution capability separately from schema validity.
// It returns E_SCHEMA_UNRESOLVED for an incomplete report, E_UNSUPPORTED_EXTENSION
// for an omitted exact URL, and E_SCHEMA for an uninitialized Style.
func (style Style) RequireExtensionSupport(supported []string) error {
	if style.document == nil {
		return failure("E_SCHEMA", "Uninitialized Style", "")
	}
	if !style.validation.Complete {
		return failure("E_SCHEMA_UNRESOLVED", "Complete validation is required before execution", "")
	}
	for _, declaration := range arrayAt(style.document, "extensions") {
		url := declaration.(string)
		if !slices.Contains(supported, url) {
			return failure("E_UNSUPPORTED_EXTENSION", "Executor does not support this exact extension version", url)
		}
	}
	return nil
}

func hasExtension(style map[string]any, url string) bool {
	for _, declaration := range arrayAt(style, "extensions") {
		if declaration == url {
			return true
		}
	}
	return false
}

var schemaOnce sync.Once
var defaultSchemas *SchemaRegistry
var schemaError error

func schemaDefaults() (*SchemaRegistry, error) {
	schemaOnce.Do(func() { defaultSchemas, schemaError = NewSchemaRegistry() })
	return defaultSchemas, schemaError
}

var metaOnce sync.Once
var metaSchema *jsonschema.Schema
var metaError error

func validateSchemaResource(value any) error {
	metaOnce.Do(func() {
		compiler := jsonschema.NewCompiler()
		compiler.UseLoader(&offlineSchemaLoader{})
		metaSchema, metaError = compiler.Compile(schemaDraft)
	})
	if metaError != nil {
		return failure("E_CONFIG", metaError.Error(), "")
	}
	if err := metaSchema.Validate(value); err != nil {
		return failure("E_CONFIG", "Invalid JSON Schema resource", "")
	}
	return nil
}
