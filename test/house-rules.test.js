import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { injectMatrix, LANGUAGES, readRules, renderMatrix } from "house-rules-avi12/render";
import { extractIds, readToolIds } from "house-rules-avi12/tool-ids";

const ROOT = new URL("../packages/", import.meta.url);
const DOCUMENT = new URL("../docs/non-ts-languages.md", import.meta.url);
const VIRTUAL_PREFIX = "doc:";
const rules = readRules();

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, ROOT), "utf8"));
}

function knownTypeScriptRules() {
  const configs = [readJson("oxlint-config/oxlint.json"), readJson("oxlint-config/library.json")];
  const overrides = configs.flatMap(config => config.overrides ?? []);
  const ids = [...configs, ...overrides].flatMap(config => Object.keys(config.rules ?? {}));
  return new Set([...ids, ...Object.keys(readJson("oxlint-plugin-naming/preset.json").rules)]);
}

test("every row has a unique id, an intent and a typed cell per language", () => {
  const ids = new Set();
  for (const row of rules.rules) {
    assert.ok(!ids.has(row.id), `duplicate row ${row.id}`);
    ids.add(row.id);
    assert.ok(row.intent.length > 0, `${row.id} needs an intent`);
    assert.ok(row.ts.length > 0, `${row.id} needs a TypeScript rule`);
    for (const language of LANGUAGES) {
      const [status, rule] = row[language];
      assert.ok(status in rules.statuses, `${row.id}/${language}: unknown status ${status}`);
      assert.ok(rule.length > 0, `${row.id}/${language} needs a rule or a reason`);
    }
  }
});

test("every TypeScript rule a row names exists in the TypeScript presets", () => {
  const known = knownTypeScriptRules();
  for (const row of rules.rules) {
    for (const id of row.ts) {
      const isExisting = id.startsWith(VIRTUAL_PREFIX) || known.has(id);
      assert.ok(isExisting, `${row.id}: ${id} is not a rule of oxlint-config or the naming plugin`);
    }
  }
});

test("every gap names the engine that will implement it", () => {
  const engines = ["ast-grep", "avi12-lint", "review only", "none free"];
  for (const row of rules.rules) {
    for (const language of LANGUAGES) {
      const [status, rule] = row[language];
      const isGapWithoutEngine = status === "gap" && !engines.some(engine => rule.includes(engine));
      assert.ok(!isGapWithoutEngine, `${row.id}/${language}: a gap names its engine`);
    }
  }
});

test("docs/non-ts-languages.md carries the matrix exactly as rules.json renders it", () => {
  const markdown = readFileSync(DOCUMENT, "utf8");
  const expected = injectMatrix({
    markdown,
    table: renderMatrix(rules)
  });
  assert.equal(markdown, expected, "run: node packages/house-rules/src/write-docs.js");
});

test("every tool rule id a cell names is in the committed id list of that tool", () => {
  const lists = new Map();
  const missing = [];
  for (const row of rules.rules) {
    for (const language of LANGUAGES) {
      const [, text] = row[language];
      for (const [tool, id] of extractIds({ language, text })) {
        if (!lists.has(tool)) {
          lists.set(tool, readToolIds(tool));
        }

        if (!lists.get(tool).has(id)) {
          missing.push(`${row.id}/${language}: ${tool} ${id}`);
        }
      }
    }
  }

  assert.deepEqual(missing, []);
});

test("every id list is committed and the cells name at least one id per language", () => {
  for (const tool of ["clippy", "rustc", "clang-tidy", "roslyn", "detekt", "ktlint"]) {
    assert.ok(readToolIds(tool).size > 50, `${tool} list is empty; run pnpm ids:refresh`);
  }

  for (const language of LANGUAGES) {
    const count = rules.rules.flatMap(row => extractIds({ language, text: row[language][1] })).length;
    assert.ok(count > 5, `${language}: the id extractor found ${count} ids`);
  }
});
