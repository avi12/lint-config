#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { changedFiles, stagedFiles } from "../src/changed-files.js";
import { plan } from "../src/plan.js";

const args = process.argv.slice(2);
const concurrencyIndex = args.indexOf("--concurrency");
const requested = concurrencyIndex === -1 ? process.env["AVI12_LINT_CONCURRENCY"] : args[concurrencyIndex + 1];
const isStaged = args.includes("--staged");
const isChanged = args.includes("--changed");
let files;
if (isStaged) {
  files = stagedFiles();
} else if (isChanged) {
  files = changedFiles();
}

const SVELTE_GLOB = "*.svelte";

function repoHasSvelte() {
  const { stdout, status } = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", SVELTE_GLOB],
    {
      encoding: "utf8"
    }
  );
  return status === 0 ? stdout.trim() !== "" : true;
}

const OXFMT_PRESET = "oxfmt-config-avi12/oxfmt.json";

function presetIgnores() {
  try {
    const resolved = createRequire(path.join(process.cwd(), "package.json")).resolve(OXFMT_PRESET);
    return JSON.parse(readFileSync(resolved, "utf8")).ignorePatterns ?? [];
  } catch {
    return [];
  }
}

const steps = plan({
  hasFile: existsSync,
  hasSvelte: repoHasSvelte(),
  isFix: args.includes("--fix"),
  concurrency: requested,
  changedFiles: files,
  oxfmtIgnores: presetIgnores(),
  platform: process.platform
});

const NODE_OPTIONS = "NODE_OPTIONS";

function resolveEnv({ key, value }) {
  const isNodeOptions = key === NODE_OPTIONS;
  if (isNodeOptions) {
    return [process.env[NODE_OPTIONS], value].filter(Boolean).join(" ");
  }

  return path.resolve(value);
}

function run({ name, command, env }) {
  return new Promise(resolve => {
    const child = spawn("pnpm", ["exec", ...command], {
      shell: true,
      env: {
        ...process.env,
        ...Object.fromEntries(
          Object.entries(env).map(([key, value]) => [
            key,
            resolveEnv({
              key,
              value
            })
          ])
        )
      }
    });
    const chunks = [];
    child.stdout.on("data", chunk => chunks.push(chunk));
    child.stderr.on("data", chunk => chunks.push(chunk));
    child.on("close", status => {
      console.log(`avi12-lint: ${name}`);
      process.stdout.write(Buffer.concat(chunks));
      resolve(status === 0 ? 0 : 1);
    });
  });
}

const parallel = steps.filter(({ isParallel }) => isParallel);
const serial = steps.filter(({ isParallel }) => !isParallel);
const results = await Promise.all(parallel.map(run));
for (const step of serial) {
  results.push(await run(step));
}
process.exit(results.includes(1) ? 1 : 0);
