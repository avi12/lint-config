import assert from "node:assert/strict";
import { test } from "node:test";

import { csharpNotices, csharpSteps, csharpTargets, isCsharpConfigChanged, parseDotnetMajor } from "avi12-lint/csharp";
import { planCsharpConfig, staleCsharpFiles } from "avi12-lint/csharp-config";
import rules from "house-rules-avi12/rules.json" with { type: "json" };
import { extractIds, readToolIds } from "house-rules-avi12/tool-ids";

import { loadPreset } from "./support/csharp.js";

const preset = loadPreset();
const roslynIds = readToolIds("roslyn");
const MEMORY_LIMIT_MB = 1000;
const TIME_LIMIT_MS = 5000;
const DEFAULT_MEMORY_MB = 6144;
const DEFAULT_TIME_LIMIT_MS = 1_200_000;
const SDK_MAJOR = 10;

function planWith({ local = {}, existing }) {
  return planCsharpConfig({
    preset,
    local,
    existing
  });
}

function plan(local = {}) {
  return planWith({ local });
}

function stepsOf(overrides = {}) {
  return csharpSteps({
    targets: [
      {
        path: "src/App/App.csproj",
        directory: "src/App"
      }
    ],
    tools: {
      dotnet: true
    },
    formatExcludes: ["IDE0051"],
    changedFiles: undefined,
    isFix: false,
    cwd: "/repo",
    ...overrides
  });
}

test("every rule id the preset names is a real id of the analyzer packages", () => {
  const ids = [
    ...Object.keys(preset.diagnostics).filter(id => !id.startsWith("category-")),
    ...Object.keys(preset.formatExcludes),
    ...Object.keys(preset.thresholds.codeMetrics),
    ...Object.keys(preset.thresholds.sonar),
    ...preset.sonar.keep
  ];
  const unknown = ids.filter(id => !roslynIds.has(id));
  assert.deepEqual(unknown, []);
});

test("every analyzer id the parity matrix names for C# is configured, except the ones a property or the compiler owns", () => {
  const configured = new Set(Object.keys(preset.diagnostics));
  const named = rules.rules.flatMap(rule =>
    extractIds({
      language: "csharp",
      text: rule.csharp.join(" ")
    }).map(([, id]) => id)
  );
  const unconfigured = [...new Set(named)].filter(id => !configured.has(id));
  assert.deepEqual(unconfigured, []);
});

test("every rule turned off carries a reason", () => {
  const silent = Object.entries(preset.diagnostics).filter(([, entry]) => entry.severity === "none" && !entry.reason);
  assert.deepEqual(silent, []);
  assert.deepEqual(
    Object.entries(preset.formatExcludes).filter(([, reason]) => !reason),
    []
  );
});

test("the Sonar list holds every Sonar id of the committed id list and keeps only ids it holds", () => {
  const committed = [...roslynIds].filter(id => /^S\d{3,4}$/.test(id)).sort();
  assert.deepEqual([...preset.sonar.ids].sort(), committed);
  assert.deepEqual(
    preset.sonar.keep.filter(id => !preset.sonar.ids.includes(id)),
    []
  );
});

test("the generated files are deterministic and a repo with none is stale in all of them", () => {
  const first = plan();
  const second = plan();
  assert.deepEqual(first.problems, []);
  assert.deepEqual([...first.files], [...second.files]);
  assert.deepEqual(
    staleCsharpFiles({
      files: first.files,
      existing: new Map()
    }).sort(),
    [...first.files.keys()].sort()
  );
  assert.deepEqual(
    staleCsharpFiles({
      files: first.files,
      existing: first.files
    }),
    []
  );
});

