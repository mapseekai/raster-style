package rasterstyle

import (
	"container/list"
	"encoding/json"
	"maps"
	"slices"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

type schemaCache struct {
	entries    map[string]*list.Element
	order      list.List
	flights    map[string]*schemaCompilation
	generation uint64
}

type schemaCompilation struct {
	done   chan struct{}
	schema *jsonschema.Schema
	err    error
}

type schemaCacheEntry struct {
	key    string
	schema *jsonschema.Schema
}

// reset runs under the registry mutex when the available resources change.
func (cache *schemaCache) reset() {
	cache.entries = make(map[string]*list.Element)
	cache.flights = make(map[string]*schemaCompilation)
	cache.order.Init()
	cache.generation++
}

func (registry *SchemaRegistry) composed(declarations []any) (*jsonschema.Schema, ValidationReport, error) {
	registry.mu.Lock()
	report := ValidationReport{Complete: true, UnresolvedSchemas: []string{}}
	known := make([]string, 0, len(declarations))
	for _, declaration := range declarations {
		url := declaration.(string)
		if _, exists := registry.resources[url]; exists {
			known = append(known, url)
		} else {
			report.Complete = false
			report.UnresolvedSchemas = append(report.UnresolvedSchemas, url)
		}
	}
	slices.Sort(known)
	encoded, err := json.Marshal([]any{known, report.Complete})
	if err != nil {
		registry.mu.Unlock()
		return nil, report, err
	}
	key := string(encoded)
	cache := &registry.cache
	if entry, exists := cache.entries[key]; exists {
		cache.order.MoveToFront(entry)
		schema := entry.Value.(schemaCacheEntry).schema
		registry.mu.Unlock()
		return schema, report, nil
	}
	if pending, exists := cache.flights[key]; exists {
		registry.mu.Unlock()
		<-pending.done
		return pending.schema, report, pending.err
	}
	pending := &schemaCompilation{done: make(chan struct{})}
	cache.flights[key] = pending
	resources, generation := maps.Clone(registry.resources), cache.generation
	registry.mu.Unlock()

	// Compilation works from immutable resources outside the registry mutex.
	refs := []any{map[string]any{"$ref": CoreSchemaURL}}
	for _, url := range known {
		refs = append(refs, map[string]any{"$ref": url})
	}
	composition := map[string]any{"$schema": schemaDraft, "allOf": refs}
	if report.Complete {
		composition["unevaluatedProperties"] = false
	}
	schema, err := compileSchemas(resources, composition)

	registry.mu.Lock()
	pending.schema, pending.err = schema, err
	// A concurrent registration invalidates the old snapshot's cache entry.
	if cache.generation == generation && err == nil {
		if len(cache.entries) >= 64 {
			oldest := cache.order.Back()
			delete(cache.entries, oldest.Value.(schemaCacheEntry).key)
			cache.order.Remove(oldest)
		}
		cache.entries[key] = cache.order.PushFront(schemaCacheEntry{key: key, schema: schema})
	}
	if cache.flights[key] == pending {
		delete(cache.flights, key)
	}
	close(pending.done)
	registry.mu.Unlock()
	return schema, report, err
}
