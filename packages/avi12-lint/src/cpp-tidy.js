import { applyReplacements, mergeReplacements, parseFixes } from "./cpp-fixes.js";
import {
  buildscriptFlags,
  cacheKey,
  changedUnits,
  CPP_CACHE_DIRECTORY,
  CPP_DATABASE_DIRECTORY,
  diagnosticBlocks,
  flatEntries,
  includeClosure,
  includeDirectories,
  sanitizeEntry,
  seconds,
  TIDY_MEGABYTES_PER_UNIT,
  tidyPoolSize
} from "./cpp.js";

const ADMISSION_WAIT_MS = 200;
const CALIBRATION_UNITS = 4;
const CALIBRATION_MS = 4000;
const MS_PER_SECOND = 1000;

function databaseEntries({ database, units, cwd, deps }) {
  const flags = {
    root: cwd,
    units
  };
  if (database.path) {
    const entries = JSON.parse(deps.readText(`${cwd}/${database.path}`));
    const wanted = new Set(units.map(unit => `${cwd}/${unit}`));
    return entries
      .map(entry =>
        sanitizeEntry({
          entry: {
            ...entry,
            file: entry.file.replaceAll("\\", "/")
          },
          externalPattern: database.externalIncludes
        })
      )
      .filter(entry => entry && wanted.has(entry.file));
  }

  if (database.buildscript) {
    const { file, project, includeRoot, flags: extra } = database.buildscript;
    return flatEntries({
      ...flags,
      ...buildscriptFlags({
        text: deps.readText(`${cwd}/${file}`),
        project
      }),
      includeRoot,
      flags: extra
    });
  }

  return flatEntries({
    ...flags,
    ...database.flat
  });
}

function analysed({ entry, cwd, deps }) {
  const memo = new Map();
  function readText(file) {
    if (!memo.has(file)) {
      memo.set(file, file.startsWith(`${cwd}/`) ? deps.readText(file) : undefined);
    }

    return memo.get(file);
  }

  const unit = entry.file;
  const includeDirs = includeDirectories(entry.arguments).map(directory => directory.replaceAll("\\", "/"));
  return includeClosure({
    unit,
    includeDirs,
    readText
  }).map(file => ({
    file,
    hash: deps.hashText(readText(file) ?? "")
  }));
}

function applyExportedFixes({ directory, count, deps }) {
  const replacements = Array.from({ length: count }, (_, index) => `${directory}/${index}.yaml`)
    .map(path => deps.readText(path))
    .filter(text => text !== undefined)
    .flatMap(text => parseFixes(text));
  const merged = mergeReplacements(replacements);
  for (const [file, list] of merged) {
    deps.writeBytes({
      path: file,
      bytes: applyReplacements({
        bytes: deps.readBytes(file),
        replacements: list
      })
    });
  }

  return merged.size;
}

/**
 * Runs the jobs through at most `size` workers, admitting one only while the tree's memory plus one more unit's
 * measured peak fits the limit (a unit's cost is learned from the running ones: a C++/WinRT unit takes 1.5 GB where a
 * plain one takes 130 MB), and no more than `CALIBRATION_UNITS` until the first unit finishes or
 * `CALIBRATION_MS` have passed, so the cost shows before the pool fills.
 */
async function runPool({ jobs, size, deps, limits, start }) {
  const queue = [...jobs];
  const results = [];
  const begin = deps.now();
  let running = 0;
  let peakPerUnit = TIDY_MEGABYTES_PER_UNIT;
  function isAdmitted() {
    if (running > 0) {
      peakPerUnit = Math.max(peakPerUnit, deps.usageMegabytes() / running);
    }

    const isCalibrating = results.length === 0 && deps.now() - begin < CALIBRATION_MS;
    const cap = isCalibrating ? Math.min(size, CALIBRATION_UNITS) : size;
    const isMemoryBound = running > 0 && deps.usageMegabytes() + peakPerUnit > limits.memoryLimitMb;
    return running < cap && !isMemoryBound;
  }

  async function worker() {
    while (queue.length > 0) {
      if (!isAdmitted()) {
        await deps.wait(ADMISSION_WAIT_MS);
        continue;
      }

      const job = queue.shift();
      const remaining = limits.timeLimitMs - (deps.now() - start);
      if (remaining <= 0) {
        results.push({
          job,
          status: 1,
          output: `clang-tidy stopped: it ran over ${Math.round(limits.timeLimitMs / MS_PER_SECOND)} s (AVI12_LINT_CPP_TIME_LIMIT_MS)`
        });
        continue;
      }

      running += 1;
      const outcome = await deps.run({
        command: job.command,
        timeoutMs: remaining
      });
      running -= 1;
      results.push({
        job,
        ...outcome
      });
    }
  }

  await Promise.all(Array.from({ length: size }, worker));
  return results;
}