test("a rule that is off says why in the .editorconfig, above its line", () => {
  const text = plan().files.get(".editorconfig");
  const lines = text.split("\n");
  const index = lines.indexOf("dotnet_diagnostic.CA1707.severity = none");
  assert.match(lines[index - 1], /^# CA1707: .+/);
});

test("one process at a time and no node or compiler server is left behind", () => {
  const [format, build] = stepsOf();
  assert.deepEqual(
    [format, build].map(step => step.isParallel),
    [false, false]
  );
  for (const flag of [
    "-m:1",
    "-nodeReuse:false",
    "-p:UseSharedCompilation=false",
    "--no-incremental",
    "-warnaserror"
  ]) {
    assert.ok(build.command.includes(flag), flag);
  }

  assert.ok(build.command.includes("/repo/.verify/csharp-artifacts/src-App-App-csproj"));
  assert.equal(format.rawEnv["MSBUILDDISABLENODEREUSE"], "1");
});

test("format verifies, or fixes with --fix, and never fixes what would delete a member", () => {
  const [verify] = stepsOf();
  assert.ok(verify.command.includes("--verify-no-changes"));
  assert.deepEqual(verify.command.slice(verify.command.indexOf("--exclude-diagnostics")), [
    "--exclude-diagnostics",
    "IDE0051"
  ]);
  const [fix] = stepsOf({ isFix: true });
  assert.ok(!fix.command.includes("--verify-no-changes"));
  assert.ok(fix.command.includes("--exclude-diagnostics"));
});

test("--changed formats only the changed C# files of a target and builds only that target", () => {
  const targets = [
    {
      path: "a/A.csproj",
      directory: "a"
    },
    {
      path: "b/B.csproj",
      directory: "b"
    }
  ];
  const steps = stepsOf({
    targets,
    changedFiles: ["a/One.cs", "a/Two.cs", "b/readme.md", "docs/x.md"]
  });
  assert.deepEqual(
    steps.map(step => step.name),
    ["dotnet format a/A.csproj", "dotnet build a/A.csproj"]
  );
  assert.deepEqual(steps[0].split.files, ["a/One.cs", "a/Two.cs"]);
  assert.deepEqual(
    stepsOf({
      targets,
      changedFiles: ["docs/x.md"]
    }),
    []
  );
});

test("a changed config input rebuilds and reformats every target", () => {
  const targets = [
    {
      path: "a/A.csproj",
      directory: "a"
    },
    {
      path: "b/B.csproj",
      directory: "b"
    }
  ];
  assert.equal(isCsharpConfigChanged([".editorconfig"]), true);
  assert.equal(isCsharpConfigChanged([".avi12-csharp/BannedSymbols.txt"]), true);
  assert.equal(isCsharpConfigChanged(["a/One.cs"]), false);
  assert.equal(
    stepsOf({
      targets,
      changedFiles: ["avi12-csharp.local.json"]
    }).length,
    targets.length * 2
  );
});

test("a changed project file builds without formatting a file list", () => {
  const steps = stepsOf({ changedFiles: ["src/App/App.csproj"] });
  assert.deepEqual(
    steps.map(step => step.name),
    ["dotnet build src/App/App.csproj"]
  );
});

test("the guard limits come from the environment and fall back to wide defaults", () => {
  const [{ limits }] = stepsOf({
    env: {
      AVI12_LINT_CSHARP_MEMORY_MB: String(MEMORY_LIMIT_MB),
      AVI12_LINT_CSHARP_TIME_LIMIT_MS: String(TIME_LIMIT_MS)
    }
  });
  assert.deepEqual(limits, {
    memoryLimitMb: MEMORY_LIMIT_MB,
    timeLimitMs: TIME_LIMIT_MS
  });
  const [{ limits: defaults }] = stepsOf();
  assert.deepEqual(defaults, {
    memoryLimitMb: DEFAULT_MEMORY_MB,
    timeLimitMs: DEFAULT_TIME_LIMIT_MS
  });
});

test("targets are the solutions and the projects no solution covers, never a build folder", () => {
  assert.deepEqual(
    csharpTargets({
      files: ["App.sln", "src/A/A.csproj", "tools/T/T.csproj", "bin/Debug/X.csproj", "obj/Y.csproj"]
    }).map(target => target.path),
    ["App.sln"]
  );
  assert.deepEqual(
    csharpTargets({
      files: ["src/A/A.csproj", "tools/T/T.csproj", "node_modules/p/P.csproj"]
    }).map(target => target.path),
    ["src/A/A.csproj", "tools/T/T.csproj"]
  );
  assert.deepEqual(
    csharpTargets({
      files: ["src/A/A.csproj"],
      local: {
        targets: ["src/B/B.csproj"]
      }
    }).map(target => target.path),
    ["src/B/B.csproj"]
  );
});

test("without an SDK no step is planned, and the notices say what to install", () => {
  assert.deepEqual(
    stepsOf({
      tools: {
        dotnet: false
      }
    }),
    []
  );
  assert.match(
    csharpNotices({
      dotnetMajor: undefined,
      isPresetInstalled: true
    })[0],
    /\.NET SDK 8 or newer/
  );
  assert.match(
    csharpNotices({
      dotnetMajor: SDK_MAJOR,
      isPresetInstalled: false
    })[0],
    /csharp-config-avi12 is not installed/
  );
  assert.match(
    csharpNotices({
      dotnetMajor: SDK_MAJOR,
      isPresetInstalled: true,
      staleFiles: [".editorconfig"]
    })[0],
    /run avi12-lint csharp-config/
  );
  assert.equal(parseDotnetMajor("10.0.404\n"), SDK_MAJOR);
  assert.equal(parseDotnetMajor("preview"), undefined);
});

test("every exemption in the local file needs a reason, and an unknown key is reported", () => {
  const { problems } = plan({
    diagnostics: {
      CA1031: {
        severity: "none"
      },
      IDE0011: {
        severity: "loud",
        reason: "x"
      }
    },
    properties: {
      NoWarn: {
        value: "CS1591"
      }
    },
    options: {
      indent_size: {
        value: "4"
      }
    },
    thresholds: {
      CA1502: {
        value: 30
      },
      S107: {
        reason: "x"
      }
    },
    generatedPaths: {
      "**/Gen/**.cs": ""
    },
    files: {
      "src/A.cs": {
        S109: {
          severity: "none"
        }
      }
    },
    directories: {
      tests: {
        diagnostics: {
          CA1707: {
            severity: "none"
          }
        }
      }
    },
    unbanned: {
      "M:System.GC.Collect": ""
    },
    surprise: true
  });
  assert.deepEqual(
    problems.map(problem => problem.replace("avi12-csharp.local.json: ", "")),
    [
      'unknown key "surprise"',
      'diagnostics "CA1031" needs a reason',
      'diagnostics "IDE0011" needs a severity of error, warning, suggestion, silent, none',
      'generatedPaths "**/Gen/**.cs" needs a reason',
      'properties "NoWarn" needs a reason',
      'options "indent_size" needs a reason',
      'thresholds "CA1502" needs a reason',
      'thresholds "S107" needs a numeric value',
      'unbanned "M:System.GC.Collect" needs a reason',
      'files "src/A.cs" "S109" needs a reason',
      'directories "tests" diagnostics "CA1707" needs a reason'
    ]
  );
});

test("a reasoned local file changes a severity, an option, a threshold, a banned symbol and a property", () => {
  const { files, problems } = plan({
    diagnostics: {
      CA1031: {
        severity: "none",
        reason: "the host must survive Edge"
      }
    },
    options: {
      indent_size: {
        value: "4",
        reason: "the repo is already at four"
      }
    },
    thresholds: {
      CA1502: {
        value: 30,
        reason: "a parser"
      },
      S107: {
        value: 6,
        reason: "a Win32 callback"
      }
    },
    banned: {
      "M:System.GC.Collect": "let the runtime decide"
    },
    unbanned: {
      "M:System.Diagnostics.Debugger.Break": "a debugger tool"
    },
    properties: {
      NoWarn: {
        value: "$(NoWarn);NU1701",
        reason: "an old package"
      }
    },
    files: {
      "src/A.cs": {
        S109: {
          severity: "none",
          reason: "a table of codes"
        }
      }
    },
    directories: {
      tests: {
        diagnostics: {
          CA1707: {
            severity: "none",
            reason: "test names read as sentences"
          }
        }
      }
    },
    generatedPaths: {
      "**/Gen/**.cs": "written by a generator"
    },
    sections: {
      "*": {
        end_of_line: "crlf"
      }
    }
  });
  assert.deepEqual(problems, []);
  const editorconfig = files.get(".editorconfig");
  assert.match(editorconfig, /# CA1031: the host must survive Edge\ndotnet_diagnostic\.CA1031\.severity = none/);
  assert.match(editorconfig, /^indent_size = 4$/m);
  assert.match(editorconfig, /\[src\/A\.cs\]\n# S109: a table of codes\ndotnet_diagnostic\.S109\.severity = none/);
  assert.match(editorconfig, /# written by a generator\n\[\*\*\/Gen\/\*\*\.cs\]\ngenerated_code = true/);
  assert.match(editorconfig, /^end_of_line = crlf$/m);
  assert.match(files.get(".avi12-csharp/CodeMetricsConfig.txt"), /^CA1502: 30$/m);
  assert.match(
    files.get(".avi12-csharp/SonarLint.xml"),
    /<Key>S107<\/Key><Parameters><Parameter><Key>max<\/Key><Value>6<\/Value>/
  );
  assert.match(files.get(".avi12-csharp/BannedSymbols.txt"), /^M:System\.GC\.Collect;let the runtime decide$/m);
  assert.doesNotMatch(files.get(".avi12-csharp/BannedSymbols.txt"), /Debugger\.Break/);
  assert.match(files.get(".avi12-csharp/analyzers.props"), /<NoWarn>\$\(NoWarn\);NU1701<\/NoWarn>/);
  assert.match(files.get("tests/.editorconfig"), /dotnet_diagnostic\.CA1707\.severity = none/);
});

test("a repo's own Directory.Build.props must import the generated props, and a generated one is replaced", () => {
  const own = "<Project><PropertyGroup><Foo>1</Foo></PropertyGroup></Project>";
  const refused = planWith({ existing: new Map([["Directory.Build.props", own]]) });
  assert.equal(refused.files.has("Directory.Build.props"), false);
  assert.match(refused.problems[0], /must import \.avi12-csharp\/analyzers\.props/);
  const importing = planWith({
    existing: new Map([
      ["Directory.Build.props", `<Project><Import Project=".avi12-csharp/analyzers.props" /></Project>`]
    ])
  });
  assert.deepEqual(importing.problems, []);
  assert.equal(importing.files.has("Directory.Build.props"), false);
  const generated = planWith({
    existing: new Map([["Directory.Build.props", plan().files.get("Directory.Build.props")]])
  });
  assert.equal(generated.files.has("Directory.Build.props"), true);
});

test("the props reference every analyzer package at its pinned version and give the fixers their exclusions elsewhere", () => {
  const props = plan().files.get(".avi12-csharp/analyzers.props");
  for (const { id, version } of preset.analyzers) {
    assert.ok(props.includes(`Include="${id}" Version="${version}"`), id);
  }

  assert.match(props, /<TreatWarningsAsErrors>true<\/TreatWarningsAsErrors>/);
  assert.match(props, /<WarningsNotAsErrors>NU1900/);
});

test("no two rules clash: a rule is never both on and off, and one owner holds each overlapping pair", () => {
  const ids = Object.keys(preset.diagnostics);
  assert.equal(new Set(ids).size, ids.length);
  const owners = [
    ["SA1649", "MA0048"],
    ["S1135", "MA0026"],
    ["CS4014", "MA0134"]
  ];
  for (const [owner, duplicate] of owners) {
    assert.notEqual(preset.diagnostics[owner].severity, "none", owner);
    assert.equal(preset.diagnostics[duplicate].severity, "none", duplicate);
  }

  const style = plan().files.get(".editorconfig");
  assert.match(style, /^csharp_style_var_when_type_is_apparent = true:warning$/m);
  assert.match(style, /^dotnet_style_qualification_for_field = false:warning$/m);
});
