#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { argumentBudget, batchCommands, runSequentially } from "#src/batch.js";
import { changedFiles, mergeBase, stagedFiles } from "#src/changed-files.js";
import { CPP_LOCAL_FILE, CPP_PRESET_DIRECTORY, planCppConfig, staleCppFiles } from "#src/cpp-config.js";
import { runCppTidy } from "#src/cpp-tidy.js";
import { cppDependencies, locateLlvmTools, visualStudioEnvironment } from "#src/cpp-tools.js";
import { cppNotices, cppScope } from "#src/cpp.js";
import {
  CSHARP_LOCAL_FILE,
  CSHARP_PRESET_DIRECTORY,
  csharpPreset,
  planCsharpConfig,
  staleCsharpFiles
} from "#src/csharp-config.js";
import { csharpNotices, csharpTargets, parseDotnetMajor } from "#src/csharp.js";
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

function writeGeneratedFile({ file, text, isCrlfRepo = false }) {
  const isCrlf = isCrlfRepo || (existsSync(file) && readFileSync(file, "utf8").includes("\r\n"));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, isCrlf ? text.replaceAll("\n", "\r\n") : text);
}

function readRustText(file) {
  return readFileSync(file, "utf8").replaceAll("\r\n", "\n");
}

function rustPresetFile(file) {
  const directory = process.env["AVI12_LINT_RUST_PRESET"] ?? path.join(process.cwd(), RUST_PRESET_DIRECTORY);
  return path.join(directory, file);
}

function readRustPlan() {
  const preset = Object.fromEntries(
    Object.entries(RUST_PRESET_FILES).map(([name, file]) => [name, readRustText(rustPresetFile(file))])
  );
  const manifests = listProjectFiles()
    .filter(file => path.basename(file) === "Cargo.toml" && !isIgnoredPath(file))
    .map(file => ({
      path: file,
      text: readRustText(file)
    }));
  const locals = new Map();
  for (const root of cargoRoots(manifests)) {
    const localPath = root.directory === "." ? RUST_LOCAL_FILE : `${root.directory}/${RUST_LOCAL_FILE}`;
    if (existsSync(localPath)) {
      locals.set(root.directory, readRustText(localPath));
    }
  }

  const { files, problems } = planRustConfig({
    preset,
    manifests,
    locals
  });
  const existing = new Map([...files.keys()].map(file => [file, existsSync(file) ? readRustText(file) : undefined]));
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
    writeGeneratedFile({
      file,
      text: files.get(file)
    });
    console.log(`avi12-lint: wrote ${file}`);
  }

  const hasProblems = problems.length > 0;
  return hasProblems ? 1 : 0;
}

if (args[0] === "rust-config") {
  process.exit(runRustConfig());
}

function readCppText(file) {
  return readFileSync(file, "utf8").replaceAll("\r\n", "\n");
}

function cppPresetFile(file) {
  const directory = process.env["AVI12_LINT_CPP_PRESET"] ?? path.join(process.cwd(), CPP_PRESET_DIRECTORY);
  return path.join(directory, file);
}

function readCppLocal() {
  return existsSync(CPP_LOCAL_FILE) ? JSON.parse(readCppText(CPP_LOCAL_FILE)) : {};
}

function readCppPlan() {
  const { files, problems } = planCppConfig({
    preset: {
      format: JSON.parse(readCppText(cppPresetFile("format.json"))),
      tidy: JSON.parse(readCppText(cppPresetFile("tidy.json")))
    },
    local: readCppLocal()
  });
  const existing = new Map([...files.keys()].map(file => [file, existsSync(file) ? readCppText(file) : undefined]));
  return {
    files,
    problems,
    stale: staleCppFiles({
      files,
      existing
    })
  };
}

function runCppConfig() {
  const { files, problems, stale } = readCppPlan();
  for (const problem of problems) {
    console.log(`avi12-lint: ${problem}`);
  }

  if (args.includes("--check")) {
    for (const file of stale) {
      console.log(`avi12-lint: ${file} differs from cpp-config-avi12; run avi12-lint cpp-config`);
    }

    const isOutOfDate = stale.length > 0 || problems.length > 0;
    return isOutOfDate ? 1 : 0;
  }

  for (const file of stale) {
    writeGeneratedFile({
      file,
      text: files.get(file)
    });
    console.log(`avi12-lint: wrote ${file}`);
  }

  const hasProblems = problems.length > 0;
  return hasProblems ? 1 : 0;
}

if (args[0] === "cpp-config") {
  process.exit(runCppConfig());
}

function readCsharpText(file) {
  return readFileSync(file, "utf8").replaceAll("\r\n", "\n");
}

function csharpPresetFile(file) {
  const directory = process.env["AVI12_LINT_CSHARP_PRESET"] ?? path.join(process.cwd(), CSHARP_PRESET_DIRECTORY);
  return path.join(directory, file);
}

function readCsharpLocal() {
  return existsSync(CSHARP_LOCAL_FILE) ? JSON.parse(readCsharpText(CSHARP_LOCAL_FILE)) : {};
}

function readCsharpPreset() {
  return csharpPreset(file => JSON.parse(readCsharpText(csharpPresetFile(file))));
}

function readCsharpPlan() {
  const existingProps = "Directory.Build.props";
  const { files, problems } = planCsharpConfig({
    preset: readCsharpPreset(),
    local: readCsharpLocal(),
    existing: new Map(existsSync(existingProps) ? [[existingProps, readCsharpText(existingProps)]] : [])
  });
  const existing = new Map([...files.keys()].map(file => [file, existsSync(file) ? readCsharpText(file) : undefined]));
  return {
    files,
    problems,
    stale: staleCsharpFiles({
      files,
      existing
    })
  };
}

