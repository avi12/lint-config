import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeFlatToml, parseFlatToml, renderEntries } from "avi12-lint/flat-toml";
import { plan } from "avi12-lint/plan";
import { probeRustTools, rustLimits, rustNotices, rustSteps } from "avi12-lint/rust";
import { cargoRoots, planRustConfig, staleRustFiles, withManagedBlock } from "avi12-lint/rust-config";

import { presetTexts } from "./support/rust.js";

function manifestOf(name) {
  return `[package]\nname = "${name}"\nversion = "0.1.0"\n`;
}

const WORKSPACE_MANIFESTS = [
  {
    path: "app/Cargo.toml",
    text: `${manifestOf("app")}\n[workspace]\nmembers = ["one", "two"]\n`
  },
  {
    path: "app/one/Cargo.toml",
    text: manifestOf("one")
  },
  {
    path: "app/two/Cargo.toml",
    text: manifestOf("two")
  },
  {
    path: "tool/Cargo.toml",
    text: manifestOf("tool")
  }
];
const ALL_TOOLS = {
  clippy: true,
  rustfmt: true,
  machete: true,
  deny: true
};

function steps(overrides = {}) {
  return rustSteps({
    roots: cargoRoots(WORKSPACE_MANIFESTS),
    tools: ALL_TOOLS,
    isFix: false,
    cwd: "C:/repo",
    ...overrides
  });
}

function names(planned) {
  return planned.map(({ name }) => name);
}

test("flat toml keeps comments, multi-line arrays and the order, and a local key replaces the base's", () => {
  const base = parseFlatToml('# why\na = 1\nlist = [\n  "x",\n]\n[t]\nb = { level = "warn" }\n');
  assert.deepEqual([...base.get("").keys()], ["a", "list"]);
  assert.equal(base.get("").get("list").value, '[\n  "x",\n]');
  const merged = mergeFlatToml({
    base,
    local: parseFlatToml("a = 2\n[t]\nc = 3\n")
  });
  assert.deepEqual(renderEntries(merged.get("")).slice(0, 2), ["a = 2", 'list = [\n  "x",\n]']);
  assert.deepEqual([...merged.get("t").keys()], ["b", "c"]);
});

test("a workspace and a lone package are two roots, each member owned once", () => {
  const roots = cargoRoots(WORKSPACE_MANIFESTS);
  assert.deepEqual(
    roots.map(({ directory, isWorkspace, crates }) => [directory, isWorkspace, crates.map(({ name }) => name)]),
    [
      ["app", true, ["app", "one", "two"]],
      ["tool", false, ["tool"]]
    ]
  );
});

