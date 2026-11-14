import { isIgnoredPath } from "./languages.js";

/** Where a lint run builds, under the repo's own `.verify` folder, so it never touches the dev build's bin and obj. */
export const CSHARP_ARTIFACTS_DIRECTORY = ".verify/csharp-artifacts";

/** The default limits of the guard around a C# step: a cold WinUI restore and build peaked near 2 GB. */
export const CSHARP_DEFAULT_MEMORY_MB = 6144;
export const CSHARP_DEFAULT_TIME_LIMIT_MS = 20 * 60 * 1000;

/** The oldest .NET SDK that has `dotnet format` and `--artifacts-path`. */
export const CSHARP_MINIMUM_SDK_MAJOR = 8;

/** The install hint when the .NET SDK is missing or too old. */
export const DOTNET_HINT = "winget install Microsoft.DotNet.SDK.10";

const SOLUTION = /\.slnx?$/;
const PROJECT = /\.csproj$/;
const SOURCE = /\.cs$/;
const BUILD_INPUT = /(?:\.(?:csproj|props|targets|xaml|resx|editorconfig)|avi12-csharp\.local\.json)$/;
const CONFIG_INPUT =
  /(?:^|\/)(?:\.editorconfig|Directory\.Build\.(?:props|targets)|Directory\.Packages\.props|avi12-csharp\.local\.json|\.avi12-csharp\/[^/]+)$/;
const FIRST_NON_WORD = /[^A-Za-z0-9]+/g;

/** The guard limits of the C# steps: `AVI12_LINT_CSHARP_MEMORY_MB` and `AVI12_LINT_CSHARP_TIME_LIMIT_MS`. Pure. */
export function csharpLimits(env) {
  const memory = Number(env["AVI12_LINT_CSHARP_MEMORY_MB"]);
  const time = Number(env["AVI12_LINT_CSHARP_TIME_LIMIT_MS"]);
  return {
    memoryLimitMb: memory > 0 ? memory : CSHARP_DEFAULT_MEMORY_MB,
    timeLimitMs: time > 0 ? time : CSHARP_DEFAULT_TIME_LIMIT_MS
  };
}

function directoryOf(file) {
  const slash = file.lastIndexOf("/");
  return slash === -1 ? "." : file.slice(0, slash);
}

function isInside({ file, directory }) {
  return directory === "." || file.startsWith(`${directory}/`);
}

/**
 * What a run builds and formats, from the tracked `files`: every solution (`.sln`, `.slnx`) and every project that
 * lies under no solution, as `{ path, directory }`. `local.targets` (an array of paths) replaces the search. Folders
 * no check reads (`bin`, `obj`, `node_modules`, `vendor`) are never searched. Pure.
 */
export function csharpTargets({ files, local = {} }) {
  const explicit = local.targets;
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit.map(path => ({
      path,
      directory: directoryOf(path)
    }));
  }

  const candidates = files.filter(file => !isIgnoredPath(file));
  const solutions = candidates.filter(file => SOLUTION.test(file));
  const solutionDirectories = solutions.map(directoryOf);
  const projects = candidates.filter(file => {
    const isCovered = solutionDirectories.some(directory =>
      isInside({
        file,
        directory
      })
    );
    return PROJECT.test(file) && !isCovered;
  });
  return [...solutions, ...projects].map(path => ({
    path,
    directory: directoryOf(path)
  }));
}

/** Whether the change touches a lint input every target depends on (the generated config or the local file). Pure. */
export function isCsharpConfigChanged(changedFiles) {
  return changedFiles.some(file => CONFIG_INPUT.test(file));
}

function ownerOf({ file, targets }) {
  return [...targets]
    .filter(target =>
      isInside({
        file,
        directory: target.directory
      })
    )
    .sort((one, two) => two.directory.length - one.directory.length)[0];
}

function slugOf(path) {
  return path.replace(FIRST_NON_WORD, "-").replace(/^-|-$/g, "");
}