function runCsharpConfig() {
  const { files, problems, stale } = readCsharpPlan();
  for (const problem of problems) {
    console.log(`avi12-lint: ${problem}`);
  }

  if (args.includes("--check")) {
    for (const file of stale) {
      console.log(`avi12-lint: ${file} differs from csharp-config-avi12; run avi12-lint csharp-config`);
    }

    const isOutOfDate = stale.length > 0 || problems.length > 0;
    return isOutOfDate ? 1 : 0;
  }

  const isCrlfRepo = /^end_of_line = crlf$/m.test(files.get(".editorconfig"));
  for (const file of stale) {
    writeGeneratedFile({
      file,
      text: files.get(file),
      isCrlfRepo
    });
    console.log(`avi12-lint: wrote ${file}`);
  }

  const hasProblems = problems.length > 0;
  return hasProblems ? 1 : 0;
}

if (args[0] === "csharp-config") {
  process.exit(runCsharpConfig());
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
      text: readRustText(file)
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

const IS_CPP_REQUIRED = process.env["AVI12_LINT_REQUIRE_CPP"] === "1";

function prepareCpp() {
  const tools = locateLlvmTools(process.env);
  const isPresetInstalled = existsSync(cppPresetFile("tidy.json"));
  const configPlan = isPresetInstalled
    ? readCppPlan()
    : {
        stale: [],
        problems: []
      };
  const local = readCppLocal();
  const projectFiles = listProjectFiles().filter(file => existsSync(file));
  const hasSources =
    cppScope({
      files: projectFiles,
      local
    }).files.length > 0;
  return {
    notices: cppNotices({
      tools,
      isPresetInstalled,
      staleFiles: configPlan.stale,
      problems: configPlan.problems,
      hasDatabaseSource: Boolean(local.database) || !tools.tidy
    }),
    isBlocked: configPlan.stale.length > 0 || configPlan.problems.length > 0,
    cpp: hasSources
      ? {
          files: projectFiles,
          local,
          tools,
          env: process.env,
          cwd: process.cwd().replaceAll("\\", "/")
        }
      : undefined
  };
}

const cppPreparation = languages.includes("cpp") ? prepareCpp() : { notices: [] };

const IS_CSHARP_REQUIRED = process.env["AVI12_LINT_REQUIRE_CSHARP"] === "1";

function prepareCsharp() {
  const probe = spawnSync("dotnet", ["--version"], { encoding: "utf8" });
  const dotnetMajor = probe.error || probe.status !== 0 ? undefined : parseDotnetMajor(probe.stdout);
  const isPresetInstalled = existsSync(csharpPresetFile("diagnostics.json"));
  const configPlan = isPresetInstalled
    ? readCsharpPlan()
    : {
        stale: [],
        problems: []
      };
  const local = readCsharpLocal();
  const notices = csharpNotices({
    dotnetMajor,
    isPresetInstalled,
    staleFiles: configPlan.stale,
    problems: configPlan.problems
  });
  const targets = csharpTargets({
    files: listProjectFiles().filter(file => existsSync(file)),
    local
  });
  return {
    notices,
    isBlocked: configPlan.stale.length > 0 || configPlan.problems.length > 0,
    csharp:
      targets.length > 0
        ? {
            targets,
            tools: {
              dotnet: dotnetMajor !== undefined
            },
            formatExcludes: isPresetInstalled ? Object.keys(readCsharpPreset().formatExcludes) : [],
            env: process.env,
            cwd: process.cwd().replaceAll("\\", "/")
          }
        : undefined
  };
}

const csharpPreparation = languages.includes("csharp") ? prepareCsharp() : { notices: [] };

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
  cpp: cppPreparation.cpp,
  csharp: csharpPreparation.csharp,
  platform: process.platform
});

for (const notice of languageNotices({
  hasFile: existsSync,
  languages
})) {
  console.log(notice);
}

for (const notice of [
  ...kotlinPreparation.notices,
  ...rustPreparation.notices,
  ...cppPreparation.notices,
  ...csharpPreparation.notices
]) {
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

const USAGE_TTL_MS = 700;
let usageReadAt = 0;
let usageMegabytes = 0;

function memoizedUsage() {
  const isStale = Date.now() - usageReadAt > USAGE_TTL_MS;
  if (isStale) {
    usageMegabytes = readUsage(process.pid)?.megabytes ?? 0;
    usageReadAt = Date.now();
  }

  return usageMegabytes;
}

async function runTidy(step) {
  console.log("avi12-lint: clang-tidy");
  const code = await runCppTidy({
    tidy: step.tidy,
    deps: cppDependencies({
      toolEnv: visualStudioEnvironment(process.env),
      usageMegabytes: memoizedUsage,
      log: text => console.log(text)
    })
  });
  return code;
}

function runStep(step) {
  if (step.tidy) {
    return runTidy(step);
  }

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
const isCppBlocked = IS_CPP_REQUIRED && cppPreparation.notices.length > 0;
const isCsharpBlocked = IS_CSHARP_REQUIRED && csharpPreparation.notices.length > 0;
const isFailed =
  results.includes(1) ||
  isKotlinSkipped ||
  isRustBlocked ||
  Boolean(rustPreparation.isBlocked) ||
  isCppBlocked ||
  Boolean(cppPreparation.isBlocked) ||
  isCsharpBlocked ||
  Boolean(csharpPreparation.isBlocked);
process.exit(isFailed ? 1 : 0);
