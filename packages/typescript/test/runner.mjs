import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { encodeQuery, decodeQuery, parseStyle, canonicalJson } from '../dist/index.js';

// Line-oriented conformance runner; stdout is reserved for machine-readable results.
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  try {
    const request = JSON.parse(line);
    if (request.op === 'encode') {
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
