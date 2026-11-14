import { readFileSync } from "node:fs";

const TOOL_IDS_URL = new URL("../tool-ids/", import.meta.url);
const CLANG_TIDY_PATTERN =
  /\b(?:abseil|bugprone|cert|cppcoreguidelines|google|hicpp|misc|modernize|performance|readability)-[a-z0-9-]*[a-z0-9]/g;
const ROSLYN_PATTERN = /\b(?:CA|IDE|RCS|MA|SA|RS|CS)\d{4}\b|\bS\d{3,4}\b/g;
const RUST_PATTERN = /\b(clippy|rustc) ((?:[a-z_]+(?:, )?)+)/g;
const KOTLIN_PATTERN = /\b(detekt|ktlint) ((?:[A-Za-z-]+(?:, )?)+)/g;

/**
 * Reads one committed id list (`clippy`, `rustc`, `clang-tidy`, `roslyn`, `detekt` or `ktlint`) written by
 * `pnpm ids:refresh`, ignoring its `#` provenance line.
 */
export function readToolIds(tool) {
  const text = readFileSync(new URL(`${tool}.txt`, TOOL_IDS_URL), "utf8");
  return new Set(text.split("\n").filter(line => line !== "" && !line.startsWith("#")));
}

function listIds({ text, pattern }) {
  return [...text.matchAll(pattern)].flatMap(match => (match[2] ?? "").split(", ").map(id => [match[1], id]));
}

/**
 * The tool rule ids a matrix cell names, as `[tool, id]` pairs, found by the shape of each tool's own ids:
 * `clippy` and `rustc` lints after the tool name, clang-tidy check names, Roslyn diagnostic ids, and detekt rules and
 * ktlint rules after the tool name. A cell that names an id this cannot see is a reviewer's to catch, a cell that
 * names one no tool has fails the test.
 */
export function extractIds({ language, text }) {
  if (language === "rust") {
    return listIds({
      text,
      pattern: RUST_PATTERN
    });
  }

  if (language === "kotlin") {
    return listIds({
      text,
      pattern: KOTLIN_PATTERN
    });
  }

  if (language === "cpp") {
    return (text.match(CLANG_TIDY_PATTERN) ?? []).map(id => ["clang-tidy", id]);
  }

  return (text.match(ROSLYN_PATTERN) ?? []).map(id => ["roslyn", id]);
}
