/* eslint-env node */

import { execSync } from 'child_process';
import { logWarn, logSuccess } from './logger.js';

/**
 * Frees a network port by finding and terminating any process listening on it.
 * Works on both Windows and Unix (Linux / macOS).
 *
 * @param {number|string} port - The port number to free.
 * @param {number} [excludePid] - Optional process ID to avoid killing (defaults to process.pid).
 * @returns {number[]} Array of process IDs that were killed.
 */
export const freePort = (port, excludePid = process.pid) => {
  const killedPids = [];
  const targetPort = Number(port);

  try {
    if (process.platform === 'win32') {
      let output = '';
      try {
        output = execSync(
          `netstat -ano | findstr :${targetPort}`,
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
        );
      } catch {
        return killedPids; // No process listening
      }

      const lines = output.trim().split(/\r?\n/);
      const pidsToKill = new Set();

      for (const line of lines) {
        const trimmed = line.trim();
        // Match lines that have :<port> in local address or are in LISTENING state
        if (trimmed && (trimmed.includes(`:${targetPort}`) || trimmed.includes('LISTENING'))) {
          const parts = trimmed.split(/\s+/);
          const pid = parts[parts.length - 1];
          const numPid = Number(pid);
          if (pid && !isNaN(numPid) && numPid > 0 && numPid !== excludePid) {
            pidsToKill.add(numPid);
          }
        }
      }

      for (const pid of pidsToKill) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
          killedPids.push(pid);
          logWarn(`⚠️  Freed port ${targetPort} by killing process PID ${pid}`);
        } catch {
          // Process may have already exited
        }
      }
    } else {
      // Unix / macOS
      let output = '';
      try {
        output = execSync(
          `lsof -ti tcp:${targetPort}`,
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
        );
      } catch {
        return killedPids;
      }

      const pids = output.trim().split(/\r?\n/);
      for (const pidStr of pids) {
        const numPid = Number(pidStr.trim());
        if (numPid && numPid > 0 && numPid !== excludePid) {
          try {
            execSync(`kill -9 ${numPid}`, { stdio: 'ignore' });
            killedPids.push(numPid);
            logWarn(`⚠️  Freed port ${targetPort} by killing process PID ${numPid}`);
          } catch {
            // Process may have already exited
          }
        }
      }
    }
  } catch (error) {
    // Port freeing should never crash the main application
    logWarn(`⚠️  Could not free port ${targetPort}: ${error.message}`);
  }

  return killedPids;
};

// If run directly via CLI (e.g., node src/utils/free-port.js 5000)
if (process.argv[1]?.endsWith('free-port.js')) {
  const portArg = process.argv[2] || process.env.PORT || 5000;
  const killed = freePort(portArg, 0);
  if (killed.length > 0) {
    logSuccess(`✅ Port ${portArg} cleared (${killed.length} process(es) terminated)`);
  }
}

export default freePort;
