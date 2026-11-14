import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const OUTPUT = new URL("../tool-ids/", import.meta.url);
const NUGET = "https://api.nuget.org/v3-flatcontainer";
const MAVEN = "https://repo1.maven.org/maven2";
const LARGE_BUFFER = 536870912;
const MEDIUM_BUFFER = 67108864;
const DETEKT_VERSION = "1.23.8";
const KTLINT_VERSION = "1.8.0";
const SYSTEM_TAR = path.join(process.env["SystemRoot"] ?? "", "System32", "tar.exe");
const TAR = process.platform === "win32" ? SYSTEM_TAR : "tar";
const PACKAGES = [
  {
    name: "Microsoft.CodeAnalysis.NetAnalyzers",
    version: "10.0.404",
    pattern: /\bCA\d{4}\b/g
  },
  {
    name: "Microsoft.CodeAnalysis.CSharp.CodeStyle",
    version: "5.12.0",
    pattern: /\bIDE\d{4}\b/g
  },
  {
    name: "Roslynator.Analyzers",
    version: "5.0.1",
    pattern: /\bRCS\d{4}\b/g
  },
  {
    name: "Meziantou.Analyzer",
    version: "3.0.339",
    pattern: /\bMA\d{4}\b/g
  },
  {
    name: "StyleCop.Analyzers",
    version: "1.3.180",
    pattern: /\bSA\d{4}\b/g
  },
  {
    name: "Microsoft.CodeAnalysis.BannedApiAnalyzers",
    version: "5.6.0",
    pattern: /\bRS\d{4}\b/g
  },
  {
    name: "SonarAnalyzer.CSharp",
    version: "10.36.0.15337",
    pattern: /\bS\d{3,4}\b/g
  }
];
const COMPILER_PROBES = {
  CS1591: "/// <summary>x</summary>\npublic class Probe { public int Open; }",
  CS4014: "using System.Threading.Tasks;\nclass Probe { async Task Work() {} void Run() { Work(); } }",
  CS8602: "#nullable enable\nclass Probe { void Run(string? text) { _ = text.Length; } }"
};
const KEBAB_PATTERN = /[a-z][a-z0-9]*(?:-[a-z0-9]+)+/g;
const KTLINT_NOISE = new Set(["ktlint-ruleset-standard", "non-null"]);

function run({ command, args, cwd }) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: LARGE_BUFFER,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function download({ url, file }) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`);
  }

  const { writeFile } = await import("node:fs/promises");
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
}

function extract({ archive, directory }) {
  mkdirSync(directory, { recursive: true });
  run({
    command: TAR,
    args: ["-xf", archive],
    cwd: directory
  });
}

function filesUnder({ directory, extension }) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(
        ...filesUnder({
          directory: full,
          extension
        })
      );
    } else if (full.endsWith(extension)) {
      found.push(full);
    }
  }

  return found;
}

function normalize(names) {
  return [...new Set(names)].sort();
}

function clippyAndRustc({ work }) {
  const crate = path.join(work, "probe");
  run({
    command: "cargo",
    args: ["init", "--name", "probe", "--vcs", "none", crate]
  });
  const clippyText = execFileSync("cargo", ["clippy", "--", "-W", "help"], {
    cwd: crate,
    encoding: "utf8",
    maxBuffer: MEDIUM_BUFFER,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const clippy = clippyText.match(/clippy::[a-z0-9-]+/g) ?? [];
  const rustcText = run({
    command: "rustc",
    args: ["-W", "help"]
  });
  const rustc = [...rustcText.matchAll(/^\s*([a-z0-9-]+)\s+(?:allow|warn|deny|forbid)\s/gm)].map(match => match[1]);
  return {
    clippy: normalize(clippy.map(name => name.replace("clippy::", "").replaceAll("-", "_"))),
    rustc: normalize(rustc.map(name => name.replaceAll("-", "_")))
  };
}

function clangTidy() {
  const text = run({
    command: "clang-tidy",
    args: ["--list-checks", "-checks=*"]
  });
  return normalize(
    text
      .split("\n")
      .map(line => line.trim())
      .filter(line => /^[a-z0-9]+-[a-z0-9-]+$/.test(line))
  );
}

function scanBinary(file) {
  const buffer = readFileSync(file);
  return [buffer.toString("latin1"), buffer.toString("utf16le"), buffer.subarray(1).toString("utf16le")];
}

async function roslynAnalyzers({ work }) {
  const ids = [];
  for (const { name, version, pattern } of PACKAGES) {
    const archive = path.join(work, `${name}.nupkg`);
    const directory = path.join(work, name);
    await download({
      url: `${NUGET}/${name.toLowerCase()}/${version}/${name.toLowerCase()}.${version}.nupkg`,
      file: archive
    });
    extract({
      archive,
      directory
    });
    for (const file of filesUnder({
      directory,
      extension: ".dll"
    })) {
      for (const text of scanBinary(file)) {
        ids.push(...(text.match(pattern) ?? []));
      }
    }
  }

  return ids;
}

function compilerIds({ work }) {
  const project = path.join(work, "compiler");
  mkdirSync(project, { recursive: true });
  const found = [];
  for (const [id, code] of Object.entries(COMPILER_PROBES)) {
    const directory = path.join(project, id);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, "Probe.csproj"),
      `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><OutputType>Library</OutputType><GenerateDocumentationFile>true</GenerateDocumentationFile></PropertyGroup></Project>`
    );
    writeFileSync(path.join(directory, "Probe.cs"), code);
    let output = "";
    try {
      output = run({
        command: "dotnet",
        args: ["build", "--no-incremental", "-nologo", "-v:q"],
        cwd: directory
      });
    } catch (error) {
      output = String(error.stdout ?? "");
    }

    if (output.includes(`warning ${id}`)) {
      found.push(id);
    } else {
      throw new Error(`the compiler probe for ${id} did not report it`);
    }
  }

  return found;
}

async function detekt({ work }) {
  const archive = path.join(work, "detekt.zip");
  await download({
    url: `https://github.com/detekt/detekt/releases/download/v${DETEKT_VERSION}/detekt-cli-${DETEKT_VERSION}.zip`,
    file: archive
  });
  const directory = path.join(work, "detekt");
  extract({
    archive,
    directory
  });
  run({
    command: "java",
    args: [
      "-jar",
      path.join(directory, `detekt-cli-${DETEKT_VERSION}`, "lib", `detekt-cli-${DETEKT_VERSION}-all.jar`),
      "--generate-config"
    ],
    cwd: directory
  });
  const lines = readFileSync(path.join(directory, "detekt.yml"), "utf8").split("\n");
  const names = [];
  for (const line of lines) {
    const match = /^( {0,2})([A-Za-z]+):\s*$/.exec(line);
    if (match?.[2]) {
      names.push(match[2]);
    }
  }

  return normalize(names);
}

