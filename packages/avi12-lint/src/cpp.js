import { createHash } from "node:crypto";

import { isIgnoredPath } from "./languages.js";

/** Where the generated compile database and the unchanged-unit cache live, under the repo's own `.verify`. */
export const CPP_DATABASE_DIRECTORY = ".verify/clang-tidy";
export const CPP_CACHE_DIRECTORY = ".verify/clang-tidy-cache";

/** What one clang-tidy process costs (measured: a Win32 translation unit peaks near 416 MB). */
export const TIDY_MEGABYTES_PER_UNIT = 450;

/** The limits of the guard around the clang-tidy step: `AVI12_LINT_CPP_MEMORY_MB` and `AVI12_LINT_CPP_TIME_LIMIT_MS`. */
export const CPP_DEFAULT_MEMORY_MB = 8192;
export const CPP_DEFAULT_TIME_LIMIT_MS = 30 * 60 * 1000;

/** The install hint when LLVM is missing. */
export const LLVM_HINT = "winget install LLVM.LLVM (or pip install clang-tidy clang-format)";

const UNIT = /\.(?:cpp|cc|cxx)$/;
const HEADER = /\.(?:h|hpp|hh|hxx|ipp)$/;
const CPP_SOURCE = /\.(?:cpp|cc|cxx|h|hpp|hh|hxx|ipp)$/;
const CONFIG_INPUT =
  /(?:^|\/)(?:\.clang-tidy|\.clang-format|avi12-cpp\.local\.json|CMakeLists\.txt|[^/]*\.buildscript)$/;
const PCH_FLAG = /^[/-](?:Yc|Yu|Fp)/;
const INCLUDE_LINE = /^\s*#\s*include\s*([<"])([^>"]+)[>"]/gm;
const MS_PER_SECOND = 1000;

/** The guard limits of the C++ steps. Pure. */
export function cppLimits(env) {
  const memory = Number(env["AVI12_LINT_CPP_MEMORY_MB"]);
  const time = Number(env["AVI12_LINT_CPP_TIME_LIMIT_MS"]);
  return {
    memoryLimitMb: memory > 0 ? memory : CPP_DEFAULT_MEMORY_MB,
    timeLimitMs: time > 0 ? time : CPP_DEFAULT_TIME_LIMIT_MS
  };
}

function matchesAny({ file, patterns }) {
  return patterns.some(pattern => new RegExp(pattern).test(file));
}

/**
 * The C++ files a run covers, from the tracked `files` and the repo's `local.sources` (`include` regexes, every
 * file when absent, and `exclude` regexes): `{ files, units, headers }`. Folders no check reads (`external`,
 * `third_party`, `vendor`, `build`, `out`) are always out. Pure.
 */
export function cppScope({ files, local = {} }) {
  const include = local.sources?.include ?? [];
  const exclude = local.sources?.exclude ?? [];
  const covered = files.filter(file => {
    const isSource = CPP_SOURCE.test(file) && !isIgnoredPath(file);
    const isIncluded =
      include.length === 0 ||
      matchesAny({
        file,
        patterns: include
      });
    const isExcluded = matchesAny({
      file,
      patterns: exclude
    });
    return isSource && isIncluded && !isExcluded;
  });
  return {
    files: covered,
    units: covered.filter(file => UNIT.test(file)),
    headers: covered.filter(file => HEADER.test(file))
  };
}

/**
 * Whether the change touches a C++ config input (`.clang-tidy`, `.clang-format`, the local file, a build file),
 * which makes every file stale. Pure.
 */
export function isConfigChanged(changedFiles) {
  return changedFiles.some(file => CONFIG_INPUT.test(file));
}

/** The clang-format step: one command per argument budget over all covered files, `-i` with `isFix`. Pure. */
export function formatStep({ files, isFix, env = {}, tools }) {
  return {
    name: "clang-format",
    command: [],
    split: {
      head: [tools.format, ...(isFix ? ["-i"] : ["--dry-run", "--Werror"]), "--style=file"],
      files,
      tail: []
    },
    env: {},
    rawEnv: {},
    isDirect: true,
    isGuarded: true,
    isParallel: false,
    family: "cpp",
    limits: cppLimits(env)
  };
}

