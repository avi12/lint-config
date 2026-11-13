export const DEFAULT_MEMORY_MB = 4096;
export const DEFAULT_TIME_LIMIT_MS = 5 * 60 * 1000;
export const POLL_INTERVAL_MS = 1000;
const BYTES_PER_MB = 1024 * 1024;
const BYTES_PER_KB = 1024;
const COLUMN_COUNT = 3;
const MS_PER_SECOND = 1000;
const WINDOWS_TABLE_SCRIPT =
  'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.WorkingSetSize)" }';

/**
 * Reads the guard limits: `AVI12_LINT_FALLOW_MEMORY_MB` (default 4096) and `AVI12_LINT_FALLOW_TIME_LIMIT_MS`
 * (default 300000); an unset, non-numeric or non-positive value falls back to the default. Pure.
 */
export function guardLimits(env) {
  const memory = Number(env["AVI12_LINT_FALLOW_MEMORY_MB"]);
  const time = Number(env["AVI12_LINT_FALLOW_TIME_LIMIT_MS"]);
  return {
    memoryLimitMb: memory > 0 ? memory : DEFAULT_MEMORY_MB,
    timeLimitMs: time > 0 ? time : DEFAULT_TIME_LIMIT_MS
  };
}

/**
 * The command that prints every process as `pid parentPid size` lines, with the byte `unit` of the size:
 * PowerShell on Windows (working set), `ps` elsewhere (resident set, in KB). Pure.
 */
export function processTableCommand(platform) {
  const isWindows = platform === "win32";
  if (isWindows) {
    return {
      command: "powershell",
      args: ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_TABLE_SCRIPT],
      unit: 1
    };
  }

  return {
    command: "ps",
    args: ["-A", "-o", "pid=,ppid=,rss="],
    unit: BYTES_PER_KB
  };
}

/**
 * Parses the table text into `{ pid, parentPid, bytes }` rows; `unit` is the byte multiplier of the third
 * column (1 on Windows, 1024 for `ps`). Pure.
 */
export function parseProcessTable({ text, unit }) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim().split(/\s+/).map(Number))
    .filter(columns => columns.length === COLUMN_COUNT && columns.every(Number.isFinite))
    .map(([pid, parentPid, size]) => ({
      pid,
      parentPid,
      bytes: size * unit
    }));
}

/**
 * The pid plus all its descendants and their summed memory in MB, from a parsed table. Pure.
 */
export function treeUsage({ rows, pid }) {
  const members = new Set([pid]);
  let isGrowing = true;
  while (isGrowing) {
    isGrowing = false;
    for (const row of rows) {
      const isChild = members.has(row.parentPid) && !members.has(row.pid);
      if (isChild) {
        members.add(row.pid);
        isGrowing = true;
      }
    }
  }
  const bytes = rows.filter(row => members.has(row.pid)).reduce((total, row) => total + row.bytes, 0);
  return {
    pids: [...members],
    megabytes: bytes / BYTES_PER_MB
  };
}

/**
 * The commands that terminate exactly `pids` (the runner's own child tree), never by name: `taskkill /T /F
 * /PID` on Windows, `kill -9` elsewhere. Pure.
 */
export function killCommands({ platform, pids, pid }) {
  const isWindows = platform === "win32";
  if (isWindows) {
    return [["taskkill", ["/T", "/F", "/PID", String(pid)]]];
  }

  return [["kill", ["-9", ...pids.map(String)]]];
}

/**
 * Polls `readUsage()` (`{ pids, megabytes }`, or undefined when the process is gone) every `intervalMs` and calls
 * `terminate(usage)` once when memory passes `memoryLimitMb` or the run passes `timeLimitMs`. Resolves with the
 * failure message when it tripped, or undefined once `isDone()` is true. `now` and `wait` are injected so a test
 * needs no real clock.
 */
export async function watchdog({ readUsage, terminate, isDone, memoryLimitMb, timeLimitMs, intervalMs, now, wait }) {
  const start = now();
  while (!isDone()) {
    await wait(intervalMs);

    if (isDone()) {
      return undefined;
    }

    const usage = readUsage();
    const elapsed = now() - start;
    const isOverMemory = usage !== undefined && usage.megabytes > memoryLimitMb;
    const isOverTime = elapsed > timeLimitMs;
    if (isOverMemory) {
      terminate(usage);
      return `fallow stopped: it used ${Math.round(usage.megabytes)} MB, over the ${memoryLimitMb} MB limit (AVI12_LINT_FALLOW_MEMORY_MB)`;
    }

    if (isOverTime) {
      terminate(usage);
      return `fallow stopped: it ran over ${Math.round(timeLimitMs / MS_PER_SECOND)} s (AVI12_LINT_FALLOW_TIME_LIMIT_MS)`;
    }
  }
  return undefined;
}
