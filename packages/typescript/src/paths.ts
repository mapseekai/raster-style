import type { JsonObject, JsonValue } from './json.js';

export function getPath(object: JsonObject, path: string): JsonValue | undefined {
  let current: JsonValue | undefined = object;
  for (const key of path.split('.')) {
    if (
      !current ||
      typeof current !== 'object' ||
      Array.isArray(current) ||
      !Object.hasOwn(current, key)
    ) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

export function setPath(object: JsonObject, path: string, value: JsonValue): void {
  const parts = path.split('.');
  let current = object;
  for (const key of parts.slice(0, -1)) {
    if (!Object.hasOwn(current, key)) current[key] = Object.create(null) as JsonObject;
    current = current[key] as JsonObject;
  }
  current[parts.at(-1)!] = value;
}

export function objectAt(object: JsonObject, key: string): JsonObject {
  return (object[key] ?? {}) as JsonObject;
}

export function arrayAt(object: JsonObject, key: string): JsonValue[] {
  return (object[key] ?? []) as JsonValue[];
}
