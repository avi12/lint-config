import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildscriptFlags,
  cacheKey,
  changedUnits,
  cppNotices,
  cppScope,
  cppSteps,
  diagnosticBlocks,
  flatEntries,
  includeClosure,
  includeDirectories,
  sanitizeEntry,
  splitCommand,
  tidyPoolSize
} from "avi12-lint/cpp";
import { planCppConfig, staleCppFiles } from "avi12-lint/cpp-config";
import { applyReplacements, mergeReplacements, parseFixes } from "avi12-lint/cpp-fixes";
import { detectLanguages } from "avi12-lint/languages";
import { plan } from "avi12-lint/plan";

import { argumentBudget, batchCommands } from "../packages/avi12-lint/src/batch.js";
import { presetJson } from "./support/cpp.js";

const TOOLS = {
  format: "clang-format",
  tidy: "clang-tidy"
};
const FILES = [
  "src/a.cpp",
  "src/b.cpp",
  "src/a.h",
  "include/b.hpp",
  "external/minhook/hook.c",
  "third_party/x/x.cpp",
  "build/gen.cpp",
  "docs/readme.md",
  "tests/t.cpp"
];

function stepsOf(overrides = {}) {
  return cppSteps({
    files: FILES,
    local: {
      sources: { include: ["^src/", "^include/"] },
      database: { flat: { standard: "17" } }
    },
    tools: TOOLS,
    isFix: false,
    ...overrides
  });
}

