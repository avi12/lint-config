import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, freemem } from "node:os";

const BYTES_PER_MB = 1024 * 1024;
const WINDOWS_EXECUTABLE = ".exe";
const VSWHERE_PATH = "Microsoft Visual Studio/Installer/vswhere.exe";
const VC_COMPONENT = "Microsoft.VisualStudio.Component.VC.Tools.x86.x64";
const VCVARS_PATH = "VC/Auxiliary/Build/vcvars64.bat";
const ENVIRONMENT_LINE = /^([^=\s][^=]*)=(.*)$/;

/**
 * The folders that may hold clang-tidy and clang-format, in order: `AVI12_LINT_LLVM_BIN`, the PATH (an empty
 * folder), the Visual Studio LLVM folder of each install, then the standalone LLVM install. Pure.
 */
export function llvmCandidates({ env, installationPaths = [] }) {
  const override = env["AVI12_LINT_LLVM_BIN"];
  return [
    ...(override ? [override] : []),
    "",
    ...installationPaths.map(installation => `${installation}/VC/Tools/Llvm/x64/bin`),
    "C:/Program Files/LLVM/bin"
  ];
}

/** The executable of a tool (`clang-tidy` or `clang-format`) from the first candidate folder that runs it, or undefined. */
export function findLlvmTool({ tool, candidates, isRunnable }) {
  for (const folder of candidates) {
    const executable =
      folder === "" ? tool : `${folder}/${tool}${process.platform === "win32" ? WINDOWS_EXECUTABLE : ""}`;
    if (isRunnable(executable)) {
      return executable;
    }
  }

  return undefined;
}

function isRunnable(executable) {
  const probe = spawnSync(executable, ["--version"], { encoding: "utf8" });
  return !probe.error && probe.status === 0;
}

function visualStudioInstallations(env) {
  const programFiles = env["ProgramFiles(x86)"];
  const vswhere = programFiles ? `${programFiles}/${VSWHERE_PATH}` : undefined;
  if (!vswhere || !existsSync(vswhere)) {
    return [];
  }

  const probe = spawnSync(
    vswhere,
    ["-latest", "-products", "*", "-requires", VC_COMPONENT, "-property", "installationPath"],
    {
      encoding: "utf8"
    }
  );
  return probe.status === 0 ? probe.stdout.split(/\r?\n/).filter(Boolean) : [];
}

/** `{ format, tidy }`: the executable of each LLVM tool, undefined when none of the candidate folders has it. */
export function locateLlvmTools(env) {
  const candidates = llvmCandidates({
    env,
    installationPaths: process.platform === "win32" ? visualStudioInstallations(env) : []
  });
  return {
    format: findLlvmTool({
      tool: "clang-format",
      candidates,
      isRunnable
    }),
    tidy: findLlvmTool({
      tool: "clang-tidy",
      candidates,
      isRunnable
    })
  };
}

/**
 * The environment of the Visual Studio x64 developer prompt (`INCLUDE`, `LIB`, `PATH`), read once by running
 * `vcvars64.bat`, so clang-tidy finds the MSVC and Windows SDK headers the build compiles against. Elsewhere, or
 * when no Visual Studio has the C++ tools, the plain environment.
 */
export function visualStudioEnvironment(env) {
  const [installation] = process.platform === "win32" ? visualStudioInstallations(env) : [];
  if (!installation) {
    return env;
  }

  const probe = spawnSync("cmd", ["/d", "/s", "/c", `call "${installation}/${VCVARS_PATH}" >nul 2>&1 && set`], {
    encoding: "utf8",
    windowsVerbatimArguments: true,
    maxBuffer: 16 * BYTES_PER_MB
  });
  if (probe.status !== 0) {
    return env;
  }

  const loaded = Object.fromEntries(
    probe.stdout
      .split(/\r?\n/)
      .map(line => ENVIRONMENT_LINE.exec(line))
      .filter(Boolean)
      .map(match => [match[1], match[2]])
  );
  return {
    ...env,
    ...loaded
  };
}

/** The real dependencies of `runCppTidy`: the file system, the process runner and the machine's memory. */
export function cppDependencies({ toolEnv, usageMegabytes, log }) {
  return {
    readText: path => (existsSync(path) ? readFileSync(path, "utf8").replaceAll("\r\n", "\n") : undefined),
    writeText: ({ path, text }) => writeFileSync(path, text),
    exists: existsSync,
    makeDirectory: path => mkdirSync(path, { recursive: true }),
    hashText: text => createHash("sha256").update(text).digest("hex"),
    run: ({ command, timeoutMs }) =>
      new Promise(resolve => {
        const [program, ...programArguments] = command;
        const child = spawn(program, programArguments, { env: toolEnv });
        const chunks = [];
        const timer = setTimeout(() => child.kill(), timeoutMs);
        child.stdout.on("data", chunk => chunks.push(chunk));
        child.stderr.on("data", chunk => chunks.push(chunk));
        child.on("error", error => {
          clearTimeout(timer);
          resolve({
            status: 1,
            output: String(error)
          });
        });
        child.on("close", status => {
          clearTimeout(timer);
          resolve({
            status: status ?? 1,
            output: Buffer.concat(chunks).toString()
          });
        });
      }),
    wait: milliseconds => new Promise(done => setTimeout(done, milliseconds)),
    now: Date.now,
    freeMegabytes: () => freemem() / BYTES_PER_MB,
    cpus: () => cpus().length,
    usageMegabytes,
    log
  };
}
