import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const defaultNextDir = path.join(frontendRoot, '.next');
const defaultBudgetPath = path.join(frontendRoot, 'performance-budget.json');

const routes = {
  home: 'server/app/index.html',
  login: 'server/app/login.html',
  shelf: 'server/app/shelf.html',
};

const args = process.argv.slice(2);
const mode = args.find((arg) => arg === '--print' || arg === '--write');
const nextDirArg = args.find((arg) => arg.startsWith('--next-dir='));
const budgetArg = args.find((arg) => arg.startsWith('--budget='));

const nextDir = nextDirArg
  ? path.resolve(nextDirArg.slice('--next-dir='.length))
  : defaultNextDir;
const budgetPath = budgetArg
  ? path.resolve(budgetArg.slice('--budget='.length))
  : defaultBudgetPath;

if (args.some((arg) => arg === '--help' || arg === '-h')) {
  console.log(`Usage: node scripts/check-js-budget.mjs [--print|--write] [--next-dir=PATH] [--budget=PATH]

Measures first-screen JavaScript bytes from production prerender HTML under .next/
and compares them to performance-budget.json.

  --print   Print the measured budget JSON and exit
  --write   Write measured values (with 10% headroom) to the budget file
`);
  process.exit(0);
}

const measured = await measureFirstScreenJs(nextDir);

if (mode === '--print') {
  process.stdout.write(`${JSON.stringify(toBudgetDocument(measured), null, 2)}\n`);
  process.exit(0);
}

if (mode === '--write') {
  const document = toBudgetDocument(measured);
  await writeFile(budgetPath, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`Wrote frontend JS budget baseline to ${path.relative(frontendRoot, budgetPath)}`);
  for (const [route, entry] of Object.entries(document.firstScreenJs)) {
    console.log(
      `  ${route}: ${formatBytes(entry.bytes)} (max ${formatBytes(entry.maxBytes)}, ${entry.files} files)`
    );
  }
  process.exit(0);
}

const expected = JSON.parse(await readFile(budgetPath, 'utf8'));
validateBudget(expected, measured);

console.log('Frontend first-screen JS budget check passed:');
for (const [route, entry] of Object.entries(measured)) {
  const maxBytes = expected.firstScreenJs[route].maxBytes;
  console.log(
    `  ${route}: ${formatBytes(entry.bytes)} / ${formatBytes(maxBytes)} (${entry.files} files)`
  );
}

async function measureFirstScreenJs(buildDir) {
  const result = {};
  for (const [route, relativeHtml] of Object.entries(routes)) {
    const htmlPath = path.join(buildDir, relativeHtml);
    let html;
    try {
      html = await readFile(htmlPath, 'utf8');
    } catch {
      throw new Error(
        `Missing prerender HTML for ${route} at ${htmlPath}. Run "npm run build" first.`
      );
    }

    const scriptPaths = extractScriptPaths(html);
    let bytes = 0;
    for (const scriptPath of scriptPaths) {
      const diskPath = resolveStaticPath(buildDir, scriptPath);
      try {
        const info = await stat(diskPath);
        bytes += info.size;
      } catch {
        throw new Error(`Referenced script missing on disk: ${scriptPath} -> ${diskPath}`);
      }
    }

    result[route] = {
      bytes,
      files: scriptPaths.length,
      scripts: scriptPaths,
    };
  }
  return result;
}

function extractScriptPaths(html) {
  const paths = [];
  const seen = new Set();
  const pattern =
    /(?:src|href)="(\/_next\/static\/[^"]+\.js)"|as="script"[^>]*href="(\/_next\/static\/[^"]+\.js)"/g;
  for (const match of html.matchAll(pattern)) {
    const scriptPath = match[1] || match[2];
    if (!scriptPath || seen.has(scriptPath)) {
      continue;
    }
    seen.add(scriptPath);
    paths.push(scriptPath);
  }
  if (paths.length === 0) {
    throw new Error('No first-screen script tags found in prerender HTML');
  }
  return paths;
}

function resolveStaticPath(buildDir, scriptPath) {
  // /_next/static/... -> <buildDir>/static/...
  const relative = scriptPath.replace(/^\/_next\//, '');
  return path.join(buildDir, relative);
}

function toBudgetDocument(measured) {
  const firstScreenJs = {};
  for (const [route, entry] of Object.entries(measured)) {
    firstScreenJs[route] = {
      bytes: entry.bytes,
      maxBytes: Math.ceil(entry.bytes * 1.1),
      files: entry.files,
    };
  }
  return {
    schema: 1,
    description:
      'First-screen JS budgets from production prerender HTML. maxBytes is ~10% headroom over the recorded baseline.',
    firstScreenJs,
    webVitals: {
      login: { lcpMsMax: 3500, clsMax: 0.1 },
      shelf: { lcpMsMax: 4000, clsMax: 0.15, inpMsMax: 300 },
    },
    offline: {
      staticShellRoutes: ['/', '/login', '/manifest.json'],
      minHitRate: 0.8,
    },
  };
}

function validateBudget(expected, measured) {
  if (expected.schema !== 1 || !expected.firstScreenJs) {
    throw new Error('Unsupported performance budget format (expected schema 1)');
  }

  const failures = [];
  for (const route of Object.keys(routes)) {
    const budget = expected.firstScreenJs[route];
    const actual = measured[route];
    if (!budget || typeof budget.maxBytes !== 'number') {
      failures.push(`Budget is missing firstScreenJs.${route}.maxBytes`);
      continue;
    }
    if (!actual) {
      failures.push(`Measurement is missing route ${route}`);
      continue;
    }
    if (actual.bytes > budget.maxBytes) {
      failures.push(
        `${route} first-screen JS is ${formatBytes(actual.bytes)}, exceeds max ${formatBytes(budget.maxBytes)} (+${formatBytes(actual.bytes - budget.maxBytes)})`
      );
    }
  }

  if (failures.length > 0) {
    console.error('Frontend first-screen JS budget check failed:');
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    console.error(
      'Re-measure with "npm run test:js-budget:baseline" only after intentional size changes, and explain regressions >10% in the PR.'
    );
    process.exit(1);
  }
}

function formatBytes(value) {
  return `${value} bytes (${(value / 1024).toFixed(1)} KiB)`;
}
