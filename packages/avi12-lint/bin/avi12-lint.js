#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { argumentBudget, batchCommands, runSequentially } from "#src/batch.js";
import { changedFiles, mergeBase, stagedFiles } from "#src/changed-files.js";
import { mergeFallowConfig } from "#src/fallow-config.js";
import {
  guardLimits,
  killCommands,
  parseProcessTable,
  POLL_INTERVAL_MS,
  processTableCommand,
  treeUsage,
  watchdog
} from "#src/guard.js";
import { formatReport } from "#src/kotlin-report.js";
import { ensureTool } from "#src/kotlin-tools.js";
import {
  javaCommand,
  KOTLIN_CACHE_DIRECTORY,
  KOTLIN_PRESET_DIRECTORY,
  kotlinNotices,
  parseJavaMajor
} from "#src/kotlin.js";
import { detectLanguages, isIgnoredPath } from "#src/languages.js";
import { languageNotices, plan } from "#src/plan.js";
import {
  cargoRoots,
  planRustConfig,
  RUST_LOCAL_FILE,
  RUST_PRESET_DIRECTORY,
  staleRustFiles
} from "#src/rust-config.js";
import { probeRustTools, rustNotices } from "#src/rust.js";
import { findingsOf, isTextChecked, parseExemptions, withoutExempted } from "#src/text-check.js";

const args = process.argv.slice(2);

const FALLOW_PRESET = "fallow-config-avi12/fallow.json";
const FALLOW_LOCAL = "fallow.local.json";
const FALLOW_OUTPUT = ".fallowrc.json";

function writeFallowConfig() {
  const presetPath = createRequire(path.join(process.cwd(), "package.json")).resolve(FALLOW_PRESET);
  const base = JSON.parse(readFileSync(presetPath, "utf8"));
  const local = existsSync(FALLOW_LOCAL) ? JSON.parse(readFileSync(FALLOW_LOCAL, "utf8")) : {};
  const { $schema: schema, ...merged } = mergeFallowConfig({
    base,
    local
  });
  writeFileSync(
    FALLOW_OUTPUT,
    `${JSON.stringify(
      {
        $schema: schema,
        ...merged
      },
      null,
      2
    )}
`
  );
  console.log(`avi12-lint: wrote ${FALLOW_OUTPUT} from ${FALLOW_PRESET} and ${FALLOW_LOCAL}`);
}

const CONFIG_FILE = "avi12-lint.config.json";

function listProjectFiles() {
  const { stdout } = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
  return stdout.split("\n").filter(Boolean);
}

function runTextCheck(requested) {
  const config = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, "utf8")) : {};
  const exemptions = parseExemptions(config);
  const files = (requested.length > 0 ? requested : listProjectFiles()).filter(isTextChecked);
  const findings = files
    .filter(file => existsSync(file))
    .flatMap(file =>
      findingsOf({
        file,
        text: readFileSync(file, "utf8")
      })
    );
  const reported = withoutExempted({
    findings,
    exemptions
  });
  for (const { file, line, rule, message } of reported) {
    console.log(`${file}:${line}: ${rule}: ${message}`);
  }

  return reported.length === 0 ? 0 : 1;
}

if (args[0] === "fallow-config") {
  writeFallowConfig();
  process.exit(0);
}

if (args[0] === "text-check") {
  process.exit(runTextCheck(args.slice(1)));
}

const RUST_PRESET_FILES = {
  lints: "lints.toml",
  clippy: "clippy.toml",
  rustfmt: "rustfmt.toml",
  deny: "deny.toml"
};

function rustPresetFile(file) {
  const directory = process.env["AVI12_LINT_RUST_PRESET"] ?? path.join(process.cwd(), RUST_PRESET_DIRECTORY);
  return path.join(directory, file);
}

function readRustPlan() {
  const preset = Object.fromEntries(
    Object.entries(RUST_PRESET_FILES).map(([name, file]) => [name, readFileSync(rustPresetFile(file), "utf8")])
  );
  const manifests = listProjectFiles()
    .filter(file => path.basename(file) === "Cargo.toml" && !isIgnoredPath(file))
    .map(file => ({
      path: file,
      text: readFileSync(file, "utf8")
    }));
  const locals = new Map();
  for (const root of cargoRoots(manifests)) {
    const localPath = root.directory === "." ? RUST_LOCAL_FILE : `${root.directory}/${RUST_LOCAL_FILE}`;
    if (existsSync(localPath)) {
      locals.set(root.directory, readFileSync(localPath, "utf8"));
    }
  }

  const { files, problems } = planRustConfig({
    preset,
    manifests,
    locals
  });
  const existing = new Map(
    [...files.keys()].map(file => [file, existsSync(file) ? readFileSync(file, "utf8") : undefined])
  );
  return {
    files,
    problems,
    stale: staleRustFiles({
      files,
      existing
    })
  };
}