/** The pool size: bounded by CPUs, by free memory over one unit's cost, by the unit count and by `AVI12_LINT_TIDY_JOBS`. Pure. */
export function tidyPoolSize({ freeMegabytes, cpus, unitCount, env = {} }) {
  const override = Number(env["AVI12_LINT_TIDY_JOBS"]);
  const isOverridden = Number.isInteger(override) && override > 0;
  const byMemory = Math.floor(freeMegabytes / TIDY_MEGABYTES_PER_UNIT);
  const automatic = Math.min(cpus, byMemory);
  return Math.max(1, Math.min(unitCount, isOverridden ? override : automatic));
}

/** Splits a command line into arguments, honouring double quotes. Pure. */
export function splitCommand(command) {
  const tokens = [];
  let current = "";
  let isQuoted = false;
  let isOpen = false;
  for (const character of command) {
    if (character === '"') {
      isQuoted = !isQuoted;
      isOpen = true;
      continue;
    }

    const isSeparator = !isQuoted && /\s/.test(character);
    if (isSeparator) {
      if (isOpen) {
        tokens.push(current);
      }

      current = "";
      isOpen = false;
      continue;
    }

    current += character;
    isOpen = true;
  }

  if (isOpen) {
    tokens.push(current);
  }

  return tokens;
}

function includeDirectoryOf(argument) {
  const match = /^(?:\/I|-I|\/external:I|-isystem|\/imsvc)(.+)$/.exec(argument);
  return match?.[1];
}

/** The include directories of a compile entry's argument list, in order. Pure. */
export function includeDirectories(argumentsList) {
  return argumentsList.map(includeDirectoryOf).filter(Boolean);
}

/**
 * Cleans a compile database entry for clang: drops MSVC precompiled header flags (clang cannot read a `.pch`) and
 * turns an include directory matching `externalPattern` into an external one, so nothing inside it is reported. An
 * entry for a CMake PCH helper (`cmake_pch`) is dropped (undefined). Pure.
 */
export function sanitizeEntry({ entry, externalPattern }) {
  const isHelper = /cmake_pch/.test(entry.file);
  if (isHelper) {
    return undefined;
  }

  const argumentsList = entry.arguments ?? splitCommand(entry.command);
  const external = externalPattern ? new RegExp(externalPattern) : undefined;
  const cleaned = argumentsList
    .filter(argument => !PCH_FLAG.test(argument))
    .map(argument => {
      const directory = includeDirectoryOf(argument);
      const isExternal = directory !== undefined && external?.test(directory) && /^[/-]I/.test(argument);
      return isExternal ? `/external:I${directory}` : argument;
    });
  return {
    directory: entry.directory,
    file: entry.file,
    arguments: cleaned
  };
}

function sectionsOf(text) {
  const sections = new Map();
  let section;
  let blockKey;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*#.*$/, "").trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      section = new Map();
      sections.set(header[1], section);
      blockKey = undefined;
      continue;
    }

    if (!section || line === "") {
      continue;
    }

    if (blockKey) {
      if (line === "}") {
        blockKey = undefined;
      } else {
        section.set(blockKey, `${section.get(blockKey)}\n${line}`);
      }

      continue;
    }

    const pair = /^([A-Za-z_]+)(?:\[[^\]]*\])?\s*=\s*(.*)$/.exec(line);
    if (pair) {
      const isBlock = pair[2] === "{";
      section.set(pair[1], isBlock ? "" : pair[2]);
      blockKey = isBlock ? pair[1] : undefined;
    }
  }

  return sections;
}

