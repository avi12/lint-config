import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { runCppTidy } from "avi12-lint/cpp-tidy";

const CWD = "/r";
const LIMITS = {
  memoryLimitMb: 8192,
  timeLimitMs: 60000
};

function makeWorld(texts) {
  const files = new Map(Object.entries(texts));
  const runs = [];
  const logs = [];
  let clock = 0;
  const failing = new Set();
  let live = 0;
  let peak = 0;
  const deps = {
    readText: path => files.get(path),
    writeText: ({ path, text }) => files.set(path, text),
    exists: path => files.has(path),
    makeDirectory: () => undefined,
    hashText: text => createHash("sha256").update(text).digest("hex"),
    run: async ({ command }) => {
      if (command[1] === "--version") {
        return {
          status: 0,
          output: "LLVM version 22.1.7\n"
        };
      }

      runs.push(command);
      live += 1;
      peak = Math.max(peak, live);
      await new Promise(done => setTimeout(done, 5));
      live -= 1;
      const unit = command.at(-1);
      return failing.has(unit)
        ? {
            status: 1,
            output: `${unit}:1:1: error: bad [some-check,-warnings-as-errors]\n    1 | x\n`
          }
        : {
            status: 0,
            output: ""
          };
    },
    wait: () => Promise.resolve(),
    now: () => (clock += 10),
    freeMegabytes: () => 64000,
    cpus: () => 4,
    usageMegabytes: () => 0,
    log: text => logs.push(text)
  };
  return {
    files,
    runs,
    logs,
    failing,
    deps,
    peak: () => peak
  };
}

function tidyOf(overrides = {}) {
  return {
    units: ["src/a.cpp", "src/b.cpp", "src/c.cpp"],
    changedFiles: undefined,
    local: { database: { flat: { standard: "17", includes: ["src"] } } },
    tool: "clang-tidy",
    isFix: false,
    limits: LIMITS,
    cwd: CWD,
    ...overrides
  };
}

const SOURCES = {
  "/r/.clang-tidy": "Checks: x\n",
  "/r/src/a.cpp": '#include "shared.h"\n',
  "/r/src/b.cpp": '#include "shared.h"\n',
  "/r/src/c.cpp": "int main() {}\n",
  "/r/src/shared.h": "#pragma once\n"
};

test("the second run takes every unit from the cache and starts no clang-tidy", async () => {
  const world = makeWorld(SOURCES);
  assert.equal(await runCppTidy({ tidy: tidyOf(), deps: world.deps }), 0);
  assert.equal(world.runs.length, 3);
  assert.match(world.logs.at(-1), /3 units, 0 cached, 3 analysed/);
  world.runs.length = 0;
  assert.equal(await runCppTidy({ tidy: tidyOf(), deps: world.deps }), 0);
  assert.equal(world.runs.length, 0);
  assert.match(world.logs.at(-1), /3 units, 3 cached, 0 analysed/);
});

test("the compile database is written under .verify with one entry per unit", async () => {
  const world = makeWorld(SOURCES);
  await runCppTidy({ tidy: tidyOf(), deps: world.deps });
  const entries = JSON.parse(world.files.get("/r/.verify/clang-tidy/compile_commands.json"));
  assert.deepEqual(
    entries.map(({ file }) => file),
    ["/r/src/a.cpp", "/r/src/b.cpp", "/r/src/c.cpp"]
  );
  assert.ok(entries[0].arguments.includes("/I/r/src"));
  assert.deepEqual(world.runs[0].slice(0, 4), ["clang-tidy", "--quiet", "-p", "/r/.verify/clang-tidy"]);
});

test("editing a unit reruns only it, and editing a shared header reruns every unit that includes it", async () => {
  const world = makeWorld(SOURCES);
  await runCppTidy({ tidy: tidyOf(), deps: world.deps });
  world.runs.length = 0;
  world.files.set("/r/src/c.cpp", "int main() { return 0; }\n");
  await runCppTidy({ tidy: tidyOf(), deps: world.deps });
  assert.deepEqual(
    world.runs.map(command => command.at(-1)),
    ["/r/src/c.cpp"]
  );
  world.runs.length = 0;
  world.files.set("/r/src/shared.h", "#pragma once\nint x;\n");
  await runCppTidy({ tidy: tidyOf(), deps: world.deps });
  assert.deepEqual(world.runs.map(command => command.at(-1)).sort(), ["/r/src/a.cpp", "/r/src/b.cpp"]);
});

test("a changed config invalidates every unit", async () => {
  const world = makeWorld(SOURCES);
  await runCppTidy({ tidy: tidyOf(), deps: world.deps });
  world.runs.length = 0;
  world.files.set("/r/.clang-tidy", "Checks: y\n");
  await runCppTidy({ tidy: tidyOf(), deps: world.deps });
  assert.equal(world.runs.length, 3);
});

