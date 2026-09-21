import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const assets = ['raster-style-v2.schema.json', 'query-bindings-v2.json'];
for (const name of assets) {
  const source = await readFile(resolve(root, 'spec/v2', name), 'utf8');
  const targets = [
    ['packages/go/internal/assets', name, source],
    ['crates/raster-style/assets', name, source],
    [
      'packages/typescript/src/generated',
      name.replace('.json', '.ts'),
      `// Generated from spec/v2/${name}. Do not edit.\nexport default ${source.trim()} as const;\n`,
    ],
  ];
  for (const [directory, filename, content] of targets) {
    const path = resolve(root, directory, filename);
    if (check) {
      if ((await readFile(path, 'utf8')) !== content)
        throw new Error(`Stale generated asset: ${path}`);
    } else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }
  }
}
console.log(check ? 'Generated assets are current.' : 'Generated assets synchronized.');