test("the preset renders into a clang-format and a clang-tidy file that are stable", () => {
  const { files, problems } = planCppConfig({ preset: presetJson() });
  assert.deepEqual(problems, []);
  assert.match(files.get(".clang-format"), /^BasedOnStyle: Google$/m);
  assert.match(files.get(".clang-format"), /^InsertBraces: true$/m);
  assert.match(files.get(".clang-format"), /^SpacesInLineCommentPrefix:\n {2}Minimum: 1\n {2}Maximum: -1$/m);
  assert.match(files.get(".clang-tidy"), /^WarningsAsErrors: '\*'$/m);
  assert.match(files.get(".clang-tidy"), /^ {2}-\*,$/m);
  assert.match(files.get(".clang-tidy"), /^#   misc-include-cleaner: /m);
  assert.deepEqual(staleCppFiles({ files, existing: new Map(files) }), []);
  assert.deepEqual(staleCppFiles({ files, existing: new Map() }), [".clang-format", ".clang-tidy"]);
});

test("a local file adds checks, switches checks off with a reason and sets options and format keys", () => {
  const { files, problems } = planCppConfig({
    preset: presetJson(),
    local: {
      format: {
        ColumnLimit: 100,
        ReflowComments: null
      },
      tidy: {
        enable: ["misc-include-cleaner"],
        disable: { "readability-magic-numbers": "offsets mirror the reversed binary" },
        options: { "readability-function-size.LineThreshold": "120" },
        optionReasons: { "readability-function-size.LineThreshold": "the state machines are long by design" },
        headerFilterRegex: "^src/"
      }
    }
  });
  assert.deepEqual(problems, []);
  assert.match(files.get(".clang-format"), /^ColumnLimit: 100$/m);
  assert.doesNotMatch(files.get(".clang-format"), /ReflowComments/);
  const tidy = files.get(".clang-tidy");
  assert.match(tidy, /^ {2}-readability-magic-numbers$/m);
  assert.match(tidy, /^#   readability-magic-numbers: offsets mirror the reversed binary$/m);
  assert.match(tidy, /^ {2}misc-include-cleaner,$/m);
  assert.doesNotMatch(tidy, /^#   misc-include-cleaner/m);
  assert.match(tidy, /^ {2}readability-function-size.LineThreshold: '120'$/m);
  assert.match(tidy, /^#   readability-function-size.LineThreshold: the state machines are long by design$/m);
  assert.match(tidy, /^HeaderFilterRegex: '\^src\/'$/m);
});

test("a disabled check without a reason, and an unknown key, are problems", () => {
  const { problems } = planCppConfig({
    preset: presetJson(),
    local: {
      tidy: {
        disable: { "misc-no-recursion": " " },
        options: { "readability-function-size.LineThreshold": "1" },
        unknown: 1
      },
      extra: true
    }
  });
  assert.equal(problems.length, 4);
  assert.match(problems.join("\n"), /tidy\.options "readability-function-size\.LineThreshold" needs a reason/);
  assert.match(problems.join("\n"), /tidy\.disable "misc-no-recursion" needs a reason/);
});

test("the scope drops vendored and build folders and keeps the repo's include patterns", () => {
  const scope = cppScope({
    files: FILES,
    local: { sources: { include: ["^src/", "^include/"] } }
  });
  assert.deepEqual(scope.units, ["src/a.cpp", "src/b.cpp"]);
  assert.deepEqual(scope.headers, ["src/a.h", "include/b.hpp"]);
  const everything = cppScope({ files: FILES });
  assert.deepEqual(everything.units, ["src/a.cpp", "src/b.cpp", "tests/t.cpp"]);
  const excluded = cppScope({
    files: FILES,
    local: { sources: { exclude: ["^tests/"] } }
  });
  assert.deepEqual(excluded.units, ["src/a.cpp", "src/b.cpp"]);
});

test("clang-format is one step over every file, batched by the argument budget, never one per file", () => {
  const [format] = stepsOf();
  assert.equal(format.name, "clang-format");
  assert.deepEqual(format.split.head, ["clang-format", "--dry-run", "--Werror", "--style=file"]);
  assert.deepEqual(format.split.files, ["src/a.cpp", "src/b.cpp", "src/a.h", "include/b.hpp"]);
  const files = Array.from({ length: 500 }, (_, index) => `src/some/long/folder/name/file${index}.cpp`);
  const batches = batchCommands({
    ...format.split,
    files,
    budget: argumentBudget({ platform: "win32" })
  });
  assert.ok(batches.length > 1 && batches.length < 10);
  assert.deepEqual(
    batches.flatMap(batch => batch.slice(format.split.head.length)),
    files
  );
});

test("a fix run formats in place, and clang-tidy fix is opt in", () => {
  const [format, tidy] = stepsOf({ isFix: true });
  assert.deepEqual(format.split.head, ["clang-format", "-i", "--style=file"]);
  assert.equal(tidy.tidy.isFix, false);
  const [fixing, formatAfter] = stepsOf({
    isFix: true,
    env: { AVI12_LINT_TIDY_FIX: "1" }
  });
  assert.equal(fixing.tidy.isFix, true);
  assert.equal(formatAfter.name, "clang-format");
});

test("a changed run limits both steps to the changed covered files, and a config change widens it", () => {
  const [format, tidy] = stepsOf({ changedFiles: ["src/b.cpp", "docs/readme.md", "build/gen.cpp"] });
  assert.deepEqual(format.split.files, ["src/b.cpp"]);
  assert.deepEqual(tidy.tidy.changedFiles, ["src/b.cpp"]);
  assert.deepEqual(stepsOf({ changedFiles: ["docs/readme.md"] }), []);
  const [wide, wideTidy] = stepsOf({ changedFiles: [".clang-tidy"] });
  assert.equal(wide.split.files.length, 4);
  assert.equal(wideTidy.tidy.changedFiles, undefined);
});

test("a missing tool or database leaves its step out, and says so", () => {
  const [only] = stepsOf({ tools: { format: "clang-format" } });
  assert.equal(only.name, "clang-format");
  assert.equal(stepsOf({ tools: { tidy: "clang-tidy" } }).length, 1);
  assert.equal(stepsOf({ local: { sources: { include: ["^src/"] } } }).length, 1);
  assert.deepEqual(
    cppNotices({
      tools: {},
      isPresetInstalled: false,
      staleFiles: [".clang-tidy"],
      hasDatabaseSource: false
    }).length,
    5
  );
  assert.deepEqual(cppNotices({ tools: TOOLS, isPresetInstalled: true }), []);
});

test("the planner adds the C++ steps next to the other languages", () => {
  const steps = plan({
    hasFile: () => false,
    languages: ["cpp"],
    cpp: {
      files: FILES,
      local: {
        database: { flat: { standard: "17" } }
      },
      tools: TOOLS,
      env: {}
    }
  });
  assert.deepEqual(
    steps.filter(({ family }) => family === "cpp").map(({ name }) => name),
    ["clang-format", "clang-tidy"]
  );
});

test("C++ is detected by CMake, a build file, a vcxproj or the lint config", () => {
  for (const marker of ["CMakeLists.txt", ".clang-tidy", ".clang-format", "*.vcxproj"]) {
    assert.deepEqual(
      detectLanguages(candidate => candidate === marker),
      ["cpp"]
    );
  }
});

test("the pool is bounded by cpus, by memory, by the unit count and by the override", () => {
  assert.equal(tidyPoolSize({ freeMegabytes: 64000, cpus: 32, unitCount: 100 }), 32);
  assert.equal(tidyPoolSize({ freeMegabytes: 4500, cpus: 32, unitCount: 100 }), 10);
  assert.equal(tidyPoolSize({ freeMegabytes: 100, cpus: 32, unitCount: 100 }), 1);
  assert.equal(tidyPoolSize({ freeMegabytes: 64000, cpus: 32, unitCount: 3 }), 3);
  assert.equal(tidyPoolSize({ freeMegabytes: 64000, cpus: 32, unitCount: 100, env: { AVI12_LINT_TIDY_JOBS: "4" } }), 4);
});

test("a command line splits on spaces outside quotes", () => {
  assert.deepEqual(splitCommand('cl.exe /DX=1 "/IC:/a b/inc" file.cpp'), [
    "cl.exe",
    "/DX=1",
    "/IC:/a b/inc",
    "file.cpp"
  ]);
});

test("a CMake entry loses its precompiled header flags and its generated include folder becomes external", () => {
  const entry = {
    directory: "C:/repo/build",
    file: "C:/repo/src/a.cpp",
    command: "cl.exe /Yuprecomp.h /Fpbuild/x.pch /IC:/repo/src /IC:/repo/build/gen a.cpp"
  };
  const cleaned = sanitizeEntry({
    entry,
    externalPattern: "/build/"
  });
  assert.deepEqual(cleaned.arguments, ["cl.exe", "/IC:/repo/src", "/external:IC:/repo/build/gen", "a.cpp"]);
  assert.equal(
    sanitizeEntry({
      entry: {
        ...entry,
        file: "C:/repo/build/cmake_pch.cxx"
      }
    }),
    undefined
  );
  assert.deepEqual(includeDirectories(cleaned.arguments), ["C:/repo/src", "C:/repo/build/gen"]);
});

test("a buildscript project gives the standard, the solution and project defines and the include folders", () => {
  const text = [
    "[solution]",
    "name = App",
    "defines = UNICODE, _UNICODE",
    "",
    "[project:dll]",
    "std = 20",
    "defines[Release|x64] = EXTRA=1",
    "includes = external/a/include, src/common",
    "sources = {",
    "    src/dll/*.cpp",
    "}",
    "",
    "[project:other]",
    "std = 11"
  ].join("\n");
  assert.deepEqual(
    buildscriptFlags({
      text,
      project: "dll"
    }),
    {
      standard: "20",
      defines: ["UNICODE", "_UNICODE", "EXTRA=1"],
      includes: ["external/a/include", "src/common"]
    }
  );
  const [entry] = flatEntries({
    units: ["src/a.cpp"],
    root: "C:/repo",
    includeRoot: "app/dll",
    standard: "20",
    defines: ["UNICODE"],
    includes: ["src"],
    flags: ["/DX"]
  });
  assert.deepEqual(entry.arguments, [
    "clang-cl",
    "/std:c++20",
    "/EHsc",
    "/DX",
    "/DUNICODE",
    "/IC:/repo/app/dll/src",
    "C:/repo/src/a.cpp"
  ]);
});

test("the include closure follows quoted and angled project includes and ignores the SDK", () => {
  const files = new Map([
    ["/r/src/a.cpp", '#include "a.h"\n#include <windows.h>\n#  include <common/c.h>\n'],
    ["/r/src/a.h", '#include "sub/b.h"\n#include "a.h"\n'],
    ["/r/src/sub/b.h", "#pragma once\n"],
    ["/r/inc/common/c.h", '#include "../d.h"\n'],
    ["/r/inc/d.h", ""],
    ["/r/src/unrelated.h", ""]
  ]);
  assert.deepEqual(
    includeClosure({
      unit: "/r/src/a.cpp",
      includeDirs: ["/r/inc"],
      readText: file => files.get(file)
    }),
    ["/r/inc/common/c.h", "/r/inc/d.h", "/r/src/a.cpp", "/r/src/a.h", "/r/src/sub/b.h"]
  );
});

test("a change reaches a unit directly or through a header it includes", () => {
  const closures = new Map([
    ["a.cpp", ["a.cpp", "shared.h"]],
    ["b.cpp", ["b.cpp"]]
  ]);
  const units = ["a.cpp", "b.cpp"];
  assert.deepEqual(changedUnits({ units, closures, changedFiles: ["shared.h"] }), ["a.cpp"]);
  assert.deepEqual(changedUnits({ units, closures, changedFiles: ["b.cpp"] }), ["b.cpp"]);
  assert.deepEqual(changedUnits({ units, closures, changedFiles: ["other.h"] }), []);
});

test("the cache key changes with the tool, the config, the flags and any file in the closure", () => {
  const base = {
    toolVersion: "22.1.7",
    configHash: "c",
    argumentsList: ["clang-cl", "a.cpp"],
    fileHashes: [{ file: "a.cpp", hash: "1" }]
  };
  const key = cacheKey(base);
  assert.equal(cacheKey({ ...base }), key);
  assert.notEqual(cacheKey({ ...base, toolVersion: "22.1.8" }), key);
  assert.notEqual(cacheKey({ ...base, configHash: "d" }), key);
  assert.notEqual(cacheKey({ ...base, argumentsList: ["clang-cl", "/DX", "a.cpp"] }), key);
  assert.notEqual(cacheKey({ ...base, fileHashes: [{ file: "a.cpp", hash: "2" }] }), key);
});

test("diagnostics repeat across units and collapse to one block each, without the summary lines", () => {
  const output = [
    "2 warnings generated.",
    "src/a.h:3:5: error: bad [x,-warnings-as-errors]",
    "    3 | int x;",
    "      |     ^",
    "src/a.h:9:1: error: worse [y,-warnings-as-errors]",
    "    9 | int y;",
    "Suppressed 40 warnings (40 in non-user code)."
  ].join("\n");
  const blocks = diagnosticBlocks(output);
  assert.equal(blocks.length, 2);
  assert.match(blocks[0], /^src\/a\.h:3:5: error: bad/);
  assert.deepEqual(diagnosticBlocks(`${output}\n${output}`).length, 4);
});

test("exported fixes parse, merge across units without duplicates or overlaps, and apply to the original bytes", () => {
  const yaml = [
    "---",
    "Diagnostics:",
    "  - DiagnosticName:  x",
    "    DiagnosticMessage:",
    "      FilePath:        'C:\\r\\a.h'",
    "      Replacements:",
    "        - FilePath:        'C:\\r\\a.h'",
    "          Offset:          4",
    "          Length:          3",
    "          ReplacementText: 'it''s'",
    "        - FilePath:        'C:/r/a.h'",
    "          Offset:          10",
    "          Length:          1",
    '          ReplacementText: "X\n\x41"',
    "..."
  ].join("\n");
  const [diagnostic] = parseFixes(yaml);
  assert.deepEqual(diagnostic.replacements, [
    { file: "C:/r/a.h", offset: 4, length: 3, text: "it's" },
    { file: "C:/r/a.h", offset: 10, length: 1, text: "X\nA" }
  ]);
  const clash = {
    replacements: [
      { file: "C:/r/a.h", offset: 5, length: 1, text: "overlap" },
      { file: "C:/r/a.h", offset: 20, length: 1, text: "never applied alone" }
    ]
  };
  assert.deepEqual(mergeReplacements([diagnostic, diagnostic, clash]).get("C:/r/a.h"), diagnostic.replacements);
  const bytes = Buffer.from("int foo = 1;");
  const renamed = applyReplacements({ bytes, replacements: [{ file: "f", offset: 4, length: 3, text: "bar" }] });
  assert.equal(renamed.toString(), "int bar = 1;");
  assert.equal(applyReplacements({ bytes, replacements: [] }).toString(), "int foo = 1;");
});

test("a folder gets its own .clang-tidy that inherits the root one and changes only what it names", () => {
  const { files, problems } = planCppConfig({
    preset: presetJson(),
    local: {
      tidy: {
        directories: {
          "app/test": {
            disable: { "readability-magic-numbers": "tests state their expected numbers" },
            options: { "readability-function-size.LineThreshold": "300" },
            optionReasons: { "readability-function-size.LineThreshold": "a table of cases is long" }
          },
          "app/other": {
            disable: { "misc-no-recursion": "" }
          }
        }
      }
    }
  });
  assert.deepEqual(problems, [
    'avi12-cpp.local.json: tidy.directories "app/other" disable "misc-no-recursion" needs a reason'
  ]);
  const nested = files.get("app/test/.clang-tidy");
  assert.match(nested, /^InheritParentConfig: true$/m);
  assert.match(nested, /^Checks: '-readability-magic-numbers'$/m);
  assert.match(nested, /^ {2}readability-function-size\.LineThreshold: '300'$/m);
  assert.match(nested, /^#   readability-magic-numbers: tests state their expected numbers$/m);
});

test("two spellings of one header merge into one file, so its fixes apply once", () => {
  const diagnostic = file => `  - DiagnosticName: x
    DiagnosticMessage:
      Replacements:
        - FilePath:        '${file}'
          Offset:          4
          Length:          3
          ReplacementText: 'bar'
`;
  const merged = mergeReplacements([
    ...parseFixes(`---\nDiagnostics:\n${diagnostic("c:/r/test/../src/a.h")}`),
    ...parseFixes(`---\nDiagnostics:\n${diagnostic("C:/r/src/a.h")}`)
  ]);
  assert.deepEqual([...merged.keys()], ["C:/r/src/a.h"]);
  assert.equal(merged.get("C:/r/src/a.h").length, 1);
});
