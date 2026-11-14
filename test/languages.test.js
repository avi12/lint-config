import assert from "node:assert/strict";
import { test } from "node:test";

import { detectLanguages, ignoredGlobs, isIgnoredPath } from "avi12-lint/languages";
import { languageNotices, plan } from "avi12-lint/plan";
import { findingsOf, isTextChecked, parseExemptions, TEXT_RULES, withoutExempted } from "avi12-lint/text-check";

const AST_GREP = "node_modules/.bin/ast-grep";
const PACK = "node_modules/ast-grep-rules-avi12";

function installed(languages) {
  return new Set([AST_GREP, ...languages.map(language => `${PACK}/${language}/sgconfig.yml`)]);
}

test("languages are detected by their marker files", () => {
  const markers = new Set(["Cargo.toml", "*.csproj", ".clang-tidy"]);
  assert.deepEqual(
    detectLanguages(marker => markers.has(marker)),
    ["rust", "cpp", "csharp"]
  );
  assert.deepEqual(
    detectLanguages(() => false),
    []
  );
  assert.deepEqual(
    detectLanguages(marker => marker === "build.gradle.kts"),
    ["kotlin"]
  );
});

test("build, dependency and vendored folders are ignored", () => {
  for (const file of ["target/debug/a.rs", "app/obj/x.cs", "lib/bin/y.cs", "vendor/z.cpp", "a/build/b.kt"]) {
    assert.ok(isIgnoredPath(file), file);
  }

  for (const file of ["src/a.rs", "binary.rs", "src/target.rs"]) {
    assert.ok(!isIgnoredPath(file), file);
  }

  assert.ok(ignoredGlobs().includes("!**/target/**"));
});

test("a language with its pack gets one ast-grep step; the project walk excludes build folders", () => {
  const steps = plan({
    hasFile: file => installed(["rust", "kotlin"]).has(file),
    languages: ["rust", "kotlin"]
  });
  assert.deepEqual(
    steps.map(({ name }) => name),
    ["ast-grep rust", "ast-grep kotlin", "text-check"]
  );
  const [rust] = steps;
  assert.deepEqual(rust.command.slice(0, 4), ["ast-grep", "scan", "-c", `${PACK}/rust/sgconfig.yml`]);
  assert.ok(rust.command.includes('"!**/target/**"') && rust.command.at(-1) === ".");
  assert.ok(steps.every(step => step.isGuarded));
});

test("changed files narrow each language and skip a language with none", () => {
  const steps = plan({
    hasFile: file => installed(["rust", "csharp"]).has(file),
    languages: ["rust", "csharp"],
    changedFiles: ["src/a.rs", "target/gen.rs", "src/b.ts", "README.md"]
  });
  assert.deepEqual(
    steps.map(({ name }) => name),
    ["ast-grep rust", "text-check"]
  );
  assert.deepEqual(steps[0].split.files, ["src/a.rs"]);
  assert.deepEqual(steps[1].split.files, ["src/a.rs", "src/b.ts", "README.md"]);
});

test("a changed set with nothing to check plans no language step", () => {
  const steps = plan({
    hasFile: file => installed(["rust"]).has(file),
    languages: ["rust"],
    changedFiles: ["package.json"]
  });
  assert.deepEqual(steps, []);
});

test("no language, no language step (a TypeScript repo is unchanged)", () => {
  assert.deepEqual(plan({ hasFile: file => installed(["rust"]).has(file) }), []);
});

test("a missing ast-grep or pack is reported, not silently skipped", () => {
  const none = languageNotices({
    hasFile: () => false,
    languages: ["rust"]
  });
  assert.equal(none.length, 1);
  assert.match(none[0], /ast-grep is not installed/);
  const noPack = languageNotices({
    hasFile: file => file === AST_GREP,
    languages: ["cpp"]
  });
  assert.match(noPack[0], /ast-grep-rules-avi12 is not installed, so the cpp rules/);
  assert.deepEqual(
    languageNotices({
      hasFile: file => installed(["rust"]).has(file),
      languages: ["rust"]
    }),
    []
  );
  assert.deepEqual(
    languageNotices({
      hasFile: () => false,
      languages: []
    }),
    []
  );
});

const SUPPRESSED = {
  "a.rs": "#[allow(dead_code)]",
  "a.cpp": "int x;  // NOLINT(readability-identifier-length)",
  "b.cpp": '#pragma clang diagnostic ignored "-Wfoo"',
  "a.cs": "#pragma warning disable CS1591",
  "b.cs": '[SuppressMessage("Style", "IDE0011")]',
  "a.kt": '@Suppress("UNCHECKED_CAST")',
  "b.kt": '@file:Suppress("unused")',
  "a.ts": "// eslint-disable-next-line no-console"
};

test("every suppress syntax is flagged in its own language", () => {
  for (const [file, text] of Object.entries(SUPPRESSED)) {
    const rules = findingsOf({
      file,
      text
    }).map(({ rule }) => rule);
    assert.deepEqual(rules, [TEXT_RULES.SUPPRESS], file);
  }
});

test("clean code and another language's syntax are not flagged", () => {
  assert.deepEqual(
    findingsOf({
      file: "a.rs",
      text: "fn main() { let allow = 1; }"
    }),
    []
  );
  assert.deepEqual(
    findingsOf({
      file: "a.rs",
      text: "// NOLINT"
    }),
    []
  );
  assert.deepEqual(
    findingsOf({
      file: "a.kt",
      text: "val suppressed = 1"
    }),
    []
  );
});

test("an em dash is flagged with its line, in code and in Markdown", () => {
  const found = findingsOf({
    file: "README.md",
    text: "fine\nbad — here"
  });
  assert.deepEqual(
    found.map(({ line, rule }) => [line, rule]),
    [[2, TEXT_RULES.EM_DASH]]
  );
  assert.ok(isTextChecked("README.md") && isTextChecked("src/a.cs") && !isTextChecked("src/a.png"));
  assert.ok(!isTextChecked("target/a.rs"));
});

test("an exemption needs files, known rules and a reason, and silences exactly what it names", () => {
  const exemption = {
    files: ["legacy/**"],
    rules: [TEXT_RULES.SUPPRESS],
    reason: "vendored code we do not edit"
  };
  const [parsed] = parseExemptions({
    textCheck: {
      exemptions: [exemption]
    }
  });
  const findings = [
    {
      file: "legacy/a.rs",
      rule: TEXT_RULES.SUPPRESS
    },
    {
      file: "legacy/a.rs",
      rule: TEXT_RULES.EM_DASH
    },
    {
      file: "src/a.rs",
      rule: TEXT_RULES.SUPPRESS
    }
  ];
  assert.deepEqual(
    withoutExempted({
      findings,
      exemptions: [parsed]
    }),
    findings.slice(1)
  );
  assert.throws(
    () =>
      parseExemptions({
        textCheck: {
          exemptions: [
            {
              ...exemption,
              reason: ""
            }
          ]
        }
      }),
    /reason/
  );
  assert.throws(
    () =>
      parseExemptions({
        textCheck: {
          exemptions: [
            {
              ...exemption,
              rules: ["nope"]
            }
          ]
        }
      }),
    /unknown rule/
  );
  assert.throws(
    () =>
      parseExemptions({
        textCheck: {
          exemptions: [
            {
              ...exemption,
              files: []
            }
          ]
        }
      }),
    /files/
  );
  assert.deepEqual(parseExemptions({}), []);
});
