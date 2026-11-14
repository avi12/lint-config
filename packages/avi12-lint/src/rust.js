import { isIgnoredPath } from "./languages.js";

/** Where a lint run builds, under the repo's own `.verify` folder, so it never blocks or thrashes the dev build. */
export const RUST_TARGET_DIRECTORY = ".verify/rust-target";

/** Cargo's own jobs for a lint run: modest, since a cold Tauri tree is the one heavy job. */
export const RUST_BUILD_JOBS = 4;

/** The default limits of the guard around a Rust step, wider than fallow's since a cold build compiles every dependency. */
export const RUST_DEFAULT_MEMORY_MB = 8192;
export const RUST_DEFAULT_TIME_LIMIT_MS = 30 * 60 * 1000;

const RUST_SOURCE = /\.rs$/;
const LINT_INPUT = /(?:^|\/)(?:Cargo\.(?:toml|lock)|clippy\.toml|rustfmt\.toml|deny\.toml|avi12-rust\.local\.toml)$/;

/** The install command of each tool a Rust step needs. */
export const RUST_TOOL_HINTS = {
  clippy: "rustup component add clippy",
  rustfmt: "rustup component add rustfmt",
  machete: "cargo install cargo-machete --locked",
  deny: "cargo install cargo-deny --locked"
};

/** The guard limits of Rust steps: `AVI12_LINT_RUST_MEMORY_MB` and `AVI12_LINT_RUST_TIME_LIMIT_MS`. Pure. */
export function rustLimits(env) {
  const memory = Number(env["AVI12_LINT_RUST_MEMORY_MB"]);
  const time = Number(env["AVI12_LINT_RUST_TIME_LIMIT_MS"]);
  return {
    memoryLimitMb: memory > 0 ? memory : RUST_DEFAULT_MEMORY_MB,
    timeLimitMs: time > 0 ? time : RUST_DEFAULT_TIME_LIMIT_MS
  };
}

const RUST_TOOL_PROBES = {
  clippy: ["clippy", "--version"],
  rustfmt: ["fmt", "--version"],
  machete: ["machete", "--version"],
  deny: ["deny", "--version"]
};

/**
 * Which of cargo and its four tools run: `isRunnable` answers whether `cargo <arguments>` exits 0. Returns
 * `{ hasCargo, tools: { clippy, rustfmt, machete, deny } }`, every tool false without cargo. Pure given `isRunnable`.
 */
export function probeRustTools(isRunnable) {
  const hasCargo = isRunnable(["--version"]);
  return {
    hasCargo,
    tools: Object.fromEntries(
      Object.entries(RUST_TOOL_PROBES).map(([tool, probe]) => [tool, hasCargo && isRunnable(probe)])
    )
  };
}

function isInside({ file, directory }) {
  return directory === "." || file.startsWith(`${directory}/`);
}

function ownerOf({ file, crates }) {
  return crates
    .filter(crate =>
      isInside({
        file,
        directory: crate.directory
      })
    )
    .sort((one, two) => one.directory.length - two.directory.length)
    .pop();
}

function scopeOf({ root, changedFiles }) {
  if (!changedFiles) {
    return {
      isFull: true,
      crates: root.crates
    };
  }

  const inside = changedFiles.filter(
    file =>
      isInside({
        file,
        directory: root.directory
      }) && !isIgnoredPath(file)
  );
  const relevant = inside.filter(file => RUST_SOURCE.test(file) || LINT_INPUT.test(file));
  const owners = new Set();
  let isFull = false;
  for (const file of relevant) {
    const owner = RUST_SOURCE.test(file)
      ? ownerOf({
          file,
          crates: root.crates
        })
      : undefined;
    if (owner) {
      owners.add(owner);
    } else {
      isFull = true;
    }
  }

  return {
    isFull,
    isSkipped: relevant.length === 0,
    hasManifestChange: relevant.some(file => /Cargo\.(?:toml|lock)$/.test(file)),
    crates: [...owners]
  };
}

function packageFlags({ scope, isWorkspaceFlag }) {
  return scope.isFull ? [isWorkspaceFlag] : scope.crates.flatMap(crate => ["-p", crate.name]);
}

/**
 * The Rust steps for the repo's Cargo `roots` (see `cargoRoots`), each one a serial, guarded, direct step: per
 * root `cargo fmt --check` (`cargo fmt` with `isFix`), `cargo clippy --all-targets --all-features -- -D warnings`
 * (with `--fix --allow-dirty --allow-staged` with `isFix`), `cargo machete` and `cargo deny check`. `tools` says which
 * of `{ clippy, rustfmt, machete, deny }` are installed; a step of a missing tool is left out. `changedFiles` limits
 * a root to the crates that own a changed `.rs` file (a changed manifest, lock file or lint config means the whole
 * root; no changed Rust file skips the root, and `cargo deny` runs only when a manifest or lock file changed).
 * clippy builds into `env.CARGO_TARGET_DIR` when the repo sets it, else into `RUST_TARGET_DIRECTORY`, unless
 * `AVI12_LINT_RUST_TARGET` is `shared`, which leaves Cargo's own default. `CLIPPY_CONF_DIR` points at the root so the
 * generated `clippy.toml` applies to every member. Pure.
 */