function runRustConfig() {
  const { files, problems, stale } = readRustPlan();
  const isCheck = args.includes("--check");
  for (const problem of problems) {
    console.log(`avi12-lint: ${problem}`);
  }

  if (isCheck) {
    for (const file of stale) {
      console.log(`avi12-lint: ${file} differs from rust-config-avi12; run avi12-lint rust-config`);
    }

    const isOutOfDate = stale.length > 0 || problems.length > 0;
    return isOutOfDate ? 1 : 0;
  }

  for (const file of stale) {
    writeFileSync(file, files.get(file));
    console.log(`avi12-lint: wrote ${file}`);
  }

  const hasProblems = problems.length > 0;
  return hasProblems ? 1 : 0;
}

if (args[0] === "rust-config") {
  process.exit(runRustConfig());
}

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
const VUE_GLOB = "*.vue";

function repoHas(glob) {
  const { stdout, status } = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", glob], {
    encoding: "utf8"
  });
  return status === 0 ? stdout.trim() !== "" : true;
}

function repoHasMarker(pathspec) {
  const { stdout, status } = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", `:(glob)**/${pathspec}`],
    { encoding: "utf8" }
  );
  return status === 0 && stdout.trim() !== "";
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

const languages = detectLanguages(repoHasMarker);

const IS_KOTLIN_REQUIRED = process.env["AVI12_LINT_REQUIRE_KOTLIN"] === "1";
const KOTLIN_TOOLS_FILE = `${KOTLIN_PRESET_DIRECTORY}/tools.json`;
const DETEKT_CONFIG_NAME = "detekt.yml";

function findConsumerDetekt() {
  const [shallowest] = listProjectFiles()
    .filter(file => path.basename(file) === DETEKT_CONFIG_NAME && !file.includes("node_modules/"))
    .sort((left, right) => left.split("/").length - right.split("/").length);
  return shallowest ? path.resolve(shallowest) : undefined;
}

async function prepareKotlin() {
  const isPresetInstalled = existsSync(KOTLIN_TOOLS_FILE);
  if (!isPresetInstalled) {
    return { notices: ["avi12-lint: kotlin-config-avi12 is not installed, so ktlint and detekt were skipped"] };
  }

  const java = javaCommand(process.env);
  const probe = spawnSync(java, ["-version"], { encoding: "utf8" });
  const javaMajor = probe.error ? undefined : parseJavaMajor(`${probe.stderr}${probe.stdout}`);
  const javaNotices = kotlinNotices({ javaMajor });
  if (javaNotices.length > 0) {
    return { notices: javaNotices };
  }

  try {
    const { ktlint, detekt } = JSON.parse(readFileSync(KOTLIN_TOOLS_FILE, "utf8"));
    const [ktlintJar, detektJar] = await Promise.all(
      [ktlint, detekt].map(tool =>
        ensureTool({
          tool,
          cacheDirectory: KOTLIN_CACHE_DIRECTORY
        })
      )
    );
    return {
      notices: [],
      kotlin: {
        java,
        tools: {
          ktlint: path.resolve(ktlintJar),
          detekt: path.resolve(detektJar)
        },
        presetDirectory: path.resolve(KOTLIN_PRESET_DIRECTORY),
        consumerDetekt: findConsumerDetekt(),
        projectFiles: listProjectFiles(),
        isTypeResolved: process.env["AVI12_LINT_KOTLIN_TYPES"] !== "0"
      }
    };
  } catch (error) {
    const toolError = error instanceof Error ? error.message : String(error);
    return {
      notices: kotlinNotices({
        javaMajor,
        toolError
      })
    };
  }
}

const kotlinPreparation = languages.includes("kotlin") ? await prepareKotlin() : { notices: [] };

const IS_RUST_REQUIRED = process.env["AVI12_LINT_REQUIRE_RUST"] === "1";
function isRunnable(probeArguments) {
  const probe = spawnSync("cargo", probeArguments, { encoding: "utf8" });
  return !probe.error && probe.status === 0;
}

function prepareRust() {
  const { hasCargo, tools } = probeRustTools(isRunnable);
  const isPresetInstalled = existsSync(rustPresetFile("lints.toml"));
  const configPlan = isPresetInstalled
    ? readRustPlan()
    : {
        stale: [],
        problems: []
      };
  const manifests = listProjectFiles()
    .filter(file => path.basename(file) === "Cargo.toml" && !isIgnoredPath(file))
    .map(file => ({
      path: file,
      text: readFileSync(file, "utf8")
    }));
  return {
    notices: rustNotices({
      hasCargo,
      tools,
      isPresetInstalled,
      staleFiles: configPlan.stale,
      problems: configPlan.problems
    }),
    isBlocked: configPlan.stale.length > 0 || configPlan.problems.length > 0,
    rust: hasCargo
      ? {
          roots: cargoRoots(manifests),
          tools,
          env: process.env,
          cwd: process.cwd().replaceAll("\\", "/")
        }
      : undefined
  };
}

const rustPreparation = languages.includes("rust") ? prepareRust() : { notices: [] };

