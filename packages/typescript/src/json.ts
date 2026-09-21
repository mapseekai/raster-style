import { fail, RasterStyleError } from './errors.js';

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}
export const MAX_JSON_BYTES = 2 * 1024 * 1024;
export const MAX_DEPTH = 64;
export const MAX_NODES = 300_000;
const utf8 = new TextEncoder();

export function byteLength(text: string): number {
  return utf8.encode(text).length;
}

export function assertUnicode(text: string): void {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail('E_JSON', 'Unpaired Unicode surrogate');
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      fail('E_JSON', 'Unpaired Unicode surrogate');
    }
  }
}

/** RFC 8785 serialization, using ECMAScript binary64 numbers and UTF-16 key ordering. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  let nodes = 0;
  function visit(current: unknown, depth: number): string {
    if (depth > MAX_DEPTH || ++nodes > MAX_NODES)
      fail('E_LIMIT', 'JSON complexity budget exceeded');
    if (current === null) return 'null';
    if (typeof current === 'string') {
      assertUnicode(current);
      return JSON.stringify(current);
    }
    if (typeof current === 'boolean') return String(current);
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) fail('E_JSON', 'JSON numbers must be finite');
      return JSON.stringify(current);
    }
    if (typeof current !== 'object') fail('E_JSON', 'Value is not JSON-compatible');
    if (ancestors.has(current)) fail('E_JSON', 'Cyclic JSON value');
    ancestors.add(current);
    let output: string;
    if (Array.isArray(current)) {
      if (
        Object.keys(current).length !== current.length ||
        Object.getOwnPropertySymbols(current).length
      ) {
        fail('E_JSON', 'Sparse or decorated arrays are not JSON');
      }
      output = '[' + Array.from(current, (item) => visit(item, depth + 1)).join(',') + ']';
    } else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(current))) {
        fail('E_JSON', 'Only plain JSON objects are accepted');
      }
      if (Object.getOwnPropertySymbols(current).length)
        fail('E_JSON', 'Symbol properties are not JSON');
      const object = current as Record<string, unknown>;
      output =
        '{' +
        Object.keys(object)
          .sort()
          .map((key) => {
            assertUnicode(key);
            const descriptor = Object.getOwnPropertyDescriptor(object, key);
            if (descriptor?.get || descriptor?.set)
              fail('E_JSON', 'JSON accessors are not accepted');
            return JSON.stringify(key) + ':' + visit(object[key], depth + 1);
          })
          .join(',') +
        '}';
    }
    ancestors.delete(current);
    return output;
  }
  const result = visit(value, 0);
  if (byteLength(result) > MAX_JSON_BYTES) fail('E_LIMIT', 'JSON byte budget exceeded');
  return result;
}

/** Parse before duplicate keys can be erased by JSON.parse. Does not evaluate expressions. */
export function parseJsonStrict(text: string): JsonValue {
  if (typeof text !== 'string') fail('E_JSON', 'Expected a JSON string');
  if (byteLength(text) > MAX_JSON_BYTES) fail('E_LIMIT', 'JSON byte budget exceeded');
  assertUnicode(text);
  let index = 0;
  let nodes = 0;
  const whitespace = () => {
    while (index < text.length && /[\x20\t\r\n]/.test(text[index]!)) index++;
  };
  function string(): string {
    const start = index++;
    while (index < text.length) {
      if (text[index] === '\\') {
        index += 2;
        continue;
      }
      if (text[index++] === '"') {
        const result = JSON.parse(text.slice(start, index)) as string;
        assertUnicode(result);
        return result;
      }
    }
    return fail('E_JSON', 'Unterminated JSON string');
  }
  function value(depth: number): JsonValue {
    if (depth > MAX_DEPTH || ++nodes > MAX_NODES)
      fail('E_LIMIT', 'JSON complexity budget exceeded');
    whitespace();
    if (text[index] === '"') return string();
    if (text[index] === '{') {
      index++;
      whitespace();
      const object = Object.create(null) as JsonObject;
      if (text[index] === '}') {
        index++;
        return object;
      }
      while (true) {
        whitespace();
        if (text[index] !== '"') fail('E_JSON', 'Expected a JSON object key');
        const key = string();
        if (Object.hasOwn(object, key)) fail('E_JSON', 'Duplicate JSON key', key);
        whitespace();
        if (text[index++] !== ':') fail('E_JSON', 'Expected a colon');
        object[key] = value(depth + 1);
        whitespace();
        const delimiter = text[index++];
        if (delimiter === '}') return object;
        if (delimiter !== ',') fail('E_JSON', 'Expected an object delimiter');
      }
    }
    if (text[index] === '[') {
      index++;
      whitespace();
      const array: JsonValue[] = [];
      if (text[index] === ']') {
        index++;
        return array;
      }
      while (true) {
        array.push(value(depth + 1));
        whitespace();
        const delimiter = text[index++];
        if (delimiter === ']') return array;
        if (delimiter !== ',') fail('E_JSON', 'Expected an array delimiter');
      }
    }
    const literals: [string, JsonValue][] = [
      ['null', null],
      ['true', true],
      ['false', false],
    ];
    for (const [literal, result] of literals) {
      if (text.startsWith(literal, index)) {
        index += literal.length;
        return result;
      }
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index));
    if (!match) fail('E_JSON', 'Invalid JSON value');
    index += match[0].length;
    const number = Number(match[0]);
    if (!Number.isFinite(number)) fail('E_JSON', 'JSON numbers must be finite');
    return number;
  }
  try {
    const result = value(0);
    whitespace();
    if (index !== text.length) fail('E_JSON', 'Trailing JSON content');
    return result;
  } catch (error) {
    if (error instanceof RasterStyleError) throw error;
    return fail('E_JSON', 'Malformed JSON string');
  }
}