export function rustSteps({ roots, tools, changedFiles, isFix, env = {}, cwd = "." }) {
  const isSharedTarget = env["AVI12_LINT_RUST_TARGET"] === "shared";
  const hasTargetDirectory = Boolean(env["CARGO_TARGET_DIR"]);
  const targetEnv = isSharedTarget || hasTargetDirectory ? {} : { CARGO_TARGET_DIR: `${cwd}/${RUST_TARGET_DIRECTORY}` };
  const baseEnv = {
    CARGO_BUILD_JOBS: String(RUST_BUILD_JOBS),
    CARGO_TERM_COLOR: "never"
  };
  const limits = rustLimits(env);
  const isFetchDisabled = env["AVI12_LINT_RUST_DENY_FETCH"] === "0";
  const steps = [];
  for (const root of roots) {
    const scope = scopeOf({
      root,
      changedFiles
    });
    if (scope.isSkipped) {
      continue;
    }

    const manifest = ["--manifest-path", root.manifest];
    const label = root.directory === "." ? "" : ` ${root.directory}`;
    function step({ name, command, rawEnv }) {
      return {
        name: `${name}${label}`,
        command,
        env: {},
        rawEnv: {
          ...baseEnv,
          ...rawEnv
        },
        isDirect: true,
        isGuarded: true,
        isParallel: false,
        family: "rust",
        limits
      };
    }

    if (tools.rustfmt) {
      steps.push(
        step({
          name: "cargo fmt",
          command: [
            "cargo",
            "fmt",
            ...manifest,
            ...(scope.isFull
              ? ["--all"]
              : packageFlags({
                  scope,
                  isWorkspaceFlag: "--all"
                })),
            ...(isFix ? [] : ["--check"])
          ],
          rawEnv: {}
        })
      );
    }

    if (tools.clippy) {
      steps.push(
        step({
          name: "cargo clippy",
          command: [
            "cargo",
            "clippy",
            ...manifest,
            ...packageFlags({
              scope,
              isWorkspaceFlag: "--workspace"
            }),
            "--all-targets",
            "--all-features",
            ...(isFix ? ["--fix", "--allow-dirty", "--allow-staged"] : []),
            "--",
            "-D",
            "warnings"
          ],
          rawEnv: {
            ...targetEnv,
            CLIPPY_CONF_DIR: `${cwd}/${root.directory}`
          }
        })
      );
    }

    if (tools.machete) {
      const directories = scope.isFull ? [root.directory] : scope.crates.map(crate => crate.directory);
      steps.push(
        step({
          name: "cargo machete",
          command: ["cargo", "machete", ...directories],
          rawEnv: {}
        })
      );
    }

    const isDenyPlanned = tools.deny && (!changedFiles || scope.hasManifestChange);
    if (isDenyPlanned) {
      steps.push(
        step({
          name: "cargo deny",
          command: [
            "cargo",
            "deny",
            ...manifest,
            "--config",
            root.directory === "." ? "deny.toml" : `${root.directory}/deny.toml`,
            ...(isFetchDisabled ? ["--offline"] : []),
            "check"
          ],
          rawEnv: {}
        })
      );
    }
  }

  return steps;
}

/**
 * What `avi12-lint` says when the Rust checks cannot all run: `hasCargo` false skips them all, `tools` names the
 * missing ones with the command that installs each, `isPresetInstalled` false means `rust-config-avi12` is absent,
 * and `staleFiles` or `problems` come from `planRustConfig`. Pure.
 */
export function rustNotices({ hasCargo, tools, isPresetInstalled, staleFiles = [], problems = [] }) {
  if (!hasCargo) {
    return ["avi12-lint: cargo is not installed, so the Rust checks were skipped; install Rust with rustup"];
  }

  const missing = Object.entries(RUST_TOOL_HINTS)
    .filter(([tool]) => !tools[tool])
    .map(([tool, hint]) => `avi12-lint: ${tool} is not installed, so its Rust check was skipped; run ${hint}`);
  const presetNotice = isPresetInstalled
    ? []
    : ["avi12-lint: rust-config-avi12 is not installed, so the Rust lint levels were not checked"];
  const staleNotice =
    staleFiles.length > 0
      ? [`avi12-lint: ${staleFiles.join(", ")} differ from rust-config-avi12; run avi12-lint rust-config`]
      : [];
  return [...missing, ...presetNotice, ...staleNotice, ...problems.map(problem => `avi12-lint: ${problem}`)];
}
