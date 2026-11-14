import { argumentBudget, batchCommands } from "./batch.js";
import { isIgnoredPath, LANGUAGE_PATTERNS } from "./languages.js";

/** The JVM flags both tools run with: a modest heap and the serial collector, the cheapest for a short run. */
export const KOTLIN_JVM_FLAGS = ["-Xmx768m", "-XX:+UseSerialGC"];

/** The preset package a consumer installs; `avi12-lint` reads its `.editorconfig`, `detekt.yml` and `tools.json`. */
export const KOTLIN_PRESET_DIRECTORY = "node_modules/kotlin-config-avi12";

/** Where the CLI jars are cached, under the repo's own `.verify` folder. */
export const KOTLIN_CACHE_DIRECTORY = ".verify/kotlin-tools";

/** Kotlin scripts (`build.gradle.kts`): detekt's type resolution crashes on them, so only ktlint reads them. */
const SCRIPT_PATTERN = /\.kts$/;

/** The characters a Windows process command line may hold (32767), less the fixed arguments; no shell is involved. */
const WINDOWS_PROCESS_BUDGET = 28000;

/** The Java release ktlint 1.8 needs. */
export const MINIMUM_JAVA_VERSION = 17;

/**
 * Reads the Java major version from the text `java -version` prints (`version "24.0.2"` or the old `"1.8.0_392"`);
 * undefined when the text holds no version. Pure.
 */
export function parseJavaMajor(text) {
  const match = /version "(\d+)(?:\.(\d+))?/.exec(text);
  if (!match) {
    return undefined;
  }

  const first = Number(match[1]);
  const second = Number(match[2] ?? 0);
  return first === 1 ? second : first;
}

/** The `java` command: `JAVA_HOME`'s when the variable is set, otherwise the one on the PATH. Pure. */
export function javaCommand(env) {
  const home = env["JAVA_HOME"];
  return home ? `${home.replace(/[\\/]+$/, "")}/bin/java` : "java";
}

function javaArguments({ jar, tail }) {
  return [...KOTLIN_JVM_FLAGS, "-jar", jar, ...tail];
}

/**
 * The ktlint and detekt steps for a repo that holds Kotlin, or none when `changedFiles` has no Kotlin file.
 * `java` is the command, `tools` the jar paths `{ ktlint, detekt }`, `presetDirectory` the shared preset and
 * `consumerDetekt` the repo's own `detekt.yml` (layered over the preset, so it wins). ktlint checks, or formats with
 * `isFix`, and reads the preset's `.editorconfig` as its default; detekt never autocorrects and is given the
 * detekt jar as its classpath (unless `isTypeResolved` is false, which is faster), so the rules that need type
 * resolution run on the Kotlin standard library. Both are
 * serial, so one JVM runs at a time. Both are given the Kotlin files in batches that fit the command line: the
 * `changedFiles` or else every `projectFiles` (the repo's own files, so ignored trees are never walked), minus
 * build, dependency, generated and vendored folders; with none the steps are skipped. Pure.
 */
export function kotlinSteps({
  java,
  tools,
  presetDirectory,
  consumerDetekt,
  projectFiles,
  changedFiles,
  isFix,
  isTypeResolved = true,
  platform,
  env = {}
}) {
  const files = (changedFiles ?? projectFiles).filter(
    file => LANGUAGE_PATTERNS.kotlin.test(file) && !isIgnoredPath(file)
  );
  const isSkipped = files.length === 0;
  if (isSkipped) {
    return [];
  }

  const budget = Math.min(
    argumentBudget({
      platform: "linux",
      env
    }),
    platform === "win32" ? WINDOWS_PROCESS_BUDGET : Infinity
  );
  const ktlintHead = [
    java,
    ...javaArguments({
      jar: tools.ktlint,
      tail: [`--editorconfig=${presetDirectory}/.editorconfig`, "--relative", ...(isFix ? ["--format"] : [])]
    })
  ];
  const detektConfig = [`${presetDirectory}/detekt.yml`, ...(consumerDetekt ? [consumerDetekt] : [])].join(",");
  const detektHead = [
    java,
    ...javaArguments({
      jar: tools.detekt,
      tail: [
        "--parallel",
        "--build-upon-default-config",
        "--config",
        detektConfig,
        ...(isTypeResolved ? ["--classpath", tools.detekt] : []),
        "--input"
      ]
    })
  ];
  const detektCommands = batchCommands({
    head: [],
    files: files.filter(file => !SCRIPT_PATTERN.test(file)),
    tail: [],
    budget
  }).map(batch => [...detektHead, batch.join(",")]);
  return [
    {
      name: "ktlint",
      command: [...ktlintHead, ...files],
      split: {
        head: ktlintHead,
        files,
        tail: []
      },
      env: {},
      isDirect: true,
      reporter: "ktlint",
      family: "kotlin",
      isGuarded: true,
      isParallel: false
    },
    {
      name: "detekt",
      command: detektCommands[0],
      commands: detektCommands,
      env: {},
      isDirect: true,
      reporter: "detekt",
      family: "kotlin",
      isGuarded: true,
      isParallel: false
    }
  ];
}

/**
 * What `avi12-lint` says when Kotlin cannot be checked: no Java 17 or newer (`javaMajor` undefined or too old), or a
 * jar that could not be fetched (`toolError`). Pure.
 */
export function kotlinNotices({ javaMajor, toolError }) {
  const isJavaTooOld = javaMajor === undefined || javaMajor < MINIMUM_JAVA_VERSION;
  if (isJavaTooOld) {
    const found = javaMajor === undefined ? "none was found" : `Java ${javaMajor} was found`;
    return [
      `avi12-lint: ktlint and detekt need Java ${MINIMUM_JAVA_VERSION} or newer (${found} on the PATH or in JAVA_HOME), so the Kotlin checks were skipped; install a JRE`
    ];
  }

  return toolError
    ? [`avi12-lint: the Kotlin tools could not be prepared (${toolError}), so ktlint and detekt were skipped`]
    : [];
}
