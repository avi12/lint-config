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

async function runPool({ jobs, size, deps, limits, start }) {
  const queue = [...jobs];
  const results = [];
  let running = 0;
  async function worker() {
    while (queue.length > 0) {
      const isOverMemory = deps.usageMegabytes() + TIDY_MEGABYTES_PER_UNIT > limits.memoryLimitMb;
      const isWaiting = isOverMemory && running > 0;
      if (isWaiting) {
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
 * and records each pass. With `tidy.isFix` it runs one unit at a time with `--fix --fix-errors` and no cache.
 * `deps` is `{ readText, writeText, exists, makeDirectory, hashText, run, wait, now, freeMegabytes, cpus,
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
  const size = isFix
    ? 1
    : tidyPoolSize({
        freeMegabytes: deps.freeMegabytes(),
        cpus: deps.cpus(),
        unitCount: pending.length,
        env: {
          AVI12_LINT_TIDY_JOBS: tidy.jobsOverride
        }
      });
  const results = await runPool({
    jobs: pending.map(item => ({
      ...item,
      command: [tool, "--quiet", "-p", databaseDirectory, ...(isFix ? ["--fix", "--fix-errors"] : []), item.file]
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

  deps.log(
    `avi12-lint: clang-tidy ${planned.length} units, ${hits} cached, ${pending.length} analysed on ${size} workers in ${seconds(deps.now() - start)}`
  );
  return failed.length === 0 ? 0 : 1;
}
