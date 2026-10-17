import { readSchemaResponse } from './schema-download.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '.build/site');
const base = 'https://mapseekai.github.io/raster-style/';
const identities = new Set();
const schemas = [];

async function inspect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await inspect(path);
    } else if (entry.name.endsWith('schema.json')) {
      const content = await readFile(path);
      const schema = JSON.parse(content.toString('utf8'));
      const publishedPath = relative(root, path).replaceAll('\\', '/');
      const expected = new URL(publishedPath, base).href;
      assert.equal(schema.$id, expected, `Schema identity must match its published path: ${path}`);
      assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
      assert(!identities.has(schema.$id), `Duplicate schema identity: ${schema.$id}`);
      assert(!publishedPath.split('/').includes('latest'), 'Schema identities must be versioned');
      if (publishedPath.startsWith('extensions/')) {
        assert(
          /\/v\d+\.\d+\.\d+\/schema\.json$/.test(publishedPath),
          'Extension version directory required',
        );
      }
      identities.add(schema.$id);
      schemas.push({
        url: schema.$id,
        path: publishedPath,
        sha256: createHash('sha256').update(content).digest('hex'),
      });
    }
  }
}

await inspect(resolve(root, 'spec/v3'));
await inspect(resolve(root, 'extensions'));
assert(identities.has(`${base}spec/v3/raster-style-v3.schema.json`));
for (const name of ['mosaic', 'tile']) {
  assert(identities.has(`${base}extensions/raster/${name}/v1.0.0/schema.json`));
}

// Only the generated publication directory is replaced; source files remain untouched.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const directory of ['spec/v3', 'extensions']) {
  await cp(resolve(root, directory), resolve(output, directory), { recursive: true });
}
await writeFile(resolve(output, '.nojekyll'), '');
await writeFile(resolve(output, 'schemas.json'), `${JSON.stringify(schemas, null, 2)}\n`);
const links = schemas
  .map((schema) => `<li><a href="${schema.path}">${schema.path}</a></li>`)
  .join('\n');
await writeFile(
  resolve(output, 'index.html'),
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Raster Style v3 schemas</title></head><body>
<h1>Raster Style v3</h1><p>Versioned JSON Schema resources. Published versions retain stable identities and contents.</p>
<ul>${links}</ul><p><a href="schemas.json">Schema checksums</a></p>
<p><a href="https://github.com/mapseekai/raster-style">Specification, SDKs and publishing instructions</a></p>
</body></html>\n`,
);
for (const schema of schemas) {
  const content = await readFile(resolve(output, schema.path));
  assert.equal(createHash('sha256').update(content).digest('hex'), schema.sha256);
}
console.log(`Built and verified ${schemas.length} versioned schemas in ${relative(root, output)}.`);

// Network verification is explicit and used only by the publication workflow.
if (process.argv.includes('--verify-published')) {
  async function published(url) {
    assert(url.startsWith(base), 'Publication verification is restricted to the project origin');
    const response = await fetch(url, {
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 404) return null;
    assert(response.ok, `Cannot verify published resource ${url}: HTTP ${response.status}`);
    return readSchemaResponse(response);
  }

  const index = await published(`${base}schemas.json`);
  if (index) {
    const existing = JSON.parse(Buffer.from(index).toString('utf8'));
    assert(Array.isArray(existing), 'Published schema index must be an array');
    for (const previous of existing) {
      const current = schemas.find((schema) => schema.url === previous.url);
      assert(current, `Published schema must be retained: ${previous.url}`);
      assert.equal(
        current.sha256,
        previous.sha256,
        `Published schema is immutable: ${previous.url}`,
      );
    }
  }
  for (const schema of schemas) {
    const content = await published(schema.url);
    if (content) {
      assert.equal(
        createHash('sha256').update(content).digest('hex'),
        schema.sha256,
        `Published schema is immutable: ${schema.url}`,
      );
      console.log(`Verified published content: ${schema.url}`);
    } else {
      console.log(`Not published (HTTP 404): ${schema.url}`);
    }
  }
}
