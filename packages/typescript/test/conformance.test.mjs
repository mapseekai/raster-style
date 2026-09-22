import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  QueryCodec,
  canonicalJson,
  parseJsonStrict,
  parseStyle,
  normalizeStyle,
  encodeQuery,
  decodeQuery,
  jsonToQuery,
  queryToJson,
  RasterStyleError,
} from '../dist/index.js';

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../../../testdata/${name}.json`, import.meta.url), 'utf8'));
for (const fixture of load('roundtrip')) {
  test(`golden: ${fixture.name}`, () => {
    assert.equal(encodeQuery(fixture.raster_style), fixture.query);
    assert.equal(
      canonicalJson(decodeQuery(fixture.query)),
      canonicalJson(normalizeStyle(fixture.raster_style)),
    );
    assert.equal(jsonToQuery(JSON.stringify(fixture.raster_style)), fixture.query);
    assert.equal(queryToJson('?' + fixture.query), canonicalJson(decodeQuery(fixture.query)));
  });
}
for (const fixture of load('invalid-queries')) {
  test(`reject query: ${fixture.name}`, () => {
    assert.throws(
      () => decodeQuery(fixture.query),
      (error) => error instanceof RasterStyleError && error.code === fixture.code,
    );
  });
}
for (const fixture of load('invalid-styles')) {
  test(`reject style: ${fixture.name}`, () => {
    assert.throws(
      () => parseStyle(fixture.json),
      (error) => error.code === fixture.code,
    );
  });
}
for (const fixture of load('canonical')) {
  test(`JCS: ${fixture.name}`, () =>
    assert.equal(canonicalJson(parseJsonStrict(fixture.json)), fixture.canonical));
}
for (const fixture of load('invalid-json')) {
  test(`reject JSON: ${fixture.name}`, () =>
    assert.throws(
      () => parseJsonStrict(fixture.json),
      (error) => error.code === fixture.code,
    ));
}

test('colors normalize without mutating the input', () => {
  const original = {
    version: '2.0',
    renderer: { type: 'single_color', bidx: [1], color: '#ABCDEF' },
  };
  const before = JSON.stringify(original);
  assert.equal(decodeQuery(encodeQuery(original)).renderer.color, '#abcdefff');
  assert.equal(JSON.stringify(original), before);
});
test('configuration is reusable and enforces budgets', () => {
  const codec = new QueryCodec({ maxQueryBytes: 8 });
  assert.throws(
    () => codec.decode('version=2.0&type=gray'),
    (error) => error.code === 'E_LIMIT',
  );
  assert.throws(
    () => codec.encode(load('roundtrip')[0].raster_style),
    (error) => error.code === 'E_LIMIT',
  );
  assert.throws(
    () => new QueryCodec({ maxParameters: 1 }).decode('version=2.0&type=gray'),
    (error) => error.code === 'E_LIMIT',
  );
  assert.throws(
    () => new QueryCodec({ maxQueryBytes: 0 }),
    (error) => error.code === 'E_CONFIG',
  );
});
test('non-JSON JavaScript values are rejected', () => {
  for (const value of [NaN, Infinity, undefined, 1n, new Date(), [undefined], new Array(2)]) {
    assert.throws(
      () => canonicalJson(value),
      (error) => error.code === 'E_JSON',
    );
  }
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(
    () => canonicalJson(cyclic),
    (error) => error.code === 'E_JSON',
  );
});
test('JSON byte budget applies before parsing', () => {
  assert.throws(
    () => parseJsonStrict(' '.repeat(2 * 1024 * 1024 + 1)),
    (error) => error.code === 'E_LIMIT',
  );
});
