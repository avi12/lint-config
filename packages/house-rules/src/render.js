import { readFileSync } from "node:fs";

export const LANGUAGES = ["rust", "cpp", "csharp", "kotlin"];
export const START_MARKER = "<!-- matrix:start -->";
export const END_MARKER = "<!-- matrix:end -->";
const RULES_URL = new URL("../rules.json", import.meta.url);

/**
 * Reads the parity matrix, the single source of truth that the docs, the
 * packages and the tests all derive from.
 */
export function readRules() {
  return JSON.parse(readFileSync(RULES_URL, "utf8"));
}

function renderCell([status, rule]) {
  if (status === "na") {
    return `n/a: ${rule}`;
  }

  if (status === "gap") {
    return `**gap**: ${rule}`;
  }

  if (status === "variant") {
    return `~ ${rule}`;
  }

  return rule;
}

/**
 * Counts the cells of each status per language.
 */
export function summarize(rules) {
  const counts = {};
  for (const language of LANGUAGES) {
    counts[language] = {
      map: 0,
      variant: 0,
      gap: 0,
      na: 0
    };
    for (const row of rules.rules) {
      counts[language][row[language][0]] += 1;
    }
  }

  return counts;
}

/**
 * Renders the matrix and its per-language summary as Markdown tables.
 */
export function renderMatrix(rules) {
  const counts = summarize(rules);
  const summary = [
    "| Status | Rust | C++ | C# | Kotlin |",
    "|---|---|---|---|---|",
    ...Object.keys(rules.statuses).map(
      status =>
        `| ${status}: ${rules.statuses[status]} | ${LANGUAGES.map(language => counts[language][status]).join(" | ")} |`
    )
  ];
  const rows = rules.rules.map(row => {
    const cells = LANGUAGES.map(language => renderCell(row[language]));
    return `| ${row.id} | ${row.intent} | ${row.ts.map(id => `\`${id}\``).join(", ")} | ${cells.join(" | ")} |`;
  });
  return [
    ...summary,
    "",
    "| Rule | Intent | TypeScript | Rust | C++ | C# | Kotlin |",
    "|---|---|---|---|---|---|---|",
    ...rows
  ].join("\n");
}

/**
 * Replaces the text between the matrix markers of a Markdown document.
 */
export function injectMatrix({ markdown, table }) {
  const start = markdown.indexOf(START_MARKER);
  const end = markdown.indexOf(END_MARKER);
  const hasMarkers = start !== -1 && end > start;
  if (!hasMarkers) {
    throw new Error(`the document needs ${START_MARKER} and ${END_MARKER}`);
  }

  return `${markdown.slice(0, start + START_MARKER.length)}\n\n${table}\n\n${markdown.slice(end)}`;
}
