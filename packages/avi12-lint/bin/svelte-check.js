#!/usr/bin/env node
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";

import { patchSvelteCheck } from "#src/svelte-check.js";

// The project's own svelte-check with `--tsgo`, its TypeScript 7 mode, handed to tsrs: svelte-check's source is
// patched in memory and run where it lives, so its files and requires resolve as usual

const TSGO_FLAG = "--tsgo";

const svelteCheckArgs = process.argv.slice(2);
const entry = createRequire(path.join(process.cwd(), "package.json")).resolve("svelte-check");
const entryModule = new Module(entry);
entryModule.filename = entry;
entryModule.paths = Module._nodeModulePaths(path.dirname(entry));
process.argv = [
  process.argv[0],
  entry,
  ...svelteCheckArgs,
  ...(svelteCheckArgs.includes(TSGO_FLAG) ? [] : [TSGO_FLAG])
];
entryModule._compile(patchSvelteCheck(readFileSync(entry, "utf8")), entry);
