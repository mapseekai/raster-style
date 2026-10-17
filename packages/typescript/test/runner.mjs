import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import {
  encodeQuery,
  decodeQuery,
  parseStyle,
  canonicalJson,
  SchemaRegistry,
  inspectStyle,
  validateStyle,
  requireExtensionSupport,
} from '../dist/index.js';

// Line-oriented conformance runner; stdout is reserved for machine-readable results.
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  try {
    const request = JSON.parse(line);
    if (['inspect', 'validate', 'support'].includes(request.op)) {
      const schemas = new SchemaRegistry();
      for (const schema of request.schemas ?? []) schemas.register(schema);
      const style = parseStyle(request.json, schemas);
      if (request.op === 'validate') validateStyle(style, schemas);
      if (request.op === 'support')
        requireExtensionSupport(style, request.supported ?? [], schemas);
      console.log(JSON.stringify(inspectStyle(style, schemas)));
    } else if (request.op === 'encode') {
      const style = parseStyle(request.json);
      console.log(JSON.stringify({ query: encodeQuery(style), json: canonicalJson(style) }));
    } else if (request.op === 'decode') {
      const style = decodeQuery(request.query);
      console.log(JSON.stringify({ query: encodeQuery(style), json: canonicalJson(style) }));
    } else {
      throw new Error('Unsupported operation');
    }
  } catch (error) {
    console.log(JSON.stringify({ error: error.code ?? 'E_INTERNAL' }));
  }
}
