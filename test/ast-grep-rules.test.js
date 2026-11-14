import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { readRules } from "house-rules-avi12/render";

import { astGrepFindings, PACK } from "./support/ast-grep.js";

const FLAG_MARKER = "// flag";
const LANGUAGES = ["rust", "cpp", "csharp", "kotlin"];

function fixtures(language) {
  const directory = path.join(PACK, language, "fixtures");
  return readdirSync(directory).map(name => ({
    name,
    rule: name.slice(0, name.lastIndexOf(".")),
    file: `fixtures/${name}`,
    lines: readFileSync(path.join(directory, name), "utf8").split("\n")
  }));
}

for (const language of LANGUAGES) {
  test(`${language}: every fixture flags exactly the lines marked and no other`, () => {
    const found = fixtures(language);
    assert.ok(found.length > 0, `${language} has no fixtures`);
    const findings = astGrepFindings({ language, files: found.map(({ file }) => file) });
    const mismatches = [];
    for (const { file, rule, lines } of found) {
      const expected = lines.flatMap((line, index) => (line.includes(FLAG_MARKER) ? [index + 1] : []));
      const actual = findings.filter(item => item.file === file && item.rule === rule).map(item => item.line);
      const flagged = [...new Set(actual)].sort((one, two) => one - two);
      const isMatching = expected.length > 0 && flagged.join() === expected.join();
      if (!isMatching) {
        mismatches.push(`${file}: expected ${expected.join()} got ${flagged.join()}`);
      }
    }

    assert.deepEqual(mismatches, []);
  });
}

const AST_GREP_CELL = /ast-grep ((?:house-[a-z-]+(?:, )?)+)/;
const RULES = readRules();

function ruleFiles(language) {
  const directory = path.join(PACK, language, "rules");
  return readdirSync(directory).map(name => ({
    id: name.slice(0, name.lastIndexOf(".")),
    text: readFileSync(path.join(directory, name), "utf8")
  }));
}

function field({ text, key }) {
  const match = new RegExp(`^${key}: (.*)$`, "m").exec(text);
  return match?.[1]?.replace(/^"|"$/g, "");
}

function matrixIds(language) {
  return new Set(
    RULES.rules.flatMap(row => {
      const match = AST_GREP_CELL.exec(row[language][1]);
      return match?.[1] ? (match[1].match(/house-[a-z-]*[a-z]/g) ?? []) : [];
    })
  );
}

test("the rule files and the ast-grep ids the matrix names are the same set, per language", () => {
  for (const language of LANGUAGES) {
    const files = ruleFiles(language).map(({ id }) => id);
    assert.deepEqual(files.sort(), [...matrixIds(language)].sort(), language);
  }
});

test("every rule has its file name as id, its language, severity error and a message naming a matrix row", () => {
  const rowIds = new Set(RULES.rules.map(row => row.id));
  for (const language of LANGUAGES) {
    for (const { id, text } of ruleFiles(language)) {
      assert.equal(field({ text, key: "id" }), id, `${language}/${id}: id`);
      assert.equal(field({ text, key: "language" }), language, `${language}/${id}: language`);
      assert.equal(field({ text, key: "severity" }), "error", `${language}/${id}: severity`);
      const row = /^house rule ([a-z-]+): /.exec(field({ text, key: "message" }) ?? "")?.[1];
      assert.ok(rowIds.has(row), `${language}/${id}: the message names a row of rules.json`);
    }
  }
});

test("a rule shared by languages says the same thing in each", () => {
  const byId = new Map();
  for (const language of LANGUAGES) {
    for (const { id, text } of ruleFiles(language)) {
      const entry = byId.get(id) ?? [];
      entry.push({ message: field({ text, key: "message" }), regex: /regex: '([^']{100,})'/.exec(text)?.[1] });
      byId.set(id, entry);
    }
  }

  for (const [id, entries] of byId) {
    const messages = new Set(entries.map(({ message }) => message));
    const regexes = new Set(entries.map(({ regex }) => regex).filter(Boolean));
    assert.ok(messages.size === 1 || id.startsWith("house-no-") || id === "house-null-forgiving", `${id}: messages differ`);
    assert.ok(regexes.size <= 1, `${id}: the deny-list differs between languages`);
  }
});

test("an exemption (ignores or files) in a rule carries a note saying why", () => {
  for (const language of LANGUAGES) {
    for (const { id, text } of ruleFiles(language)) {
      const hasExemption = /^(ignores|files):/m.test(text);
      const note = field({ text, key: "note" });
      assert.ok(!hasExemption || (note?.length ?? 0) > 10, `${language}/${id}: ignores or files needs a note`);
    }
  }
});
