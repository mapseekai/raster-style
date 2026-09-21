import { compile } from 'json-schema-to-typescript';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const schema = JSON.parse(
  await readFile(new URL('../spec/v2/raster-style-v2.schema.json', import.meta.url), 'utf8'),
);
schema.title = 'RasterStyle';
const output = await compile(schema, 'RasterStyle', {
  bannerComment: '/** Generated from the draft.2 JSON Schema. Run pnpm generate; do not edit. */',
  maxItems: -1,
  additionalProperties: false,
  style: { singleQuote: true, printWidth: 100 },
});
const target = new URL('../packages/typescript/src/generated/types.ts', import.meta.url);
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')) !== output)
    throw new Error('Generated TypeScript types are stale.');
} else {
  await writeFile(target, output);
}
console.log(`TypeScript types: ${fileURLToPath(target)}`);