/**
 * The C# steps, per target and one at a time: `dotnet format` (whitespace, style and analyzer fixes from the generated
 * `.editorconfig`; `--verify-no-changes` unless `isFix`) and `dotnet build` with every analyzer warning an error
 * (`-warnaserror`), into `.verify/csharp-artifacts` so the dev build's bin and obj are never touched, with one MSBuild
 * node, no node reuse and no compiler server, so no process outlives the step. `formatExcludes` are diagnostic ids
 * `dotnet format` must neither fix nor report (see `formatExcludes` in analyzers.json); the build still reports them. With `changedFiles` a target runs only
 * when one of its files changed (a changed config input means every target), and format takes just the changed
 * `.cs` files. Pure.
 */
export function csharpSteps({ targets, tools, formatExcludes = [], changedFiles, isFix, env = {}, cwd = "." }) {
  if (!tools.dotnet) {
    return [];
  }

  const limits = csharpLimits(env);
  const isConfigTouched = changedFiles !== undefined && isCsharpConfigChanged(changedFiles);
  const isFull = changedFiles === undefined || isConfigTouched;
  const baseEnv = {
    DOTNET_CLI_TELEMETRY_OPTOUT: "1",
    DOTNET_NOLOGO: "1",
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
    MSBUILDDISABLENODEREUSE: "1"
  };
  const steps = [];
  for (const target of targets) {
    const owned = isFull
      ? []
      : changedFiles.filter(
          file =>
            ownerOf({
              file,
              targets
            }) === target
        );
    const isBuildNeeded = isFull || owned.some(file => BUILD_INPUT.test(file) || SOURCE.test(file));
    if (!isBuildNeeded) {
      continue;
    }

    const sources = owned.filter(file => SOURCE.test(file));
    const isFormatNarrowed = !isFull && sources.length > 0;
    const formatHead = [
      "dotnet",
      "format",
      target.path,
      ...(isFix ? [] : ["--verify-no-changes"]),
      ...(formatExcludes.length > 0 ? ["--exclude-diagnostics", ...formatExcludes] : [])
    ];
    const step = {
      env: {},
      rawEnv: baseEnv,
      isDirect: true,
      isGuarded: true,
      isParallel: false,
      family: "csharp",
      limits
    };
    if (isFull || isFormatNarrowed) {
      steps.push({
        ...step,
        name: `dotnet format ${target.path}`,
        command: isFormatNarrowed ? [...formatHead, "--include", ...sources] : formatHead,
        split: isFormatNarrowed
          ? {
              head: [...formatHead, "--include"],
              files: sources,
              tail: []
            }
          : undefined
      });
    }

    steps.push({
      ...step,
      name: `dotnet build ${target.path}`,
      command: [
        "dotnet",
        "build",
        target.path,
        "-m:1",
        "-nodeReuse:false",
        "-p:UseSharedCompilation=false",
        "--no-incremental",
        "-warnaserror",
        "-nologo",
        "-v:q",
        "-clp:NoSummary",
        "--artifacts-path",
        `${cwd}/${CSHARP_ARTIFACTS_DIRECTORY}/${slugOf(target.path)}`
      ]
    });
  }

  return steps;
}

/** The major version of the `dotnet --version` text, or undefined. Pure. */
export function parseDotnetMajor(text) {
  const major = Number(/^(\d+)\./.exec(text.trim())?.[1]);
  return Number.isInteger(major) ? major : undefined;
}

/** What `avi12-lint` says when the C# checks cannot all run. Pure. */
export function csharpNotices({ dotnetMajor, isPresetInstalled, staleFiles = [], problems = [] }) {
  const isSdkUsable = dotnetMajor !== undefined && dotnetMajor >= CSHARP_MINIMUM_SDK_MAJOR;
  const sdkNotice = isSdkUsable
    ? []
    : [
        `avi12-lint: the .NET SDK ${CSHARP_MINIMUM_SDK_MAJOR} or newer is not installed, so dotnet format and dotnet build were skipped; install it: ${DOTNET_HINT}`
      ];
  const presetNotice = isPresetInstalled
    ? []
    : ["avi12-lint: csharp-config-avi12 is not installed, so the C# lint config was not checked"];
  const staleNotice =
    staleFiles.length > 0
      ? [`avi12-lint: ${staleFiles.join(", ")} differ from csharp-config-avi12; run avi12-lint csharp-config`]
      : [];
  return [...sdkNotice, ...presetNotice, ...staleNotice, ...problems.map(problem => `avi12-lint: ${problem}`)];
}
