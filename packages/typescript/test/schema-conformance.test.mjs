import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  SchemaRegistry,
  parseStyle,
  normalizeStyle,
  inspectStyle,
  validateStyle,
  requireExtensionSupport,
  encodeQuery,
  decodeQuery,
  canonicalJson,
} from '../dist/index.js';

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../../../testdata/${name}.json`, import.meta.url), 'utf8'));
const { resources, cases } = load('schema-cases');
for (const fixture of cases) {
  test(`schema: ${fixture.name}`, () => {
    const run = () => {
      const registry = new SchemaRegistry();
      for (const name of fixture.schemas) registry.register(resources[name]);
      const style = normalizeStyle(fixture.style, registry);
      if (fixture.op === 'validate') validateStyle(style, registry);
      if (fixture.op === 'support')
        requireExtensionSupport(style, fixture.supported ?? [], registry);
      return inspectStyle(style, registry);
    };
    if (fixture.code) assert.throws(run, (error) => error.code === fixture.code);
    else assert.deepEqual(run(), fixture.expected);
  });
}

test('normalization does not mutate caller data', () => {
  const registry = new SchemaRegistry().register(resources.multi);
  const input = cases.find(
    (item) => item.name === 'schema-defines-unprefixed-and-multiple-fields',
  ).style;
  const before = canonicalJson(input);
  validateStyle(input, registry);
  assert.equal(canonicalJson(input), before);
});

test('generic query preserves multiple arbitrary top-level keys, JSON scalars and Unicode', () => {
  const document = parseStyle(`{
    "version":"3.0", "renderer":{"type":"gray","bidx":[1]},
    "extensions":["https://example.test/unresolved/v7.2.3/schema.json"],
    "unrelated_field":{"color":"#ABCDEF","nested":[null,true,"中+文",2]},
    "a.b/c~d":false,"__proto__":{"safe":true},"😀":1,"\ue000":2
  }`);
  const query = encodeQuery(document);
  assert.equal(canonicalJson(decodeQuery(query)), canonicalJson(document));
  assert.equal(document.unrelated_field.color, '#ABCDEF');
  assert.equal({}.safe, undefined);
  assert.equal(inspectStyle(document).complete, false);
  assert.throws(
    () => validateStyle(document),
    (error) => error.code === 'E_SCHEMA_UNRESOLVED',
  );
});

test('all numeric reference inputs pass complete offline extension validation', () => {
  const registry = new SchemaRegistry().register(resources.square);
  for (const fixture of load('rendering-vectors')) validateStyle(fixture.style, registry);
});

test('registered extensions retain full validation after a JSON / Q3 round trip', () => {
  for (const fixture of cases.filter((item) => item.expected?.complete)) {
    const registry = new SchemaRegistry();
    for (const name of fixture.schemas) registry.register(resources[name]);
    const original = normalizeStyle(fixture.style, registry);
    const restored = normalizeStyle(decodeQuery(encodeQuery(original)), registry);
    validateStyle(restored, registry);
    assert.equal(canonicalJson(restored), canonicalJson(original), fixture.name);
  }
});
