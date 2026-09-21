import registry from './generated/query-bindings-v2.js';
import type { RasterStyle } from './generated/types.js';
import { fail } from './errors.js';
import { assertUnicode, byteLength, canonicalJson, parseJsonStrict } from './json.js';
import type { JsonObject, JsonValue } from './json.js';
import { getPath, setPath } from './paths.js';
import { normalizeStyle, parseStyle } from './style.js';

export interface CodecOptions {
  /** Encoded UTF-8 query budget. Defaults to 8192 bytes. */
  maxQueryBytes?: number;
  /** Includes repeated parameters. Defaults to 256. */
  maxParameters?: number;
}

const bindings = [...registry.bindings].sort((left, right) => (left.key < right.key ? -1 : 1));
const byKey = new Map<string, (typeof bindings)[number]>(
  bindings.map((binding) => [binding.key, binding]),
);
const numberPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function escapeComponent(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function unescapeComponent(value: string): string {
  // Reject rather than reinterpret form-urlencoded plus signs as spaces.
  if (value.includes('+') || /%(?![0-9a-fA-F]{2})/.test(value))
    fail('E_QUERY_SYNTAX', 'Invalid Q2 percent encoding');
  if (/[^\x21-\x7e]|[#]/.test(value))
    fail('E_QUERY_SYNTAX', 'Query components must be URI-encoded ASCII');
  try {
    return decodeURIComponent(value);
  } catch {
    return fail('E_QUERY_SYNTAX', 'Invalid UTF-8 query component');
  }
}

function parseNumber(value: string, integer = false): number {
  const result = Number(value);
  if (
    !numberPattern.test(value) ||
    !Number.isFinite(result) ||
    (integer && !Number.isSafeInteger(result))
  ) {
    fail('E_QUERY_SYNTAX', 'Expected a finite numeric token');
  }
  return result;
}

function encodeValue(value: JsonValue, codec: string): string {
  switch (codec) {
    case 'string':
      return value as string;
    case 'number':
    case 'integer':
      return canonicalJson(value);
    case 'boolean':
      return String(value);
    case 'color':
      return (value as string).slice(1);
    case 'json':
      return canonicalJson(value);
    case 'pair':
      return (value as JsonValue[]).map((item) => canonicalJson(item)).join(',');
    default:
      return fail('E_CONFIG', 'Unknown binding codec');
  }
}

function decodeValue(value: string, codec: string): JsonValue {
  switch (codec) {
    case 'string':
      assertUnicode(value);
      return value;
    case 'number':
      return parseNumber(value);
    case 'integer':
      return parseNumber(value, true);
    case 'boolean':
      if (value !== 'true' && value !== 'false') fail('E_QUERY_SYNTAX', 'Expected true or false');
      return value === 'true';
    case 'color':
      if (!/^[a-fA-F0-9]{8}$/.test(value)) fail('E_QUERY_SYNTAX', 'Expected 8-digit RGBA');
      return '#' + value.toLowerCase();
    case 'json':
      return parseJsonStrict(value);
    case 'pair': {
      const pair = value.split(',');
      if (pair.length !== 2) fail('E_QUERY_SYNTAX', 'Expected a numeric pair');
      return pair.map((item) => parseNumber(item));
    }
    default:
      return fail('E_CONFIG', 'Unknown binding codec');
  }
}

/** Reusable immutable configuration; safe to reuse across requests. */
export class QueryCodec {
  readonly maxQueryBytes: number;
  readonly maxParameters: number;

  constructor(options: CodecOptions = {}) {
    this.maxQueryBytes = options.maxQueryBytes ?? 8192;
    this.maxParameters = options.maxParameters ?? 256;
    for (const [key, value] of Object.entries(this)) {
      if (!Number.isSafeInteger(value) || value <= 0)
        fail('E_CONFIG', 'Budget must be a positive integer', key);
    }
  }

  encode(style: unknown): string {
    const document = normalizeStyle(style) as unknown as JsonObject;
    const pairs: [string, string][] = [];
    for (const binding of bindings) {
      const value = getPath(document, binding.path);
      if (value === undefined) continue;
      const repeated = binding.codec.startsWith('repeat_');
      const values = repeated ? (value as JsonValue[]) : [value];
      for (const item of values) {
        pairs.push([binding.key, encodeValue(item, binding.codec.replace(/^repeat_/, ''))]);
      }
    }
    if (pairs.length > this.maxParameters) fail('E_LIMIT', 'Query parameter budget exceeded');
    const query = pairs
      .map(([key, value]) => escapeComponent(key) + '=' + escapeComponent(value))
      .join('&');
    if (byteLength(query) > this.maxQueryBytes)
      fail('E_LIMIT', 'Inline query is too long; use a style reference');
    return query;
  }

  decode(query: string): RasterStyle {
    if (typeof query !== 'string') fail('E_QUERY_SYNTAX', 'Expected a raw query string');
    const raw = query.startsWith('?') ? query.slice(1) : query;
    if (byteLength(raw) > this.maxQueryBytes) fail('E_LIMIT', 'Query byte budget exceeded');
    const parts = raw === '' ? [] : raw.split('&');
    if (parts.length > this.maxParameters) fail('E_LIMIT', 'Query parameter budget exceeded');
    const document = Object.create(null) as JsonObject;
    const seen = new Set<string>();
    for (const part of parts) {
      const equals = part.indexOf('=');
      if (equals <= 0) fail('E_QUERY_SYNTAX', 'Expected key=value');
      const key = unescapeComponent(part.slice(0, equals));
      const value = unescapeComponent(part.slice(equals + 1));
      const binding = byKey.get(key);
      if (!binding) fail('E_UNKNOWN_PARAMETER', 'Unknown Q2 query parameter', key);
      const repeated = binding.codec.startsWith('repeat_');
      if (!repeated && seen.has(key))
        fail('E_DUPLICATE_PARAMETER', 'Duplicate singleton parameter', key);
      seen.add(key);
      const decoded = decodeValue(value, binding.codec.replace(/^repeat_/, ''));
      if (repeated) {
        let array = getPath(document, binding.path) as JsonValue[] | undefined;
        if (!array) {
          array = [];
          setPath(document, binding.path, array);
        }
        array.push(decoded);
      } else {
        setPath(document, binding.path, decoded);
      }
    }
    return normalizeStyle(document);
  }
}

const defaultCodec = new QueryCodec();
export function encodeQuery(style: unknown, options?: CodecOptions): string {
  return (options ? new QueryCodec(options) : defaultCodec).encode(style);
}
export function decodeQuery(query: string, options?: CodecOptions): RasterStyle {
  return (options ? new QueryCodec(options) : defaultCodec).decode(query);
}
export function jsonToQuery(json: string, options?: CodecOptions): string {
  return encodeQuery(parseStyle(json), options);
}
export function queryToJson(query: string, options?: CodecOptions): string {
  return canonicalJson(decodeQuery(query, options));
}
