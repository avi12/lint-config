import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { csharpSteps, parseDotnetMajor } from "avi12-lint/csharp";
import { csharpPreset, planCsharpConfig } from "avi12-lint/csharp-config";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAX_BUFFER = 256 * 1024 * 1024;
const MINIMUM_MAJOR = 8;
const FINDING = /(?<file>[^\s(]+)\((?<line>\d+),\d+\): (?:error|warning) (?<id>[A-Za-z]+\d+)/g;
const ARTIFACTS = join(tmpdir(), "avi12-lint-csharp-fixture-artifacts");

export const PRESET = join(ROOT, "packages", "csharp-config");
export const FIXTURES = join(PRESET, "fixtures");

/** Whether a .NET SDK new enough for dotnet format and --artifacts-path is installed. */
export function hasDotnet() {
  const probe = spawnSync("dotnet", ["--version"], { encoding: "utf8" });
  const major = probe.error || probe.status !== 0 ? undefined : parseDotnetMajor(probe.stdout);
  return major !== undefined && major >= MINIMUM_MAJOR;
}

export function loadPreset() {
  return csharpPreset(file => JSON.parse(readFileSync(join(PRESET, file), "utf8")));
}

/** Copies a fixture into a fresh temp folder and writes the generated config into it; returns the folder. */
export function materialize({ fixture, local = {} }) {
  const directory = mkdtempSync(join(tmpdir(), `avi12-csharp-${fixture}-`));
  cpSync(join(FIXTURES, fixture), directory, { recursive: true });
  const { files, problems } = planCsharpConfig({
    preset: loadPreset(),
    local
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

function dotnet({ directory, args }) {
  return spawnSync("dotnet", args, {
    cwd: directory,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
    env: {
      ...process.env,
      DOTNET_CLI_TELEMETRY_OPTOUT: "1",
      DOTNET_NOLOGO: "1",
      MSBUILDDISABLENODEREUSE: "1"
    }
  });
}

/** The command the runner builds with, as arguments after `dotnet`, so a test runs exactly what a lint run does. */
export function buildArguments({ project, artifacts = ARTIFACTS }) {
  const [step] = csharpSteps({
    targets: [
      {
        path: project,
        directory: "."
      }
    ],
    tools: {
      dotnet: true
    },
    changedFiles: undefined,
    isFix: false,
    cwd: artifacts
  }).filter(candidate => candidate.name.startsWith("dotnet build"));
  return step.command.slice(1);
}

/** The diagnostics a fixture's build raises, as sorted `ID@file:line` strings. */
export function buildFindings({ directory, project }) {
  const { stdout } = dotnet({
    directory,
    args: buildArguments({ project })
  });
  const found = new Set();
  for (const match of stdout.matchAll(FINDING)) {
    const { file, line, id } = match.groups;
    found.add(`${id}@${file.split(/[/\\]/).pop()}:${line}`);
  }

  return [...found].sort();
}

/** The runner's own `dotnet format` command for a project (verify, or fix), with the preset's exclusions. */
export function formatRun({ directory, project, isFix }) {
  const [step] = csharpSteps({
    targets: [
      {
        path: project,
        directory: "."
      }
    ],
    tools: {
      dotnet: true
    },
    formatExcludes: Object.keys(loadPreset().formatExcludes),
    changedFiles: undefined,
    isFix
  }).filter(candidate => candidate.name.startsWith("dotnet format"));
  return dotnet({
    directory,
    args: step.command.slice(1)
  });
}