function listOf(value) {
  return (value ?? "")
    .split(/[,\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

/**
 * The compile flags of a sighmake buildscript project: `{ standard, defines, includes }`, the defines of the
 * `[solution]` and of `[project:<project>]` together, the include folders as written (relative to the repo or to
 * `includeRoot`, see `databaseEntries`). Pure.
 */
export function buildscriptFlags({ text, project }) {
  const sections = sectionsOf(text);
  const solution = sections.get("solution") ?? new Map();
  const own = sections.get(`project:${project}`) ?? new Map();
  return {
    standard: own.get("std") ?? solution.get("std") ?? "17",
    defines: [...listOf(solution.get("defines")), ...listOf(own.get("defines"))],
    includes: listOf(own.get("includes"))
  };
}

/** A clang-cl compile entry per unit from `{ standard, defines, includes, flags }`. Pure. */
export function flatEntries({ units, root, includeRoot = ".", standard, defines = [], includes = [], flags = [] }) {
  const prefix = includeRoot === "." ? root : `${root}/${includeRoot}`;
  const shared = [
    "clang-cl",
    `/std:c++${standard}`,
    "/EHsc",
    ...flags,
    ...defines.map(define => `/D${define}`),
    ...includes.map(include => `/I${prefix}/${include}`)
  ];
  return units.map(unit => ({
    directory: root,
    file: `${root}/${unit}`,
    arguments: [...shared, `${root}/${unit}`]
  }));
}

/** The `#include` targets of a source text, as `{ name, isQuoted }`. Pure. */
export function includesOf(text) {
  return [...text.matchAll(INCLUDE_LINE)].map(match => ({
    name: match[2],
    isQuoted: match[1] === '"'
  }));
}

function directoryOf(file) {
  const slash = file.lastIndexOf("/");
  return slash === -1 ? "." : file.slice(0, slash);
}

function normalize(path) {
  const parts = [];
  for (const part of path.split("/")) {
    if (part === "..") {
      parts.pop();
    } else if (part !== ".") {
      parts.push(part);
    }
  }

  return parts.join("/");
}

/**
 * The project files a translation unit includes, directly and through each other: `readText(file)` answers a file's
 * text (undefined when it is not a project file) and `includeDirs` are the entry's include folders (absolute, with
 * `/`). A header outside the project (the SDK, the CRT) is not followed: the tool version is in the cache key.
 * Returns a sorted array of paths. Pure given `readText`.
 */
export function includeClosure({ unit, includeDirs, readText }) {
  const seen = new Set([unit]);
  const queue = [unit];
  while (queue.length > 0) {
    const file = queue.pop();
    const text = readText(file);
    if (text === undefined) {
      continue;
    }

    for (const { name, isQuoted } of includesOf(text)) {
      const candidates = [
        ...(isQuoted ? [`${directoryOf(file)}/${name}`] : []),
        ...includeDirs.map(directory => `${directory}/${name}`)
      ];
      const found = candidates
        .map(normalize)
        .find(candidate => !seen.has(candidate) && readText(candidate) !== undefined);
      if (found) {
        seen.add(found);
        queue.push(found);
      }
    }
  }

  return [...seen].sort();
}

/** The cache key of a unit: the tool version, the `.clang-tidy` hash, the compile arguments and every file's hash. Pure. */
export function cacheKey({ toolVersion, configHash, argumentsList, fileHashes }) {
  return createHash("sha256")
    .update(JSON.stringify([toolVersion, configHash, argumentsList, fileHashes]))
    .digest("hex");
}

/** The units a change reaches: a changed unit, or a unit whose include closure holds a changed file. Pure. */
export function changedUnits({ units, closures, changedFiles }) {
  const changed = new Set(changedFiles);
  return units.filter(unit => (closures.get(unit) ?? [unit]).some(file => changed.has(file)));
}

const DIAGNOSTIC_START = /^(?:[A-Za-z]:)?[^:\n]+:\d+:\d+: (?:error|warning): /;

/**
 * The distinct diagnostics of clang-tidy output (a header finding repeats in every unit that includes it): each
 * block starts at a `path:line:column: error:` line and runs to the next one. Pure.
 */
export function diagnosticBlocks(output) {
  const blocks = [];
  let current;
  for (const line of output.split(/\r?\n/)) {
    if (DIAGNOSTIC_START.test(line)) {
      current = [line];
      blocks.push(current);
    } else if (
      current &&
      line.trim() !== "" &&
      !/^(?:\d+ (?:warnings?|errors?)|Suppressed |Use -header-filter)/.test(line)
    ) {
      current.push(line);
    }
  }

  return blocks.map(block => block.join("\n"));
}

function missingToolNotice(tool) {
  return `avi12-lint: clang-${tool} is not installed, so its C++ check was skipped; install LLVM: ${LLVM_HINT}`;
}

/** What `avi12-lint` says when the C++ checks cannot all run. Pure. */
export function cppNotices({ tools, isPresetInstalled, staleFiles = [], problems = [], hasDatabaseSource = true }) {
  const missing = ["format", "tidy"].filter(tool => !tools[tool]).map(tool => missingToolNotice(tool));
  const presetNotice = isPresetInstalled
    ? []
    : ["avi12-lint: cpp-config-avi12 is not installed, so the C++ lint config was not checked"];
  const staleNotice =
    staleFiles.length > 0
      ? [`avi12-lint: ${staleFiles.join(", ")} differ from cpp-config-avi12; run avi12-lint cpp-config`]
      : [];
  const databaseNotice = hasDatabaseSource
    ? []
    : ['avi12-lint: no "database" in avi12-cpp.local.json, so clang-tidy was skipped'];
  return [
    ...missing,
    ...presetNotice,
    ...staleNotice,
    ...databaseNotice,
    ...problems.map(problem => `avi12-lint: ${problem}`)
  ];
}

/**
 * The C++ steps: `clang-format` over every covered file (or the changed ones), and the clang-tidy step, a data
 * description `avi12-lint` hands to `runCppTidy`. `files` are the tracked files, `local` the parsed local file,
 * `tools` is `{ format, tidy }` with the executable of each or undefined when missing. When clang-tidy applies
 * fixes (`AVI12_LINT_TIDY_FIX=1`) it runs before clang-format, which then lays out what the fixes wrote. Pure.
 */
export function cppSteps({ files, local, tools, changedFiles, isFix, env = {}, cwd = "." }) {
  const scope = cppScope({
    files,
    local
  });
  const isConfigTouched = changedFiles !== undefined && isConfigChanged(changedFiles);
  const isFull = changedFiles === undefined || isConfigTouched;
  const changedCovered = isFull ? [] : changedFiles.filter(file => scope.files.includes(file));
  const formatFiles = isFull ? scope.files : changedCovered;
  const steps = [];
  const isFormatNeeded = tools.format && formatFiles.length > 0;
  if (isFormatNeeded) {
    steps.push(
      formatStep({
        files: formatFiles,
        isFix,
        env,
        tools
      })
    );
  }

  const isTidyNeeded = tools.tidy && local?.database && scope.units.length > 0 && (isFull || changedCovered.length > 0);
  if (isTidyNeeded) {
    steps.push({
      name: "clang-tidy",
      command: [],
      env: {},
      rawEnv: {},
      isDirect: true,
      isGuarded: false,
      isParallel: false,
      family: "cpp",
      tidy: {
        units: scope.units,
        headers: scope.headers,
        changedFiles: isFull ? undefined : changedCovered,
        local,
        tool: tools.tidy,
        isFix: env["AVI12_LINT_TIDY_FIX"] === "1",
        limits: cppLimits(env),
        jobsOverride: env["AVI12_LINT_TIDY_JOBS"],
        cwd
      }
    });
  }

  const isTidyFixing = isFix && env["AVI12_LINT_TIDY_FIX"] === "1";
  return isTidyFixing ? steps.reverse() : steps;
}

/** Seconds as `12.3 s`, for the step report. Pure. */
export function seconds(milliseconds) {
  return `${(milliseconds / MS_PER_SECOND).toFixed(1)} s`;
}
