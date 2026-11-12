#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import { plan } from "../src/plan.js";

const args = process.argv.slice(2);
const isFix = args.includes("--fix");
const concurrencyIndex = args.indexOf("--concurrency");
const requested = concurrencyIndex === -1 ? process.env["AVI12_LINT_CONCURRENCY"] : args[concurrencyIndex + 1];
const steps = plan({
  hasFile: existsSync,
  isFix,
  concurrency: requested
});

let failed = 0;
for (const { name, command } of steps) {
  console.log(`avi12-lint: ${name}`);
  const result = spawnSync("pnpm", ["exec", ...command], {
    stdio: "inherit",
    shell: true
  });
  const hasFailed = result.status !== 0;
  if (hasFailed) {
    failed++;
  }
}
process.exit(failed === 0 ? 0 : 1);
