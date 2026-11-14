import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { buildFindings, formatRun, hasDotnet, loadPreset, materialize } from "./support/csharp.js";

const isRunnable = hasDotnet();
const FLAG = /\/\/ flag: (.+)$/;
const LOCAL_THRESHOLDS = {
  thresholds: {
    CA1502: {
      value: 3,
      reason: "a fixture proves the rule with a small method"
    },
    CA1506: {
      value: 2,
      reason: "a fixture proves the rule with a small class"
    }
  }
};

function expectedFindings(directory) {
  return readdirSync(directory)
    .filter(file => file.endsWith(".cs"))
    .flatMap(file =>
      readFileSync(join(directory, file), "utf8")
        .split("\n")
        .flatMap((line, index) => {
          const match = FLAG.exec(line);
          return match ? match[1].split(",").map(id => `${id.trim()}@${file}:${index + 1}`) : [];
        })
    )
    .sort();
}

function idsOf(findings) {
  return new Set(findings.map(finding => finding.split("@")[0]));
}

test("every configured rule fires on the line its fixture marks", { skip: !isRunnable }, () => {
  const flag = materialize({
    fixture: "flag",
    local: LOCAL_THRESHOLDS
  });
  assert.deepEqual(flag.problems, []);
  const found = buildFindings({
    directory: flag.directory,
    project: "Flag.csproj"
  });
  const docs = materialize({ fixture: "flag-docs" });
  const foundDocs = buildFindings({
    directory: docs.directory,
    project: "FlagDocs.csproj"
  });
  const missing = [...expectedFindings(flag.directory), ...expectedFindings(docs.directory)].filter(
    expected => ![...found, ...foundDocs].includes(expected)
  );
  assert.deepEqual(missing, []);
});

test("every rule the preset turns on is proved by a fixture", { skip: !isRunnable }, () => {
  const flag = materialize({
    fixture: "flag",
    local: LOCAL_THRESHOLDS
  });
  const docs = materialize({ fixture: "flag-docs" });
  const fired = idsOf([
    ...buildFindings({
      directory: flag.directory,
      project: "Flag.csproj"
    }),
    ...buildFindings({
      directory: docs.directory,
      project: "FlagDocs.csproj"
    })
  ]);
  const unproved = Object.entries(loadPreset().diagnostics)
    .filter(([id, entry]) => !id.startsWith("category-") && entry.severity !== "none")
    .map(([id]) => id)
    .filter(id => !fired.has(id));
  assert.deepEqual(unproved, []);
});

test("a clean project raises nothing and is already formatted", { skip: !isRunnable }, () => {
  const { directory } = materialize({ fixture: "ok" });
  assert.deepEqual(
    buildFindings({
      directory,
      project: "Ok.csproj"
    }),
    []
  );
  const verify = formatRun({
    directory,
    project: "Ok.csproj",
    isFix: false
  });
  assert.equal(verify.status, 0, verify.stdout + verify.stderr);
});

test("a repo's local file switches a rule off", { skip: !isRunnable }, () => {
  const { directory, problems } = materialize({
    fixture: "flag",
    local: {
      diagnostics: {
        CA1031: {
          severity: "none",
          reason: "the fixture proves a local exemption"
        }
      }
    }
  });
  assert.deepEqual(problems, []);
  const fired = idsOf(
    buildFindings({
      directory,
      project: "Flag.csproj"
    })
  );
  assert.equal(fired.has("CA1031"), false);
  assert.equal(fired.has("CA2201"), true);
});

test(
  "the fixer is stable, and it never deletes a member or a parameter the markup may bind",
  { skip: !isRunnable },
  () => {
    const { directory } = materialize({ fixture: "fix" });
    const before = readFileSync(join(directory, "Program.cs"), "utf8");
    const failing = formatRun({
      directory,
      project: "Fix.csproj",
      isFix: false
    });
    assert.notEqual(failing.status, 0);
    const fixed = formatRun({
      directory,
      project: "Fix.csproj",
      isFix: true
    });
    assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
    const after = readFileSync(join(directory, "Program.cs"), "utf8");
    assert.notEqual(after, before);
    assert.match(after, /private static int Main/);
    assert.doesNotMatch(after, /using System\.Collections\.Generic;/);
    assert.match(after, /BoundByMarkup\(object sender, EventArgs e\)/);
    const again = formatRun({
      directory,
      project: "Fix.csproj",
      isFix: true
    });
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.equal(readFileSync(join(directory, "Program.cs"), "utf8"), after);
    const verify = formatRun({
      directory,
      project: "Fix.csproj",
      isFix: false
    });
    assert.equal(verify.status, 0, verify.stdout + verify.stderr);
  }
);
