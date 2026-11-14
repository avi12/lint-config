import path from "node:path";

import { isIgnoredPath } from "./languages.js";

const MIN_REASON_LENGTH = 10;
const EM_DASH_CODE_POINT = 8212;
const EM_DASH = String.fromCodePoint(EM_DASH_CODE_POINT);
const SCRIPT_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mjs", "cjs", "svelte", "vue", "css", "scss"];
const EXTENSIONS = {
  rust: ["rs"],
  cpp: ["cpp", "cc", "cxx", "hpp", "hh", "hxx", "ipp", "h"],
  csharp: ["cs"],
  kotlin: ["kt", "kts"],
  script: SCRIPT_EXTENSIONS
};
const DOCUMENT_EXTENSIONS = ["md"];

/** The rule ids of the text check, as an exemption names them. */
export const TEXT_RULES = {
  SUPPRESS: "no-suppress-comment",
  EM_DASH: "no-em-dash"
};

const SUPPRESSIONS = [
  {
    language: "rust",
    pattern: /#!?\[\s*allow\s*\(/
  },
  {
    language: "cpp",
    pattern: /\bNOLINT(?:NEXTLINE|BEGIN|END)?\b/
  },
  {
    language: "cpp",
    pattern: /#pragma\s+(?:clang|GCC)\s+diagnostic\s+ignored/
  },
  {
    language: "cpp",
    pattern: /#pragma\s+warning\s*\(\s*(?:disable|suppress)/
  },
  {
    language: "csharp",
    pattern: /#pragma\s+warning\s+disable/
  },
  {
    language: "csharp",
    pattern: /#nullable\s+disable/
  },
  {
    language: "csharp",
    pattern: /\[\s*(?:assembly:|module:)?\s*(?:[\w.]+\.)?SuppressMessage\b/
  },
  {
    language: "kotlin",
    pattern: /@(?:file:)?Suppress(?:Warnings)?\b/
  },
  {
    language: "kotlin",
    pattern: /ktlint[-:]disable/
  },
  {
    language: "script",
    pattern: /\b(?:eslint|oxlint|stylelint)-disable|@ts-(?:ignore|nocheck)|biome-ignore/
  }
];

const SUPPRESS_MESSAGE =
  "house rule no-suppression: remove the suppress comment; an exemption goes in the config with a reason";
const EM_DASH_MESSAGE = "house rule no-em-dash: use a hyphen";

function extensionOf(file) {
  return path.extname(file).slice(1).toLowerCase();
}

function languagesOf(file) {
  const extension = extensionOf(file);
  return Object.entries(EXTENSIONS)
    .filter(([, extensions]) => extensions.includes(extension))
    .map(([language]) => language);
}

/** Whether the text check reads this file: a source file of a covered language, or Markdown, outside build folders. */
export function isTextChecked(file) {
  const isKnown = languagesOf(file).length > 0 || DOCUMENT_EXTENSIONS.includes(extensionOf(file));
  return isKnown && !isIgnoredPath(file);
}

/**
 * The findings of one file as `{ file, line, rule, message }`: a suppress comment, attribute or pragma of the file's
 * language, and an em dash in any checked file. Pure.
 */
export function findingsOf({ file, text }) {
  const languages = languagesOf(file);
  const patterns = SUPPRESSIONS.filter(item => languages.includes(item.language)).map(item => item.pattern);
  const findings = [];
  for (const [index, content] of text.split("\n").entries()) {
    const isSuppressed = patterns.some(pattern => pattern.test(content));
    if (isSuppressed) {
      findings.push({
        file,
        line: index + 1,
        rule: TEXT_RULES.SUPPRESS,
        message: SUPPRESS_MESSAGE
      });
    }

    if (content.includes(EM_DASH)) {
      findings.push({
        file,
        line: index + 1,
        rule: TEXT_RULES.EM_DASH,
        message: EM_DASH_MESSAGE
      });
    }
  }

  return findings;
}

function assertStrings({ value, name }) {
  const isValid = Array.isArray(value) && value.length > 0 && value.every(item => typeof item === "string");
  if (!isValid) {
    throw new Error(`avi12-lint.config.json: ${name} must be a non-empty array of strings`);
  }
}

/**
 * Validates the exemptions of `avi12-lint.config.json` (`textCheck.exemptions`): each names `files` (globs), `rules`
 * (ids of `TEXT_RULES`) and a `reason` of at least 10 characters, so an exemption always says why. Throws on the
 * first invalid one; returns the list.
 */
export function parseExemptions(config) {
  const exemptions = config?.textCheck?.exemptions ?? [];
  const known = new Set(Object.values(TEXT_RULES));
  for (const [index, exemption] of exemptions.entries()) {
    assertStrings({
      value: exemption.files,
      name: `exemptions[${index}].files`
    });
    assertStrings({
      value: exemption.rules,
      name: `exemptions[${index}].rules`
    });
    const unknown = exemption.rules.filter(rule => !known.has(rule));
    if (unknown.length > 0) {
      throw new Error(`avi12-lint.config.json: exemptions[${index}] names unknown rule ${unknown.join(", ")}`);
    }

    const reason = exemption.reason;
    const hasReason = typeof reason === "string" && reason.trim().length >= MIN_REASON_LENGTH;
    if (!hasReason) {
      throw new Error(
        `avi12-lint.config.json: exemptions[${index}] needs a reason of at least ${MIN_REASON_LENGTH} characters`
      );
    }
  }

  return exemptions;
}

/** Drops the findings an exemption covers (its glob matches the file and it names the rule). */
export function withoutExempted({ findings, exemptions }) {
  return findings.filter(
    finding =>
      !exemptions.some(
        exemption =>
          exemption.rules.includes(finding.rule) && exemption.files.some(glob => path.matchesGlob(finding.file, glob))
      )
  );
}
