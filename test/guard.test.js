import assert from "node:assert/strict";
import { test } from "node:test";

import {
  guardLimits,
  killCommands,
  parseProcessTable,
  processTableCommand,
  treeUsage,
  watchdog
} from "../packages/avi12-lint/src/guard.js";

const MB = 1024 * 1024;

function fakeClock() {
  let time = 0;
  return {
    now: () => time,
    async wait(milliseconds) {
      time += milliseconds;
    }
  };
}

function run({ megabytes, memoryLimitMb = 4096, timeLimitMs = 300000, doneAfter = 1000 }) {
  const clock = fakeClock();
  const killed = [];
  const polls = [];
  const result = watchdog({
    readUsage() {
      polls.push(clock.now());
      return {
        pids: [10, 11],
        megabytes: megabytes(clock.now())
      };
    },
    terminate: usage => killed.push(usage.pids),
    isDone: () => clock.now() >= doneAfter * 1000,
    memoryLimitMb,
    timeLimitMs,
    intervalMs: 1000,
    ...clock
  });
  return {
    result,
    killed,
    polls
  };
}

test("limits default to 4 GB and 5 minutes and read the environment", () => {
  assert.deepEqual(guardLimits({}), {
    memoryLimitMb: 4096,
    timeLimitMs: 300000
  });
  assert.deepEqual(
    guardLimits({
      AVI12_LINT_FALLOW_MEMORY_MB: "512",
      AVI12_LINT_FALLOW_TIME_LIMIT_MS: "9"
    }),
    {
      memoryLimitMb: 512,
      timeLimitMs: 9
    }
  );
  assert.equal(guardLimits({ AVI12_LINT_FALLOW_MEMORY_MB: "nope" }).memoryLimitMb, 4096);
});

test("the process table command is PowerShell on Windows and ps elsewhere", () => {
  assert.equal(processTableCommand("win32").command, "powershell");
  assert.equal(processTableCommand("win32").unit, 1);
  assert.equal(processTableCommand("linux").command, "ps");
  assert.equal(processTableCommand("linux").unit, 1024);
});

test("the tree sums the pid and its descendants only", () => {
  const rows = parseProcessTable({
    text: "1 0 100\r\n10 1 2\n11 10 3\n12 11 4\n20 1 1000\njunk line",
    unit: MB
  });
  const usage = treeUsage({
    rows,
    pid: 10
  });
  assert.deepEqual(usage.pids.toSorted(), [10, 11, 12]);
  assert.equal(usage.megabytes, 9);
});

test("kill targets the spawned pid: taskkill tree on Windows, the tree pids elsewhere, never a name", () => {
  assert.deepEqual(
    killCommands({
      platform: "win32",
      pids: [10, 11],
      pid: 10
    }),
    [["taskkill", ["/T", "/F", "/PID", "10"]]]
  );
  assert.deepEqual(
    killCommands({
      platform: "linux",
      pids: [10, 11],
      pid: 10
    }),
    [["kill", ["-9", "10", "11"]]]
  );
});

test("the watchdog terminates once, with a clear message, when memory passes the limit", async () => {
  const { result, killed } = run({ megabytes: time => (time >= 3000 ? 5000 : 100) });
  assert.match(await result, /used 5000 MB, over the 4096 MB limit/);
  assert.deepEqual(killed, [[10, 11]]);
});

test("the watchdog terminates when the time limit passes", async () => {
  const { result, killed } = run({
    megabytes: () => 100,
    timeLimitMs: 5000
  });
  assert.match(await result, /ran over 5 s/);
  assert.equal(killed.length, 1);
});

test("the watchdog leaves a run that finishes within the limits alone", async () => {
  const { result, killed, polls } = run({
    megabytes: () => 100,
    doneAfter: 4
  });
  assert.equal(await result, undefined);
  assert.deepEqual(killed, []);
  assert.deepEqual(polls, [1000, 2000, 3000]);
});
