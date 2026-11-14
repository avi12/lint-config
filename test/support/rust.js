import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { planRustConfig } from "avi12-lint/rust-config";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PRESET = join(ROOT, "packages", "rust-config");
const MAX_BUFFER = 256 * 1024 * 1024;
const TARGET_DIRECTORY = join(tmpdir(), "avi12-lint-rust-fixture-target");
const PRESET_FILES = {
  lints: "lints.toml",
  clippy: "clippy.toml",
  rustfmt: "rustfmt.toml",
  deny: "deny.toml"
};

export const FIXTURES = join(PRESET, "fixtures");

/** Whether a cargo subcommand (`clippy`, `fmt`, `machete`, `deny`) can run here. */
export function hasCargoTool(subcommand) {
  const probe = spawnSync("cargo", [subcommand, "--version"], { encoding: "utf8" });
  return !probe.error && probe.status === 0;
}

export function presetTexts() {
  return Object.fromEntries(
    Object.entries(PRESET_FILES).map(([name, file]) => [name, readFileSync(join(PRESET, file), "utf8")])
  );
}

/** Copies a fixture into a fresh temp folder and writes the generated config into it; returns the folder. */
export function materialize({ fixture, local }) {
  const directory = mkdtempSync(join(tmpdir(), `avi12-rust-${fixture}-`));
  cpSync(join(FIXTURES, fixture), directory, { recursive: true });
  const manifest = readFileSync(join(directory, "Cargo.toml"), "utf8");
  const { files, problems } = planRustConfig({
    preset: presetTexts(),
    manifests: [
      {
        path: "Cargo.toml",
        text: manifest
      }
    ],
    locals: new Map(local ? [[".", local]] : [])
  });
  for (const [file, text] of files) {
    mkdirSync(dirname(join(directory, file)), { recursive: true });
    writeFileSync(join(directory, file), text);
  }

  return {
    directory,
    problems
  };
}

/** The lint ids clippy raises in a materialized fixture, as `id@line` strings, sorted. */
export function clippyFindings(directory) {
  const { stdout } = spawnSync(
    "cargo",
    ["clippy", "--message-format", "json", "--all-targets", "--all-features", "--", "-D", "warnings"],
    {
      cwd: directory,
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
      env: {
        ...process.env,
        CARGO_TARGET_DIR: TARGET_DIRECTORY,
        CLIPPY_CONF_DIR: directory,
        CARGO_BUILD_JOBS: "2"
      }
    }
  );
  const found = new Set();
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("{")) {
      continue;
    }

    const { reason, message } = JSON.parse(line);
    const code = message?.code?.code;
    if (reason !== "compiler-message" || !code) {
      continue;
    }

    const span = message.spans.find(item => item.is_primary);
    const file = span.file_name.replaceAll("\\", "/");
    found.add(`${code}@${file}:${span.line_start}`);
  }

  return [...found].sort();
}
