import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAX_BUFFER = 64 * 1024 * 1024;
const BINARIES = {
  eslint: join(ROOT, "node_modules", "eslint", "bin", "eslint.js"),
  oxlint: join(ROOT, "node_modules", "oxlint", "bin", "oxlint")
};

export const FIXTURES = join(ROOT, "test", "fixtures");
export const TS_ONLY = join(FIXTURES, "ts-only");
export const TS_SVELTE = join(FIXTURES, "ts-svelte");

function run({ tool, args, cwd }) {
  const { stdout } = spawnSync(process.execPath, [BINARIES[tool], ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
    env: {
      ...process.env,
      NO_COLOR: "",
      FORCE_COLOR: "0"
    }
  });
  return stdout;
}

/** ESLint findings as `ruleId@line`, always at concurrency 1. */
export function eslintFindings({ cwd, files }) {
  const out = run({
    tool: "eslint",
    args: ["--concurrency", "1", "-f", "json", ...files],
    cwd
  });
  const results = JSON.parse(out.slice(out.indexOf("[")));
  return results.flatMap(({ messages }) => messages.map(({ ruleId, line }) => `${ruleId}@${line}`));
}

/** oxlint findings as `rule@line`, parsed from the JSON formatter. */
export function oxlintFindings({ cwd, files }) {
  const out = run({
    tool: "oxlint",
    args: ["-f", "json", ...files],
    cwd
  });
  const { diagnostics } = JSON.parse(out.slice(out.indexOf("{")));
  return diagnostics.map(({ code, labels }) => `${code}@${labels[0]?.span.line ?? 0}`);
}

export function eslintFix({ cwd, files }) {
  run({
    tool: "eslint",
    args: ["--concurrency", "1", "--fix", ...files],
    cwd
  });
}

export function oxlintFix({ cwd, files }) {
  run({
    tool: "oxlint",
    args: ["--fix", ...files],
    cwd
  });
}

/** The rules ESLint has switched on for a file, mapped to their JSON options. */
export function eslintRules({ cwd, file }) {
  const config = JSON.parse(
    run({
      tool: "eslint",
      args: ["--print-config", file],
      cwd
    })
  );
  const rules = new Map();
  for (const [name, value] of Object.entries(config.rules)) {
    const [severity, ...options] = Array.isArray(value) ? value : [value];
    const isOn = [1, 2, "warn", "error"].includes(severity);
    if (isOn) {
      rules.set(name, JSON.stringify(options));
    }
  }
  return rules;
}

function collectOxlintRules({ configPath, rules }) {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  for (const parent of config.extends ?? []) {
    collectOxlintRules({
      configPath: resolve(dirname(configPath), parent),
      rules
    });
  }
  for (const [name, value] of Object.entries(config.rules ?? {})) {
    const [severity, ...options] = Array.isArray(value) ? value : [value];
    const isOn = ["deny", "warn", "error"].includes(severity);
    if (isOn) {
      rules.set(name, JSON.stringify(options));
    } else {
      rules.delete(name);
    }
  }
  return rules;
}

/** The rules oxlint has switched on after following a directory's `extends` chain, mapped to their JSON options. */
export function oxlintRules({ cwd }) {
  return collectOxlintRules({
    configPath: join(cwd, ".oxlintrc.json"),
    rules: new Map()
  });
}

/** naming/convention findings for one TypeScript source under the given rule options. */
export function namingFindings({ options, source }) {
  const directory = mkdtempSync(join(tmpdir(), "naming-"));
  try {
    const config = {
      extends: [join(TS_ONLY, "node_modules", "oxlint-plugin-naming", "preset.json")],
      rules: {
         "naming/convention": ["error", options] 
      }
    };
    writeFileSync(join(directory, ".oxlintrc.json"), JSON.stringify(config));
    writeFileSync(join(directory, "sample.ts"), source);
    return oxlintFindings({
      cwd: directory,
      files: ["sample.ts"]
    });
  } finally {
    rmSync(directory, {
      recursive: true,
      force: true
    });
  }
}
