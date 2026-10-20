import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./measure-tts-provider.mjs', import.meta.url));

for (const missing of ['TTS_BENCH_BASE_URL', 'TTS_BENCH_TOKEN']) {
  test(`requires explicit ${missing} before starting Chromium or making requests`, () => {
    const env = { ...process.env,
      TTS_BENCH_BASE_URL: 'https://benchmark.invalid', TTS_BENCH_TOKEN: 'private-secret',
    };
    delete env[missing];
    const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), { ok: false, error: 'configuration-required' });
    assert.ok(!result.stdout.includes('private-secret'));
    assert.ok(!result.stdout.includes('benchmark.invalid'));
  });
}

test('rejects a malformed destination without printing credentials or the supplied URL', () => {
  const result = spawnSync(process.execPath, [script], {
    env: { ...process.env, TTS_BENCH_BASE_URL: 'file:///private/path',
      TTS_BENCH_TOKEN: 'private-secret' }, encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.deepEqual(JSON.parse(result.stdout), { ok: false, error: 'invalid-base-url' });
  assert.equal(result.stderr, '');
});