/**
 * Runs clang-tidy over the translation units of `tidy` (see `cppSteps`): builds the compile database under
 * `.verify/clang-tidy`, skips every unit whose key (tool version, `.clang-tidy`, compile arguments, content of the
 * unit and of every project header it includes) already passed, runs the rest through a pool bounded by memory,
 * and records each pass. With `tidy.isFix` every unit exports its fixes (`--export-fixes`), the fixes of all units are
 * merged and applied once to the files as they were (a rename in one unit must reach the uses in every other unit,
 * which an in-place `--fix` per unit cannot do), and nothing is cached.
 * `deps` is `{ readText, writeText, readBytes, writeBytes, exists, makeDirectory, hashText, run, wait, now, freeMegabytes, cpus,
 * usageMegabytes, log }`. Resolves 0 or 1.
 */
export async function runCppTidy({ tidy, deps }) {
  const start = deps.now();
  const { cwd, local, tool, isFix, limits } = tidy;
  const entries = databaseEntries({
    database: local.database,
    units: tidy.units,
    cwd,
    deps
  });
  const databaseDirectory = `${cwd}/${CPP_DATABASE_DIRECTORY}`;
  deps.makeDirectory(databaseDirectory);
  deps.writeText({
    path: `${databaseDirectory}/compile_commands.json`,
    text: `${JSON.stringify(entries, null, 2)}\n`
  });

  const closures = new Map(
    entries.map(entry => [
      entry.file,
      analysed({
        entry,
        cwd,
        deps
      })
    ])
  );
  const unitFiles = entries.map(entry => entry.file);
  const isLimited = tidy.changedFiles !== undefined;
  const selected = isLimited
    ? changedUnits({
        units: unitFiles,
        closures: new Map([...closures].map(([unit, files]) => [unit, files.map(({ file }) => file)])),
        changedFiles: tidy.changedFiles.map(file => `${cwd}/${file}`)
      })
    : unitFiles;
  const configHash = deps.hashText(deps.readText(`${cwd}/.clang-tidy`) ?? "");
  const { output: versionOutput } = await deps.run({
    command: [tool, "--version"],
    timeoutMs: limits.timeLimitMs
  });
  const toolVersion = versionOutput.trim();
  deps.makeDirectory(`${cwd}/${CPP_CACHE_DIRECTORY}`);
  const planned = selected.map(file => {
    const entry = entries.find(candidate => candidate.file === file);
    const key = cacheKey({
      toolVersion,
      configHash,
      argumentsList: entry.arguments,
      fileHashes: closures.get(file)
    });
    return {
      file,
      key,
      marker: `${cwd}/${CPP_CACHE_DIRECTORY}/${key}`
    };
  });
  const pending = planned.filter(({ marker }) => isFix || !deps.exists(marker));
  const hits = planned.length - pending.length;
  const size = tidyPoolSize({
    freeMegabytes: deps.freeMegabytes(),
    cpus: deps.cpus(),
    unitCount: pending.length,
    env: {
      AVI12_LINT_TIDY_JOBS: tidy.jobsOverride
    }
  });
  const fixDirectory = `${databaseDirectory}/fixes`;
  deps.makeDirectory(fixDirectory);
  for (const index of pending.keys()) {
    deps.writeText({
      path: `${fixDirectory}/${index}.yaml`,
      text: ""
    });
  }
  const results = await runPool({
    jobs: pending.map((item, index) => ({
      ...item,
      command: [
        tool,
        "--quiet",
        "-p",
        databaseDirectory,
        ...(isFix ? [`--export-fixes=${fixDirectory}/${index}.yaml`] : []),
        item.file
      ]
    })),
    size,
    deps,
    limits,
    start
  });
  const failed = results.filter(({ status }) => status !== 0);
  for (const { job } of results.filter(({ status }) => status === 0 && !isFix)) {
    deps.writeText({
      path: job.marker,
      text: ""
    });
  }

  const fixedFiles = isFix
    ? applyExportedFixes({
        directory: fixDirectory,
        count: pending.length,
        deps
      })
    : 0;
  const reported = new Set();
  for (const { output } of failed) {
    const blocks = diagnosticBlocks(output);
    const lines = blocks.length > 0 ? blocks : [output.trim()];
    for (const block of lines) {
      if (!reported.has(block)) {
        reported.add(block);
        deps.log(block);
      }
    }
  }

  if (isFix) {
    deps.log(`avi12-lint: clang-tidy fixed ${fixedFiles} files; run again to see what is left`);
  }

  deps.log(
    `avi12-lint: clang-tidy ${planned.length} units, ${hits} cached, ${pending.length} analysed on ${size} workers in ${seconds(deps.now() - start)}`
  );
  return failed.length === 0 ? 0 : 1;
}
