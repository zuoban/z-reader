import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildFoliate, rewriteVendorPaths } from './build-foliate.mjs';

test('preserves dynamic modules and worker paths while resolving vendor assets at the root', () => {
  const source = `import './vendor/pdfjs/pdf.mjs';
const pdf = path => new URL(\`vendor/pdfjs/\${path}\`, import.meta.url);
const zip = () => import('./vendor/zip.js');
const worker = () => new Worker(new URL('./zip-worker.js', import.meta.url));
const mobi = () => import('./mobi.js');`;
  const output = rewriteVendorPaths(source, 'abc123');
  assert.match(output, /\/foliate\/vendor\/pdfjs\/pdf\.mjs\?v=abc123/);
  assert.match(output, /\/foliate\/vendor\/pdfjs\/\$\{path\}`/);
  assert.match(output, /\/foliate\/vendor\/zip\.js\?v=abc123/);
  assert.match(output, /new URL\('\.\/zip-worker\.js', import\.meta\.url\)/);
  assert.match(output, /import\('\.\/mobi\.js'\)/);
});

test('keeps PDF font and CMap directory bases usable for appended resource filenames', () => {
  const source = 'const pdfjsPath = path => new URL(`vendor/pdfjs/${path}`, import.meta.url).toString()';
  const output = rewriteVendorPaths(source, 'abc123').replace(
    'import.meta.url', JSON.stringify('https://reader.test/foliate/built/abc123/pdf.js'),
  );
  const pdfjsPath = runInNewContext(`${output}; pdfjsPath`, { URL });
  assert.equal(pdfjsPath('cmaps/'), 'https://reader.test/foliate/vendor/pdfjs/cmaps/');
  assert.equal(pdfjsPath('standard_fonts/'),
    'https://reader.test/foliate/vendor/pdfjs/standard_fonts/');
  assert.equal(pdfjsPath('standard_fonts/') + 'FoxitSerif.pfb',
    'https://reader.test/foliate/vendor/pdfjs/standard_fonts/FoxitSerif.pfb');
});

test('builds native modules without changing sources, reuses hashes and invalidates vendor changes', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'z-reader-foliate-build-'));
  try {
    await writeFile(path.join(temporary, 'package.json'), '{"type":"module"}');
    const sourceDir = path.join(temporary, 'source');
    const outputDir = path.join(temporary, 'built');
    const manifestPath = path.join(temporary, 'manifest.json');
    await mkdir(path.join(sourceDir, 'vendor'), { recursive: true });
    const source = `// Readable original source remains available for tests.
import { number } from './helper.js';
export const value = number;
export const lazy = () => import('./helper.js');
export const worker = () => new URL('./zip-worker.js', import.meta.url).pathname;`;
    await writeFile(path.join(sourceDir, 'view.js'), source);
    await writeFile(path.join(sourceDir, 'helper.js'), 'export const number = 42;');
    await writeFile(path.join(sourceDir, 'zip-worker.js'), 'self.addEventListener("message", () => {});');
    await writeFile(path.join(sourceDir, 'vendor', 'zip.js'), 'export const vendor = 1;');
    const options = { sourceDir, outputDir, manifestPath };
    const first = await buildFoliate(options);
    assert.ok(first.outputBytes < first.sourceBytes);
    assert.equal(await readFile(path.join(sourceDir, 'view.js'), 'utf8'), source);
    const view = await import(pathToFileURL(path.join(outputDir, first.version, 'view.js')));
    assert.equal(view.value, 42);
    assert.equal((await view.lazy()).number, 42);
    assert.ok(view.worker().endsWith(`/${first.version}/zip-worker.js`));
    const second = await buildFoliate(options);
    assert.equal(first.version, second.version);
    assert.deepEqual(await readdir(outputDir), [first.version]);
    await writeFile(path.join(sourceDir, 'vendor', 'zip.js'), 'export const vendor = 2;');
    const third = await buildFoliate(options);
    assert.notEqual(third.version, first.version);
    assert.deepEqual(await readdir(outputDir), [third.version]);
    assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).version, third.version);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