const steps = plan({
  hasFile: existsSync,
  hasSvelte: repoHas(SVELTE_GLOB),
  hasVue: repoHas(VUE_GLOB),
  isFix: args.includes("--fix"),
  concurrency: requested,
  changedFiles: files,
  fallowBase: isChanged && !isStaged ? mergeBase() : undefined,
  isFallowFull: args.includes("--full") || process.env["AVI12_LINT_FALLOW_FULL"] === "1",
  isNestedConfigAllowed: process.env["AVI12_LINT_NESTED_CONFIG"] === "1" || args.includes("--nested-config"),
  oxfmtIgnores: presetIgnores(),
  languages,
  kotlin: kotlinPreparation.kotlin,
  rust: rustPreparation.rust,
  platform: process.platform
});

for (const notice of languageNotices({
  hasFile: existsSync,
  languages
})) {
  console.log(notice);
}

for (const notice of [...kotlinPreparation.notices, ...rustPreparation.notices]) {
  console.log(notice);
}

const isFallowSkipped = isStaged && existsSync("node_modules/.bin/fallow");
if (isFallowSkipped) {
  console.log(
    "avi12-lint: fallow skipped with --staged (it audits commits against a base, not the index); use --changed or pnpm lint"
  );
}

const NODE_OPTIONS = "NODE_OPTIONS";

function resolveEnv({ key, value }) {
  const isNodeOptions = key === NODE_OPTIONS;
  if (isNodeOptions) {
    return [process.env[NODE_OPTIONS], value].filter(Boolean).join(" ");
  }

  return path.resolve(value);
}

function readUsage(pid) {
  const { command, args: tableArgs, unit } = processTableCommand(process.platform);
  const { stdout, status } = spawnSync(command, tableArgs, { encoding: "utf8" });
  if (status !== 0) {
    return undefined;
  }

  const usage = treeUsage({
    rows: parseProcessTable({
      text: stdout,
      unit
    }),
    pid
  });
  return usage.megabytes > 0 ? usage : undefined;
}

function terminate({ pid, usage }) {
  const commands = killCommands({
    platform: process.platform,
    pids: usage?.pids ?? [pid],
    pid
  });
  for (const [command, commandArgs] of commands) {
    spawnSync(command, commandArgs);
  }
}

function run({ name, command, env, rawEnv, limits, isFirst, isGuarded, isDirect, reporter }) {
  return new Promise(resolve => {
    const [program, ...programArguments] = isDirect ? command : ["pnpm", "exec", ...command];
    const child = spawn(program, programArguments, {
      shell: !isDirect,
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
        ),
        ...rawEnv
      }
    });
    const chunks = [];
    let isDone = false;
    let failure;
    if (isGuarded) {
      watchdog({
        ...(limits ?? guardLimits(process.env)),
        readUsage: () => readUsage(child.pid),
        terminate: usage =>
          terminate({
            pid: child.pid,
            usage
          }),
        isDone: () => isDone,
        intervalMs: POLL_INTERVAL_MS,
        now: Date.now,
        wait: milliseconds => new Promise(done => setTimeout(done, milliseconds))
      }).then(message => {
        failure = message;
      });
    }

    child.stdout.on("data", chunk => chunks.push(chunk));
    child.stderr.on("data", chunk => chunks.push(chunk));
    child.on("close", status => {
      isDone = true;

      if (isFirst) {
        console.log(`avi12-lint: ${name}`);
      }

      const output = Buffer.concat(chunks);
      process.stdout.write(
        reporter
          ? formatReport({
              tool: reporter,
              text: output.toString(),
              cwd: process.cwd()
            })
          : output
      );

      if (failure) {
        console.log(failure);
      }

      const isSuccess = status === 0 && !failure;
      resolve(isSuccess ? 0 : 1);
    });
  });
}

function runStep(step) {
  const { name, command, env, rawEnv, limits, split, isGuarded, isDirect, reporter } = step;
  const commands =
    step.commands ??
    (split
      ? batchCommands({
          ...split,
          budget: argumentBudget({
            platform: process.platform,
            env: process.env
          })
        })
      : [command]);
  return runSequentially({
    commands,
    runOne: ({ command: batch, isFirst }) =>
      run({
        name,
        command: batch,
        env,
        rawEnv,
        limits,
        isFirst,
        isGuarded,
        isDirect,
        reporter
      })
  });
}

const ONLY_PREFIX = "--only=";
const onlyFamily = args.find(argument => argument.startsWith(ONLY_PREFIX))?.slice(ONLY_PREFIX.length);
const selected = onlyFamily ? steps.filter(({ family }) => family === onlyFamily) : steps;
const parallel = selected.filter(({ isParallel }) => isParallel);
const serial = selected.filter(({ isParallel }) => !isParallel);
const results = await Promise.all(parallel.map(runStep));
for (const step of serial) {
  results.push(await runStep(step));
}
const isKotlinSkipped = IS_KOTLIN_REQUIRED && kotlinPreparation.notices.length > 0;
const isRustBlocked = IS_RUST_REQUIRED && rustPreparation.notices.length > 0;
const isFailed = results.includes(1) || isKotlinSkipped || isRustBlocked || Boolean(rustPreparation.isBlocked);
process.exit(isFailed ? 1 : 0);
