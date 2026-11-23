import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultShutdownTimeoutMs = 5000;
const forceKillDrainTimeoutMs = 1000;
const pollIntervalMs = 50;

export function getDefaultServices(rootDir = defaultRootDir, platform = process.platform) {
  const npmCommand = platform === 'win32' ? 'npm.cmd' : 'npm';
  return [
    {
      name: 'backend',
      command: 'go',
      args: ['run', 'main.go'],
      cwd: path.join(rootDir, 'backend'),
    },
    {
      name: 'frontend',
      command: npmCommand,
      args: ['run', 'dev'],
      cwd: path.join(rootDir, 'frontend'),
    },
  ];
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isProcessGroupAlive(pid, platform = process.platform) {
  if (!pid) {
    return false;
  }
  try {
    process.kill(platform === 'win32' ? pid : -pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

function signalProcessGroup(pid, signal, platform = process.platform) {
  if (!pid) {
    return;
  }
  try {
    process.kill(platform === 'win32' ? pid : -pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      throw error;
    }
  }
}

async function waitForProcessGroupsToExit(entries, maxWaitMs, platform) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const anyAlive = entries.some((entry) => isProcessGroupAlive(entry.pid, platform));
    if (!anyAlive) {
      return true;
    }
    await delay(pollIntervalMs);
  }
  return !entries.some((entry) => isProcessGroupAlive(entry.pid, platform));
}

export async function runDev(options = {}) {
  const {
    rootDir = defaultRootDir,
    services = null,
    shutdownTimeoutMs = defaultShutdownTimeoutMs,
    stderr = process.stderr,
    platform = process.platform,
    registerSignalHandlers = true,
  } = options;

  if (!services) {
    const frontendNodeModules = path.join(rootDir, 'frontend', 'node_modules');
    if (!existsSync(frontendNodeModules)) {
      stderr.write(
        '[dev] frontend/node_modules not found. Run "cd frontend && npm install" first.\n',
      );
      return 1;
    }
  }

  const serviceList = services ?? getDefaultServices(rootDir, platform);
  if (serviceList.length === 0) {
    return 0;
  }
  const entries = [];
  let shuttingDown = false;
  let forceKilled = false;
  let finalExitCode = 0;
  let forceKillTimer = null;
  let shutdownDeadline = 0;

  let resolveTrigger;
  const triggerPromise = new Promise((resolve) => {
    resolveTrigger = resolve;
  });

  function forceKillAll() {
    if (forceKilled) {
      return;
    }
    forceKilled = true;
    for (const entry of entries) {
      signalProcessGroup(entry.pid, 'SIGKILL', platform);
    }
  }

  function initiateShutdown(signal, exitCode) {
    if (!shuttingDown) {
      shuttingDown = true;
      finalExitCode = exitCode;
      shutdownDeadline = Date.now() + shutdownTimeoutMs;
      for (const entry of entries) {
        signalProcessGroup(entry.pid, signal, platform);
      }
      forceKillTimer = setTimeout(() => {
        forceKillAll();
      }, shutdownTimeoutMs);
      forceKillTimer.unref();
      resolveTrigger();
      return;
    }
    if (signal === 'SIGINT') {
      forceKillAll();
    }
  }

  function handleSigint() {
    initiateShutdown('SIGINT', 0);
  }

  function handleSigterm() {
    initiateShutdown('SIGTERM', 0);
  }

  if (registerSignalHandlers) {
    process.on('SIGINT', handleSigint);
    process.on('SIGTERM', handleSigterm);
  }

  try {
    for (const service of serviceList) {
      const child = spawn(service.command, service.args, {
        cwd: service.cwd,
        env: service.env ?? process.env,
        stdio: service.stdio ?? ['ignore', 'inherit', 'inherit'],
        detached: platform !== 'win32',
      });

      let resolveExit;
      const exitPromise = new Promise((resolve) => {
        resolveExit = resolve;
      });

      const entry = {
        service,
        child,
        pid: child.pid,
        exited: false,
        exitPromise,
      };
      entries.push(entry);

      child.once('error', (error) => {
        entry.exited = true;
        resolveExit();
        if (!shuttingDown) {
          stderr.write(`[dev] Failed to start ${service.name}: ${error.message}\n`);
          initiateShutdown('SIGTERM', 1);
        }
      });

      child.once('exit', (code, exitSignal) => {
        entry.exited = true;
        resolveExit();
        if (!shuttingDown) {
          const reason = exitSignal ? `signal ${exitSignal}` : `code ${code ?? 0}`;
          const nextExitCode = exitSignal ? 1 : (code ?? 0);
          stderr.write(`[dev] ${service.name} exited with ${reason}; stopping services...\n`);
          initiateShutdown('SIGTERM', nextExitCode);
        }
      });
    }

    await triggerPromise;
    await Promise.all(entries.map((entry) => entry.exitPromise));

    const remainingMs = Math.max(0, shutdownDeadline - Date.now());
    const drained = await waitForProcessGroupsToExit(entries, remainingMs, platform);
    if (!drained) {
      forceKillAll();
      await waitForProcessGroupsToExit(entries, forceKillDrainTimeoutMs, platform);
    }

    return finalExitCode;
  } catch (error) {
    stderr.write(`[dev] Unexpected error: ${error.message}\n`);
    initiateShutdown('SIGTERM', 1);
    await Promise.all(entries.map((entry) => entry.exitPromise));
    await waitForProcessGroupsToExit(entries, shutdownTimeoutMs, platform);
    return 1;
  } finally {
    if (forceKillTimer) {
      clearTimeout(forceKillTimer);
    }
    if (registerSignalHandlers) {
      process.off('SIGINT', handleSigint);
      process.off('SIGTERM', handleSigterm);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const exitCode = await runDev();
  process.exit(exitCode);
}
