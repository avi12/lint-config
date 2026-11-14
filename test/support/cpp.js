import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { planCppConfig } from "avi12-lint/cpp-config";
import { locateLlvmTools } from "avi12-lint/cpp-tools";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PRESET = join(ROOT, "packages", "cpp-config");
const MAX_BUFFER = 64 * 1024 * 1024;
const FINDING = /^(.+?):(\d+):\d+: (?:error|warning): .*\[([a-z0-9.,-]+?)(?:,-warnings-as-errors)?\]$/;

export const FIXTURES = join(PRESET, "fixtures");
export const CLI = join(ROOT, "packages", "avi12-lint", "bin", "avi12-lint.js");
export const PRESET_DIRECTORY = PRESET;
export const TOOLS = locateLlvmTools(process.env);

export function presetJson() {
  return {
    format: JSON.parse(readFileSync(join(PRESET, "format.json"), "utf8")),
    tidy: JSON.parse(readFileSync(join(PRESET, "tidy.json"), "utf8"))
  };
}

/** The default local file of a fixture: its sources and a flat compile database for a plain C++17 build. */
export const FIXTURE_LOCAL = {
  sources: {
    include: ["^src/"]
  },
  database: {
    flat: {
      standard: "17"
    }
  },
  tidy: {
    headerFilterRegex: "src[/\\\\].*\\.h$",
    options: {
      "readability-function-cognitive-complexity.Threshold": "6"
    }
  }
};

function git({ directory, args }) {
  return spawnSync("git", args, {
    cwd: directory,
    encoding: "utf8"
  });
}

/** Copies a fixture into a fresh git repo in a temp folder and writes the generated config; returns the folder. */
export function materialize({ fixture, local = FIXTURE_LOCAL }) {
  const directory = mkdtempSync(join(tmpdir(), `avi12-cpp-${fixture}-`));
  cpSync(join(FIXTURES, fixture), directory, { recursive: true });
  writeFileSync(join(directory, "avi12-cpp.local.json"), JSON.stringify(local, null, 2));
  const { files, problems } = planCppConfig({
    preset: presetJson(),
    local
  });
  for (const [name, text] of files) {
    writeFileSync(join(directory, name), text);
  }

  git({
    directory,
    args: ["init", "-q"]
  });
  git({
    directory,
    args: ["add", "-A"]
  });
  return {
    directory,
    problems
  };
}

/** Runs the CLI in a folder with the local preset; returns `{ status, output }`. */
export function runCli({ directory, args = [], env = {} }) {
  const run = spawnSync(process.execPath, [CLI, "--only=cpp", ...args], {
    cwd: directory,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
    env: {
      ...process.env,
      AVI12_LINT_CPP_PRESET: PRESET,
      ...env
    }
  });
  return {
    status: run.status,
    output: `${run.stdout}${run.stderr}`
  };
}

/** The `check@file:line` of every clang-tidy finding in the output, sorted and de-duplicated. */
export function findingsOf(output) {
  const found = output
    .split(/\r?\n/)
    .map(line => FINDING.exec(line))
    .filter(Boolean)
    .flatMap(([, file, line, checks]) =>
      checks.split(",").map(check => `${check}@${file.replaceAll("\\", "/").split("/").pop()}:${line}`)
    );
  return [...new Set(found)].sort();
}
