import { readFile, writeFile } from 'node:fs/promises';

const metrics = ['statements', 'branches', 'functions', 'lines'];
const coreFiles = [
  'src/hooks/useCoverUrl.ts',
  'src/hooks/useProgress.ts',
  'src/hooks/useShelfData.ts',
  'src/lib/api.ts',
  'src/lib/reader-page.ts',
  'src/lib/shelf-grid.ts',
  'src/lib/tts-helpers.ts',
  'src/lib/tts-queue.ts',
];

const [summaryPath, baselinePath, mode] = process.argv.slice(2);

if (!summaryPath || !baselinePath || !['--print', '--write', undefined].includes(mode)) {
  console.error(
    'Usage: node scripts/check-coverage-baseline.mjs <summary> <baseline> [--print|--write]'
  );
  process.exit(1);
}

const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
const current = buildBaseline(summary);

if (mode === '--print') {
  process.stdout.write(`${JSON.stringify(current, null, 2)}\n`);
  process.exit(0);
}

if (mode === '--write') {
  await writeFile(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Wrote frontend coverage baseline to ${baselinePath}`);
  process.exit(0);
}

const expected = JSON.parse(await readFile(baselinePath, 'utf8'));
validateBaseline(expected, current);

function buildBaseline(coverageSummary) {
  const files = {};
  const indexedFiles = new Map(
    Object.entries(coverageSummary)
      .filter(([file]) => file !== 'total')
      .map(([file, value]) => [normalizePath(file), value])
  );

  for (const file of coreFiles) {
    const result = indexedFiles.get(file);
    if (!result) {
      throw new Error(`Coverage summary is missing core file ${file}`);
    }
    files[file] = Object.fromEntries(
      metrics.map((metric) => [metric, result[metric].pct])
    );
  }

  return { schema: 1, files };
}

function normalizePath(file) {
  const unixPath = file.replaceAll('\\', '/');
  const sourceIndex = unixPath.lastIndexOf('/src/');
  return sourceIndex === -1 ? unixPath.replace(/^\.\//, '') : unixPath.slice(sourceIndex + 1);
}

function validateBaseline(expected, current) {
  if (expected.schema !== 1 || !expected.files) {
    throw new Error('Unsupported frontend coverage baseline format');
  }

  const failures = [];
  for (const file of coreFiles) {
    const target = expected.files[file];
    const actual = current.files[file];
    if (!target) {
      failures.push(`Baseline is missing ${file}`);
      continue;
    }

    const details = metrics.map((metric) => {
      const baseline = target[metric];
      const value = actual[metric];
      if (typeof baseline !== 'number' || typeof value !== 'number') {
        failures.push(`${file} has invalid ${metric} coverage data`);
        return `${metric} unavailable`;
      }
      if (value + 0.01 < baseline) {
        failures.push(`${file} ${metric} dropped from ${baseline}% to ${value}%`);
      }
      return `${metric} ${value}% (baseline ${baseline}%)`;
    });
    console.log(`${file}: ${details.join(', ')}`);
  }

  if (failures.length > 0) {
    throw new Error(`Core coverage regression:\n- ${failures.join('\n- ')}`);
  }
  console.log('Frontend core coverage meets the committed baseline.');
}