test("a failing unit is reported once, fails the run and is not cached", async () => {
  const world = makeWorld(SOURCES);
  world.failing.add("/r/src/c.cpp");
  assert.equal(await runCppTidy({ tidy: tidyOf(), deps: world.deps }), 1);
  assert.equal(world.logs.filter(text => text.includes("bad [some-check")).length, 1);
  world.runs.length = 0;
  assert.equal(await runCppTidy({ tidy: tidyOf(), deps: world.deps }), 1);
  assert.deepEqual(
    world.runs.map(command => command.at(-1)),
    ["/r/src/c.cpp"]
  );
});

test("a changed-files run reaches the changed units and the units through a changed header", async () => {
  const world = makeWorld(SOURCES);
  await runCppTidy({
    tidy: tidyOf({ changedFiles: ["src/shared.h"] }),
    deps: world.deps
  });
  assert.deepEqual(world.runs.map(command => command.at(-1)).sort(), ["/r/src/a.cpp", "/r/src/b.cpp"]);
  world.runs.length = 0;
  await runCppTidy({
    tidy: tidyOf({ changedFiles: ["src/c.cpp"] }),
    deps: world.deps
  });
  assert.deepEqual(
    world.runs.map(command => command.at(-1)),
    ["/r/src/c.cpp"]
  );
});

const EXPORT_FLAG = "--export-fixes=";

function exportedYaml({ unit }) {
  return [
    "---",
    "Diagnostics:",
    "  - DiagnosticName: readability-identifier-naming",
    "    DiagnosticMessage:",
    "      Replacements:",
    "        - FilePath:        '/r/src/shared.h'",
    "          Offset:          4",
    "          Length:          8",
    "          ReplacementText: 'oldName'",
    `        - FilePath:        '${unit}'`,
    "          Offset:          0",
    "          Length:          0",
    '          ReplacementText: "// seen\\n"',
    "..."
  ].join("\n");
}

test("a fix run merges the fixes of every unit and applies them once, so a rename reaches every use", async () => {
  const world = makeWorld({
    ...SOURCES,
    "/r/src/shared.h": "int old_name;\n"
  });
  const written = new Map();
  world.deps.readBytes = path => Buffer.from(written.get(path) ?? world.files.get(path));
  world.deps.writeBytes = ({ path, bytes }) => written.set(path, bytes.toString());
  const run = world.deps.run;
  world.deps.run = ({ command }) => {
    const flag = command.find(argument => argument.startsWith(EXPORT_FLAG));
    if (flag) {
      world.files.set(flag.slice(EXPORT_FLAG.length), exportedYaml({ unit: command.at(-1) }));
    }

    return run({ command });
  };
  await runCppTidy({ tidy: tidyOf({ isFix: true }), deps: world.deps });
  assert.equal(written.get("/r/src/shared.h"), "int oldName;\n");
  assert.match(written.get("/r/src/a.cpp"), /^\/\/ seen\n#include/);
  assert.ok(world.runs.every(command => command.some(argument => argument.startsWith(EXPORT_FLAG))));
  assert.ok(world.runs.every(command => !command.includes("--fix")));
  assert.match(world.logs.join("\n"), /fixed 4 files/);
  assert.equal([...world.files.keys()].filter(path => path.startsWith("/r/.verify/clang-tidy-cache/")).length, 0);
});

test("the pool runs units in parallel up to the cpu count", async () => {
  const world = makeWorld(SOURCES);
  await runCppTidy({ tidy: tidyOf(), deps: world.deps });
  assert.ok(world.peak() > 1 && world.peak() <= 3);
});

test("the pool stops starting units while memory is over the limit and something runs", async () => {
  const world = makeWorld(SOURCES);
  let isFull = true;
  world.deps.usageMegabytes = () => (isFull ? LIMITS.memoryLimitMb : 0);
  world.deps.wait = async () => {
    isFull = false;
  };
  await runCppTidy({ tidy: tidyOf(), deps: world.deps });
  assert.equal(world.runs.length, 3);
});

test("a sighmake buildscript supplies the flags, read from the repo", async () => {
  const world = makeWorld({
    ...SOURCES,
    "/r/app.buildscript": "[solution]\ndefines = A, B\n[project:dll]\nstd = 20\nincludes = src\n"
  });
  await runCppTidy({
    tidy: tidyOf({
      local: {
        database: {
          buildscript: {
            file: "app.buildscript",
            project: "dll"
          }
        }
      }
    }),
    deps: world.deps
  });
  const [entry] = JSON.parse(world.files.get("/r/.verify/clang-tidy/compile_commands.json"));
  assert.deepEqual(entry.arguments.slice(0, 6), ["clang-cl", "/std:c++20", "/EHsc", "/DA", "/DB", "/I/r/src"]);
});
