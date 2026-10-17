import assert from 'node:assert/strict';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { RasterStyleError } from './errors.js';
import { CORE_SCHEMA_URL, SchemaRegistry } from './schema.js';

const core = { version: '3.0', renderer: { type: 'gray', bidx: [1] } };
const url = 'https://example.test/registry/v1.0.0/schema.json';
const resource = { $id: url, properties: { gain: { type: 'number', minimum: 0 } } };
const complete = { complete: true, unresolvedSchemas: [] };

test('explicit resolution verifies identity and refreshes unresolved reports', async () => {
  const registry = new SchemaRegistry();
  const style = { ...core, extensions: [url], gain: 2 };
  const before = registry.check(style);
  assert.deepEqual(before, { complete: false, unresolvedSchemas: [url] });
  let calls = 0;
  await registry.resolve(url, (request) => {
    calls++;
    assert.equal(request, url);
    return resource;
  });
  assert.deepEqual(registry.check(style), complete);
  assert.deepEqual(before, { complete: false, unresolvedSchemas: [url] });
  assert.equal(calls, 1);
  await assert.rejects(
    registry.resolve('https://example.test/wrong/v1/schema.json', () => resource),
    { code: 'E_CONFIG' },
  );
  assert.throws(() => registry.register(resource), { code: 'E_CONFIG' });
});

test('registration owns its schema resources', () => {
  const source = structuredClone(resource);
  const registry = new SchemaRegistry().register(source);
  source.properties.gain.minimum = 100;
  assert.deepEqual(registry.check({ ...core, extensions: [url], gain: 2 }), complete);
  assert.throws(() => registry.check({ ...core, extensions: [url], gain: -1 }), {
    code: 'E_SCHEMA',
  });
});

test('resource loading failures use the SDK configuration error boundary', () => {
  const registry = new SchemaRegistry().register({
    $id: url,
    $defs: { shadow: { $id: CORE_SCHEMA_URL, type: 'object' } },
  });
  assert.throws(
    () => registry.check(core),
    (error: unknown) =>
      error instanceof RasterStyleError &&
      error.code === 'E_CONFIG' &&
      error.cause instanceof Error,
  );
});

test('schema cache reuses declaration permutations without changing input order', (t) => {
  const registry = new SchemaRegistry();
  const urls = Array.from({ length: 5 }, (_, i) => `${url}?extension=${i}`);
  for (const id of urls) registry.register({ $id: id, type: 'object' });
  const compile = t.mock.method(Ajv2020.prototype, 'compile');
  let requests = 0;
  for (const extensions of permutations(urls)) {
    const style = { ...core, extensions };
    const before = structuredClone(style);
    assert.deepEqual(registry.check(style), complete);
    assert.deepEqual(style, before);
    requests++;
  }
  assert.equal(requests, 120);
  assert.equal(compositionCalls(compile.mock.calls), 1);
});

test('schema cache evicts cold entries and retains repeatedly used validators', (t) => {
  const registry = new SchemaRegistry();
  const urls = Array.from({ length: 80 }, (_, i) => `${url}?extension=${i}`);
  for (const id of urls) registry.register({ $id: id, type: 'object' });
  const compile = t.mock.method(Ajv2020.prototype, 'compile');
  registry.check(core);
  for (const id of urls) {
    registry.check({ ...core, extensions: [id] });
    registry.check(core);
  }
  assert.equal(compositionCalls(compile.mock.calls), 81);
  registry.check(core);
  assert.equal(compositionCalls(compile.mock.calls), 81);
  registry.check({ ...core, extensions: [urls[0]] });
  assert.equal(compositionCalls(compile.mock.calls), 82);
  registry.check(core);
  assert.equal(compositionCalls(compile.mock.calls), 82);
});

function* permutations(values: readonly string[]): Generator<string[]> {
  if (values.length === 0) {
    yield [];
    return;
  }
  for (const [i, value] of values.entries()) {
    for (const rest of permutations(values.filter((_, index) => index !== i)))
      yield [value, ...rest];
  }
}

function compositionCalls(calls: readonly { arguments: readonly unknown[] }[]): number {
  return calls.filter(({ arguments: [schema] }) => {
    if (!schema || typeof schema !== 'object' || !('allOf' in schema)) return false;
    if (!Array.isArray(schema.allOf)) return false;
    const first: unknown = schema.allOf[0];
    return (
      !!first && typeof first === 'object' && '$ref' in first && first.$ref === CORE_SCHEMA_URL
    );
  }).length;
}
