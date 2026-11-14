const IGNORED_FOLDERS = new Set([
  ".git",
  ".gradle",
  ".idea",
  ".vs",
  "bin",
  "build",
  "dist",
  "external",
  "node_modules",
  "obj",
  "out",
  "target",
  "third_party",
  "vendor"
]);

/** The languages the shared ast-grep packs cover, in the order their steps run. */
export const AST_GREP_LANGUAGES = ["rust", "cpp", "csharp", "kotlin"];

/** The files that mark a language, as git pathspecs that match at any depth. */
export const LANGUAGE_MARKERS = {
  rust: ["Cargo.toml"],
  cpp: ["CMakeLists.txt", ".clang-tidy", ".clang-format"],
  csharp: ["*.csproj"],
  kotlin: ["build.gradle.kts", "detekt.yml"]
};

/** The source files of each language. */
export const LANGUAGE_PATTERNS = {
  rust: /\.rs$/,
  cpp: /\.(?:cpp|cc|cxx|hpp|hh|hxx|ipp|h)$/,
  csharp: /\.cs$/,
  kotlin: /\.kts?$/
};

/** Whether a path lies in a build, dependency or vendored folder that no language check reads. */
export function isIgnoredPath(file) {
  return file
    .split(/[/]/)
    .slice(0, -1)
    .some(segment => IGNORED_FOLDERS.has(segment));
}

/** The folders as `!**\/name\/**` globs for a tool that walks the tree itself. */
export function ignoredGlobs() {
  return [...IGNORED_FOLDERS].map(folder => `!**/${folder}/**`);
}

/**
 * The languages a repository holds, found by their marker files: `hasMarker` answers whether a pathspec (such as
 * `Cargo.toml` or `*.csproj`) matches a file at any depth. Pure.
 */
export function detectLanguages(hasMarker) {
  return AST_GREP_LANGUAGES.filter(language => LANGUAGE_MARKERS[language].some(hasMarker));
}
