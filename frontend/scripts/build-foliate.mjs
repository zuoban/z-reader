import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { minify } = require('next/dist/compiled/terser');
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const excluded = new Set(['eslint.config.js', 'rollup.config.js', 'reader.js']);
const coreModules = ['epubcfi.js', 'progress.js', 'overlayer.js', 'text-walker.js', 'zip-loader.js'];

export function rewriteVendorPaths(source, version) {
  return source.replace(/(['"`])(?:\.\/)?vendor\/([^'"`]+)\1/g,
    (_match, quote, asset) => {
      // PDFJS appends resource names to directory bases such as standard_fonts/.
      // A query would consume that filename and break the required trailing slash.
      const query = quote === '`' || asset.endsWith('/') ? '' : `?v=${version}`;
      return `${quote}/foliate/vendor/${asset}${query}${quote}`;
    });
}

async function hashDirectory(hash, directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(prefix, entry.name);
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await hashDirectory(hash, filename, relative);
    else hash.update(relative).update(await readFile(filename));
  }
}

export async function buildFoliate({
  sourceDir = path.join(frontend, 'public/foliate'),
  outputDir = path.join(sourceDir, 'built'),
  manifestPath = path.join(frontend, 'src/lib/foliate-assets.generated.json'),
} = {}) {
  const names = (await readdir(sourceDir))
    .filter(name => name.endsWith('.js') && !excluded.has(name)).sort();
  const sources = await Promise.all(names.map(async name =>
    [name, await readFile(path.join(sourceDir, name), 'utf8')]));
  const hash = createHash('sha256');
  hash.update(await readFile(fileURLToPath(import.meta.url)));
  hash.update(await readFile(require.resolve('next/dist/compiled/terser')));
  for (const [name, source] of sources) hash.update(name).update(source);
  await hashDirectory(hash, path.join(sourceDir, 'vendor'));
  const version = hash.digest('hex').slice(0, 16);
  const destination = path.join(outputDir, version);
  await mkdir(destination, { recursive: true });

  let sourceBytes = 0;
  let outputBytes = 0;
  for (const [name, source] of sources) {
    const { code } = await minify(rewriteVendorPaths(source, version), {
      module: true,
      compress: { passes: 2 },
      mangle: true,
      format: { comments: /^!/ },
    });
    if (!code) throw new Error(`Could not minify Foliate module: ${name}`);
    await writeFile(path.join(destination, name), code);
    sourceBytes += Buffer.byteLength(source);
    outputBytes += Buffer.byteLength(code);
  }

  const base = `/foliate/built/${version}`;
  const manifest = {
    version,
    entry: `${base}/view.js`,
    preload: coreModules.filter(name => names.includes(name)).map(name => `${base}/${name}`),
    sourceBytes,
    outputBytes,
  };
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const entry of await readdir(outputDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== version && /^[a-f0-9]{16}$/.test(entry.name)) {
      await rm(path.join(outputDir, entry.name), { recursive: true, force: true });
    }
  }
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await buildFoliate();
  console.log(`Foliate ${result.version}: ${result.sourceBytes} -> ${result.outputBytes} bytes`);
}