test("the generated files are the preset merged with the local file, and generating twice changes nothing", () => {
  const input = {
    preset: presetTexts(),
    manifests: WORKSPACE_MANIFESTS,
    locals: new Map([
      [
        "app",
        '[clippy]\nneedless_pass_by_value = "allow"\n[rustfmt]\nmax_width = 120\n[member.one.rust]\nunsafe_code = "allow"\n'
      ]
    ])
  };
  const { files, problems } = planRustConfig(input);
  assert.deepEqual(problems, []);
  assert.match(files.get("app/rustfmt.toml"), /^max_width = 120$/m);
  assert.doesNotMatch(files.get("app/rustfmt.toml"), /max_width = 100/);
  assert.match(files.get("app/Cargo.toml"), /\[workspace\.lints\.clippy\][\s\S]*needless_pass_by_value = "allow"/);
  assert.match(files.get("app/Cargo.toml"), /\[lints\]\nworkspace = true/);
  assert.match(files.get("app/two/Cargo.toml"), /\[lints\]\nworkspace = true/);
  assert.match(files.get("app/one/Cargo.toml"), /\[lints\.rust\][\s\S]*unsafe_code = "allow"/);
  assert.doesNotMatch(files.get("app/one/Cargo.toml"), /workspace = true/);
  assert.match(files.get("tool/Cargo.toml"), /\[lints\.rust\][^[]*unsafe_code = "forbid"/);
  assert.ok(files.has("app/clippy.toml") && files.has("tool/deny.toml"));

  const second = planRustConfig({
    ...input,
    manifests: [...files]
      .filter(([path]) => path.endsWith("Cargo.toml"))
      .map(([path, text]) => ({
        path,
        text
      }))
  });
  assert.deepEqual(
    staleRustFiles({
      files: second.files,
      existing: files
    }),
    [],
    "a second run must not change a file"
  );
});

test("a manifest with lint tables of its own is a problem, not an overwrite", () => {
  const { problems, files } = planRustConfig({
    preset: presetTexts(),
    manifests: [
      {
        path: "Cargo.toml",
        text: `${manifestOf("solo")}\n[lints.clippy]\nall = "warn"\n`
      }
    ],
    locals: new Map()
  });
  assert.match(problems[0], /Cargo\.toml: has \[lints\] tables of its own/);
  assert.equal(files.has("Cargo.toml"), false);
});

test("the managed block is replaced in place and the rest of the manifest is kept", () => {
  const once = withManagedBlock({
    text: `${manifestOf("keep")}\n[dependencies]\nserde = "1"\n`,
    lines: ["[lints]", "workspace = true"]
  });
  const twice = withManagedBlock({
    text: once,
    lines: ["[lints]", "workspace = false"]
  });
  assert.match(twice, /serde = "1"/);
  assert.equal(twice.match(/avi12-lint:begin/g).length, 1);
  assert.match(twice, /workspace = false/);
});

test("a full run plans fmt, clippy, machete and deny per root, serially, with the guard and the lint environment", () => {
  const planned = steps();
  assert.deepEqual(names(planned), [
    "cargo fmt app",
    "cargo clippy app",
    "cargo machete app",
    "cargo deny app",
    "cargo fmt tool",
    "cargo clippy tool",
    "cargo machete tool",
    "cargo deny tool"
  ]);
  assert.ok(planned.every(step => step.isDirect && step.isGuarded && !step.isParallel && step.family === "rust"));
  const [fmt, clippy, machete, deny] = planned;
  assert.deepEqual(fmt.command, ["cargo", "fmt", "--manifest-path", "app/Cargo.toml", "--all", "--check"]);
  assert.deepEqual(clippy.command, [
    "cargo",
    "clippy",
    "--manifest-path",
    "app/Cargo.toml",
    "--workspace",
    "--all-targets",
    "--all-features",
    "--keep-going",
    "--",
    "-D",
    "warnings"
  ]);
  assert.equal(clippy.rawEnv.CLIPPY_CONF_DIR, "C:/repo/app");
  assert.equal(clippy.rawEnv.CARGO_TARGET_DIR, "C:/repo/.verify/rust-target");
  assert.equal(clippy.rawEnv.CARGO_BUILD_JOBS, "4");
  assert.deepEqual(machete.command, ["cargo", "machete", "app"]);
  assert.deepEqual(deny.command.slice(0, 6), [
    "cargo",
    "deny",
    "--manifest-path",
    "app/Cargo.toml",
    "--config",
    "app/deny.toml"
  ]);
});

test("fix mode formats and lets clippy fix; a repo's own target directory and the shared choice are respected", () => {
  const [fmt, clippy] = steps({ isFix: true });
  assert.equal(fmt.command.includes("--check"), false);
  assert.ok(clippy.command.includes("--fix") && clippy.command.includes("--allow-dirty"));
  assert.equal(
    steps({
      env: {
        CARGO_TARGET_DIR: "D:/t"
      }
    })[1].rawEnv.CARGO_TARGET_DIR,
    undefined
  );
  assert.equal(
    steps({
      env: {
        AVI12_LINT_RUST_TARGET: "shared"
      }
    })[1].rawEnv.CARGO_TARGET_DIR,
    undefined
  );
});

test("changed mode keeps only the crates that own a changed Rust file, and skips a root with none", () => {
  const planned = steps({ changedFiles: ["app/one/src/lib.rs", "README.md", "tool/notes.txt"] });
  assert.deepEqual(names(planned), ["cargo fmt app", "cargo clippy app", "cargo machete app"]);
  assert.deepEqual(planned[0].command.slice(4), ["-p", "one", "--check"]);
  assert.deepEqual(planned[1].command.slice(4, 6), ["-p", "one"]);
  assert.deepEqual(planned[2].command, ["cargo", "machete", "app/one"]);
});

test("a changed manifest, lock file or lint config means the whole root, and deny runs for manifests only", () => {
  const lock = steps({ changedFiles: ["tool/Cargo.lock"] });
  assert.deepEqual(names(lock), ["cargo fmt tool", "cargo clippy tool", "cargo machete tool", "cargo deny tool"]);
  const config = steps({ changedFiles: ["app/clippy.toml"] });
  assert.equal(
    config.some(({ name }) => name.startsWith("cargo deny")),
    false
  );
  assert.ok(config[1].command.includes("--workspace"));
});

test("a missing tool leaves only its step out, and the notices name the install command", () => {
  const planned = steps({
    tools: {
      ...ALL_TOOLS,
      machete: false,
      deny: false
    }
  });
  assert.deepEqual(names(planned).slice(0, 2), ["cargo fmt app", "cargo clippy app"]);
  assert.equal(planned.length, 4);
  const notices = rustNotices({
    hasCargo: true,
    tools: {
      ...ALL_TOOLS,
      machete: false
    },
    isPresetInstalled: true
  });
  assert.match(notices[0], /machete is not installed.*cargo install cargo-machete --locked/);
  assert.match(
    rustNotices({
      hasCargo: false,
      tools: {},
      isPresetInstalled: true
    })[0],
    /cargo is not installed/
  );
  assert.match(
    rustNotices({
      hasCargo: true,
      tools: ALL_TOOLS,
      isPresetInstalled: true,
      staleFiles: ["clippy.toml"]
    })[0],
    /clippy\.toml differ from rust-config-avi12; run avi12-lint rust-config/
  );
});

test("tools are probed through cargo with a fake runner", () => {
  const asked = [];
  const result = probeRustTools(args => {
    asked.push(args.join(" "));
    return args[0] !== "deny";
  });
  assert.deepEqual(result.tools, {
    clippy: true,
    rustfmt: true,
    machete: true,
    deny: false
  });
  assert.equal(probeRustTools(() => false).hasCargo, false);
  assert.deepEqual(asked, ["--version", "clippy --version", "fmt --version", "machete --version", "deny --version"]);
});

test("the Rust guard limits come from the environment and fall back to the wide defaults", () => {
  assert.deepEqual(
    rustLimits({
      AVI12_LINT_RUST_MEMORY_MB: "1000",
      AVI12_LINT_RUST_TIME_LIMIT_MS: "5"
    }),
    {
      memoryLimitMb: 1000,
      timeLimitMs: 5
    }
  );
  assert.equal(rustLimits({}).timeLimitMs, 30 * 60 * 1000);
});

test("plan() adds the Rust steps beside the others", () => {
  const planned = plan({
    hasFile: () => false,
    languages: ["rust"],
    rust: {
      roots: cargoRoots(WORKSPACE_MANIFESTS),
      tools: ALL_TOOLS,
      cwd: "C:/repo",
      env: {}
    }
  });
  assert.ok(names(planned).includes("cargo clippy tool"));
});
