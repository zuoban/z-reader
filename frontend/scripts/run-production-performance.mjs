import { spawn } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(os.tmpdir(), 'z-reader-perf-'));
const children = [];
const port = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const value = server.address().port;
    server.close(() => resolve(value));
  });
});
const backendPort = await port();
const frontendPort = await port();
const baseURL = `http://127.0.0.1:${frontendPort}`;
const env = {
  ...process.env,
  NEXT_SERVER_API_URL: `http://127.0.0.1:${backendPort}`,
  NEXT_PUBLIC_API_URL: '',
  Z_READER_PERF_BASE_URL: baseURL,
  APP_PORT: String(backendPort),
  PORT: String(frontendPort),
  HOSTNAME: '127.0.0.1',
  DB_PATH: path.join(temp, 'library.db'),
  UPLOAD_DIR: path.join(temp, 'uploads'),
  BACKUP_INTERVAL_HOURS: '0',
  ALLOWED_ORIGINS: baseURL,
  GIN_MODE: 'release',
};
function start(command, args, cwd = root) {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit',
    detached: process.platform !== 'win32' });
  children.push(child);
  return child;
}
function completed(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0
      ? resolve() : reject(new Error(`Process failed: ${code ?? signal}`)));
  });
}
async function ready(url, child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${url}`);
    try { if ((await fetch(url)).ok) return; } catch { /* Wait for server startup. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not become ready: ${url}`);
}
async function cleanup() {
  await Promise.all(children.filter(child => child.exitCode === null).map(child =>
    new Promise(resolve => {
      const kill = signal => {
        try {
          if (process.platform === 'win32') child.kill(signal);
          else process.kill(-child.pid, signal);
        } catch { /* Already exited. */ }
      };
      const timeout = setTimeout(() => kill('SIGKILL'), 5000);
      child.once('exit', () => { clearTimeout(timeout); resolve(); });
      kill('SIGTERM');
    })));
  await rm(temp, { recursive: true, force: true });
}
process.once('SIGINT', () => { void cleanup().then(() => process.exit(130)); });
process.once('SIGTERM', () => { void cleanup().then(() => process.exit(143)); });
try {
  const binary = path.join(temp, 'backend');
  await completed(start('go', ['build', '-o', binary, '.'], path.join(root, '../backend')));
  await completed(start('npm', ['run', 'build']));
  await completed(start('npm', ['run', 'test:js-budget']));
  const backend = start(binary, [], temp);
  await ready(`http://127.0.0.1:${backendPort}/readyz`, backend);
  const standalone = path.join(root, '.next/standalone');
  await cp(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });
  await cp(path.join(root, '.next/static'), path.join(standalone, '.next/static'), { recursive: true });
  const frontend = start(process.execPath, [path.join(standalone, 'server.js')]);
  await ready(`${baseURL}/login`, frontend);
  await completed(start(process.execPath, ['node_modules/@playwright/test/cli.js', 'test',
    '--config=playwright.performance.config.ts', ...process.argv.slice(2)]));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup();
}
