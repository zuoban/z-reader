import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { getDefaultServices, runDev } from './dev.mjs';

const devModulePath = fileURLToPath(new URL('./dev.mjs', import.meta.url));

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

async function waitForFile(filePath, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf8').trim();
      if (content) {
        return content;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

function createBufferStream() {
  const chunks = [];
  return {
    write(chunk) {
      chunks.push(String(chunk));
    },
    toString() {
      return chunks.join('');
    },
  };
}

const spawnGrandchildScript = `
const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const pidFile = process.argv[1];
const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 10000)'], {
  stdio: 'ignore',
});
writeFileSync(pidFile, JSON.stringify({ parentPid: process.pid, grandchildPid: grandchild.pid }));
setInterval(() => {}, 10000);
`;

test('getDefaultServices points to backend and frontend dev commands', () => {
  const services = getDefaultServices('/repo', 'darwin');
  assert.deepEqual(services, [
    {
      name: 'backend',
      command: 'go',
      args: ['run', 'main.go'],
      cwd: path.join('/repo', 'backend'),
    },
    {
      name: 'frontend',
      command: 'npm',
      args: ['run', 'dev'],
      cwd: path.join('/repo', 'frontend'),
    },
  ]);
});

test('fails fast with a clear message when frontend/node_modules is missing', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'z-reader-dev-test-'));
  const stderr = createBufferStream();
  try {
    const exitCode = await runDev({
      rootDir: tempDir,
      stderr,
      registerSignalHandlers: false,
    });
    assert.equal(exitCode, 1);
    assert.match(stderr.toString(), /cd frontend && npm install/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('stops sibling service and grandchildren when one service exits with error', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'z-reader-dev-test-'));
  const pidFile = path.join(tempDir, 'service-a.json');
  const stderr = createBufferStream();

  try {
    const exitCode = await runDev({
      stderr,
      registerSignalHandlers: false,
      services: [
        {
          name: 'backend',
          command: process.execPath,
          args: ['-e', spawnGrandchildScript, pidFile],
          cwd: tempDir,
          stdio: 'ignore',
        },
        {
          name: 'frontend',
          command: process.execPath,
          args: [
            '-e',
            `
              const { existsSync } = require('node:fs');
              const check = () => {
                if (existsSync(${JSON.stringify(pidFile)})) {
                  process.exit(2);
                }
                setTimeout(check, 20);
              };
              check();
            `,
          ],
          cwd: tempDir,
          stdio: 'ignore',
        },
      ],
    });

    assert.equal(exitCode, 2);
    assert.match(stderr.toString(), /frontend exited with code 2/);
    const { parentPid, grandchildPid } = JSON.parse(readFileSync(pidFile, 'utf8'));
    assert.equal(isProcessAlive(parentPid), false);
    assert.equal(isProcessAlive(grandchildPid), false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('handles SIGINT gracefully and force-kills on a second SIGINT', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'z-reader-dev-test-'));
  const pidFile = path.join(tempDir, 'ignore-sigint.pid');

  const runnerScript = `
    import { pathToFileURL } from 'node:url';
    const { runDev } = await import(pathToFileURL(${JSON.stringify(devModulePath)}).href);
    const exitCode = await runDev({
      shutdownTimeoutMs: 10000,
      services: [
        {
          name: 'backend',
          command: process.execPath,
          args: [
            '-e',
            \`
              const { writeFileSync } = require('node:fs');
              process.on('SIGINT', () => {});
              writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
              setInterval(() => {}, 10000);
            \`,
          ],
          cwd: ${JSON.stringify(tempDir)},
          stdio: 'ignore',
        },
      ],
    });
    process.exit(exitCode);
  `;

  try {
    const supervisor = spawn(process.execPath, ['--input-type=module', '-e', runnerScript], {
      stdio: 'ignore',
    });

    const childPid = Number(await waitForFile(pidFile));
    const exitResult = new Promise((resolve) => {
      supervisor.once('exit', (code, signal) => resolve({ code, signal }));
    });

    const startedAt = Date.now();
    supervisor.kill('SIGINT');
    await new Promise((resolve) => setTimeout(resolve, 100));
    supervisor.kill('SIGINT');

    const { code, signal } = await exitResult;
    const elapsedMs = Date.now() - startedAt;

    assert.equal(signal, null);
    assert.equal(code, 0);
    assert.ok(elapsedMs < 3000, `Expected quick exit on second SIGINT, took ${elapsedMs}ms`);
    assert.equal(isProcessAlive(childPid), false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('escalates to SIGKILL when a service ignores SIGTERM', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'z-reader-dev-test-'));
  const pidFile = path.join(tempDir, 'stubborn.pid');
  const stderr = createBufferStream();

  try {
    const exitCode = await runDev({
      stderr,
      shutdownTimeoutMs: 200,
      registerSignalHandlers: false,
      services: [
        {
          name: 'backend',
          command: process.execPath,
          args: [
            '-e',
            `
              const { writeFileSync } = require('node:fs');
              process.on('SIGTERM', () => {});
              writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
              setInterval(() => {}, 10000);
            `,
          ],
          cwd: tempDir,
          stdio: 'ignore',
        },
        {
          name: 'frontend',
          command: process.execPath,
          args: [
            '-e',
            `
              const { existsSync } = require('node:fs');
              const check = () => {
                if (existsSync(${JSON.stringify(pidFile)})) {
                  process.exit(1);
                }
                setTimeout(check, 20);
              };
              check();
            `,
          ],
          cwd: tempDir,
          stdio: 'ignore',
        },
      ],
    });

    assert.equal(exitCode, 1);
    const stubbornPid = Number(readFileSync(pidFile, 'utf8'));
    assert.equal(isProcessAlive(stubbornPid), false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('cleans up running sibling when a service command fails to spawn', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'z-reader-dev-test-'));
  const pidFile = path.join(tempDir, 'alive.pid');
  const stderr = createBufferStream();

  try {
    const exitCode = await runDev({
      stderr,
      registerSignalHandlers: false,
      services: [
        {
          name: 'backend',
          command: process.execPath,
          args: [
            '-e',
            `
              const { writeFileSync } = require('node:fs');
              writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
              setInterval(() => {}, 10000);
            `,
          ],
          cwd: tempDir,
          stdio: 'ignore',
        },
        {
          name: 'frontend',
          command: 'z-reader-nonexistent-binary-for-test',
          args: [],
          cwd: tempDir,
          stdio: 'ignore',
        },
      ],
    });

    assert.equal(exitCode, 1);
    assert.match(stderr.toString(), /Failed to start frontend/);
    if (existsSync(pidFile)) {
      const alivePid = Number(readFileSync(pidFile, 'utf8'));
      assert.equal(isProcessAlive(alivePid), false);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('gracefully shuts down all process groups on SIGTERM', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'z-reader-dev-test-'));
  const backendPidFile = path.join(tempDir, 'backend.json');
  const frontendPidFile = path.join(tempDir, 'frontend.json');

  const runnerScript = `
    import { pathToFileURL } from 'node:url';
    const { runDev } = await import(pathToFileURL(${JSON.stringify(devModulePath)}).href);
    const exitCode = await runDev({
      services: [
        {
          name: 'backend',
          command: process.execPath,
          args: ['-e', ${JSON.stringify(spawnGrandchildScript)}, ${JSON.stringify(backendPidFile)}],
          cwd: ${JSON.stringify(tempDir)},
          stdio: 'ignore',
        },
        {
          name: 'frontend',
          command: process.execPath,
          args: ['-e', ${JSON.stringify(spawnGrandchildScript)}, ${JSON.stringify(frontendPidFile)}],
          cwd: ${JSON.stringify(tempDir)},
          stdio: 'ignore',
        },
      ],
    });
    process.exit(exitCode);
  `;

  try {
    const supervisor = spawn(process.execPath, ['--input-type=module', '-e', runnerScript], {
      stdio: 'ignore',
    });

    const backendPids = JSON.parse(await waitForFile(backendPidFile));
    const frontendPids = JSON.parse(await waitForFile(frontendPidFile));

    const exitResult = new Promise((resolve) => {
      supervisor.once('exit', (code, signal) => resolve({ code, signal }));
    });

    supervisor.kill('SIGTERM');
    const { code, signal } = await exitResult;

    assert.equal(signal, null);
    assert.equal(code, 0);
    assert.equal(isProcessAlive(backendPids.parentPid), false);
    assert.equal(isProcessAlive(backendPids.grandchildPid), false);
    assert.equal(isProcessAlive(frontendPids.parentPid), false);
    assert.equal(isProcessAlive(frontendPids.grandchildPid), false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('waits for lingering process group members without unsettled top-level await', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'z-reader-dev-test-'));
  const pidFile = path.join(tempDir, 'lingering.json');

  const lingeringParentScript = `
    const { spawn } = require('node:child_process');
    const { writeFileSync } = require('node:fs');
    const grandchild = spawn(
      process.execPath,
      ['-e', "process.on('SIGTERM', () => setTimeout(() => process.exit(0), 150)); setInterval(() => {}, 10000);"],
      { stdio: 'ignore' },
    );
    writeFileSync(process.argv[1], JSON.stringify({ parentPid: process.pid, grandchildPid: grandchild.pid }));
    process.on('SIGTERM', () => process.exit(0));
    setInterval(() => {}, 10000);
  `;

  const runnerScript = `
    import { pathToFileURL } from 'node:url';
    const { runDev } = await import(pathToFileURL(${JSON.stringify(devModulePath)}).href);
    const exitCode = await runDev({
      services: [
        {
          name: 'backend',
          command: process.execPath,
          args: ['-e', ${JSON.stringify(lingeringParentScript)}, ${JSON.stringify(pidFile)}],
          cwd: ${JSON.stringify(tempDir)},
          stdio: 'ignore',
        },
        {
          name: 'frontend',
          command: process.execPath,
          args: [
            '-e',
            \`
              const { existsSync } = require('node:fs');
              const check = () => {
                if (existsSync(${JSON.stringify(pidFile)})) {
                  process.exit(1);
                }
                setTimeout(check, 20);
              };
              check();
            \`,
          ],
          cwd: ${JSON.stringify(tempDir)},
          stdio: 'ignore',
        },
      ],
    });
    process.exit(exitCode);
  `;

  try {
    const stderrChunks = [];
    const supervisor = spawn(process.execPath, ['--input-type=module', '-e', runnerScript], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    supervisor.stderr.on('data', (chunk) => stderrChunks.push(String(chunk)));

    const { code, signal } = await new Promise((resolve) => {
      supervisor.once('exit', (exitCode, exitSignal) => resolve({ code: exitCode, signal: exitSignal }));
    });

    const stderrText = stderrChunks.join('');
    assert.equal(signal, null);
    assert.equal(code, 1);
    assert.doesNotMatch(stderrText, /unsettled top-level await/i);
    const { parentPid, grandchildPid } = JSON.parse(readFileSync(pidFile, 'utf8'));
    assert.equal(isProcessAlive(parentPid), false);
    assert.equal(isProcessAlive(grandchildPid), false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