async function ktlint({ work }) {
  const archive = path.join(work, "ktlint.jar");
  await download({
    url: `${MAVEN}/com/pinterest/ktlint/ktlint-ruleset-standard/${KTLINT_VERSION}/ktlint-ruleset-standard-${KTLINT_VERSION}.jar`,
    file: archive
  });
  const directory = path.join(work, "ktlint");
  extract({
    archive,
    directory
  });
  const rules = path.join(directory, "com", "pinterest", "ktlint", "ruleset", "standard", "rules");
  const ids = [];
  for (const file of readdirSync(rules)) {
    const match = /^([A-Za-z]+)Rule\.class$/.exec(file);
    const isRuleClass = match?.[1] && statSync(path.join(rules, file)).isFile();
    if (!isRuleClass) {
      continue;
    }

    const kebab = match[1].replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    const text = readFileSync(path.join(rules, file), "latin1");
    const fallback = (text.match(KEBAB_PATTERN) ?? []).find(candidate => !KTLINT_NOISE.has(candidate));
    ids.push(text.includes(kebab) ? kebab : fallback);
  }

  return normalize(ids.filter(Boolean));
}

function write({ tool, source, ids }) {
  writeFileSync(new URL(`${tool}.txt`, OUTPUT), `# ${source}\n${ids.join("\n")}\n`);
  console.log(`${tool}: ${ids.length}`);
}

const work = mkdtempSync(path.join(tmpdir(), "avi12-ids-"));
mkdirSync(OUTPUT, { recursive: true });
try {
  const rust = clippyAndRustc({ work });
  write({
    tool: "clippy",
    source: `cargo clippy -- -W help`,
    ids: rust.clippy
  });
  write({
    tool: "rustc",
    source: `rustc -W help`,
    ids: rust.rustc
  });
  write({
    tool: "clang-tidy",
    source: `clang-tidy --list-checks -checks=*`,
    ids: clangTidy()
  });
  const analyzers = await roslynAnalyzers({ work });
  write({
    tool: "roslyn",
    source: `analyzer packages ${PACKAGES.map(item => `${item.name} ${item.version}`).join(", ")}; compiler warnings proved by dotnet build`,
    ids: normalize([...analyzers, ...compilerIds({ work })])
  });
  write({
    tool: "detekt",
    source: `detekt-cli ${DETEKT_VERSION} --generate-config (rule sets and rules)`,
    ids: await detekt({ work })
  });
  write({
    tool: "ktlint",
    source: `ktlint-ruleset-standard ${KTLINT_VERSION}`,
    ids: await ktlint({ work })
  });
} finally {
  rmSync(work, {
    recursive: true,
    force: true
  });
}
