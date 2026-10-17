package rasterstyle

import (
	"encoding/json"
	"fmt"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

func cacheRegistry(t *testing.T, count int) (*SchemaRegistry, []string) {
	t.Helper()
	registry, err := NewSchemaRegistry()
	if err != nil {
		t.Fatal(err)
	}
	urls := make([]string, count)
	for i := range urls {
		urls[i] = fmt.Sprintf("https://example.test/cache/%d/v1.0.0/schema.json", i)
		data, err := json.Marshal(map[string]any{"$id": urls[i], "type": "object"})
		if err != nil {
			t.Fatal(err)
		}
		if err := registry.Register(data); err != nil {
			t.Fatal(err)
		}
	}
	return registry, urls
}

func TestSchemaCacheDeclarationPermutations(t *testing.T) {
	registry, urls := cacheRegistry(t, 5)
	var original *jsonschema.Schema
	count := 0
	var visit func(int)
	visit = func(position int) {
		if position == len(urls) {
			declarations := make([]any, len(urls))
			for i, url := range urls {
				declarations[i] = url
			}
			before := slices.Clone(declarations)
			compiled, report, err := registry.composed(declarations)
			if err != nil {
				t.Fatal(err)
			}
			if !report.Complete {
				t.Fatal("complete registry reported unresolved schemas")
			}
			if original == nil {
				original = compiled
			}
			if compiled != original {
				t.Fatal("declaration ordering caused recompilation")
			}
			if !slices.Equal(declarations, before) {
				t.Fatal("declaration order mutated")
			}
			count++
			return
		}
		for i := position; i < len(urls); i++ {
			urls[position], urls[i] = urls[i], urls[position]
			visit(position + 1)
			urls[position], urls[i] = urls[i], urls[position]
		}
	}
	visit(0)
	if count != 120 || len(registry.cache.entries) != 1 {
		t.Fatalf("permutations=%d cache entries=%d", count, len(registry.cache.entries))
	}
}

func TestSchemaCacheRetainsHotEntries(t *testing.T) {
	registry, urls := cacheRegistry(t, 80)
	hot, _, err := registry.composed(nil)
	if err != nil {
		t.Fatal(err)
	}
	var firstCold *jsonschema.Schema
	for i, url := range urls {
		compiled, _, err := registry.composed([]any{url})
		if err != nil {
			t.Fatal(err)
		}
		if i == 0 {
			firstCold = compiled
		}
		cached, _, err := registry.composed(nil)
		if err != nil {
			t.Fatal(err)
		}
		if cached != hot {
			t.Fatal("hot entry was discarded")
		}
		if len(registry.cache.entries) > 64 || registry.cache.order.Len() != len(registry.cache.entries) {
			t.Fatal("LRU capacity invariant failed")
		}
	}
	replacement, _, err := registry.composed([]any{urls[0]})
	if err != nil {
		t.Fatal(err)
	}
	if replacement == firstCold {
		t.Fatal("oldest cold entry should have been evicted")
	}
}

func TestSchemaCacheCoalescesConcurrentCompilation(t *testing.T) {
	registry, urls := cacheRegistry(t, 2)
	const requests = 16
	start := make(chan struct{})
	results := make(chan *jsonschema.Schema, requests)
	errors := make(chan error, requests)
	var group sync.WaitGroup
	for range requests {
		group.Add(1)
		go func() {
			defer group.Done()
			<-start
			compiled, _, err := registry.composed([]any{urls[1], urls[0]})
			if err != nil {
				errors <- err
				return
			}
			results <- compiled
		}()
	}
	close(start)
	group.Wait()
	close(errors)
	for err := range errors {
		t.Fatal(err)
	}
	close(results)
	var first *jsonschema.Schema
	for compiled := range results {
		if first == nil {
			first = compiled
		}
		if compiled != first {
			t.Fatal("same-key requests produced different validators")
		}
	}
	if len(registry.cache.flights) != 0 {
		t.Fatal("finished compilation retained an in-flight entry")
	}
}

func TestSchemaCompilationWaitReleasesRegistryLock(t *testing.T) {
	registry, urls := cacheRegistry(t, 1)
	key, err := json.Marshal([]any{urls, true})
	if err != nil {
		t.Fatal(err)
	}
	pending := &schemaCompilation{done: make(chan struct{}), schema: registry.core}
	registry.cache.flights[string(key)] = pending
	defer close(pending.done)
	waiting := make(chan struct{})
	go func() {
		close(waiting)
		_, _, _ = registry.composed([]any{urls[0]})
	}()
	<-waiting
	completed := make(chan error, 1)
	go func() {
		_, _, err := registry.composed(nil)
		completed <- err
	}()
	select {
	case err := <-completed:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("one in-flight compilation blocked an unrelated cached combination")
	}
}
