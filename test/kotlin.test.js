import assert from "node:assert/strict";
import { test } from "node:test";

import {
  javaCommand,
  KOTLIN_JVM_FLAGS,
  kotlinNotices,
  kotlinSteps,
  MINIMUM_JAVA_VERSION,
  parseJavaMajor
} from "avi12-lint/kotlin";
import { formatReport } from "avi12-lint/kotlin-report";
import { ensureTool, toolPath } from "avi12-lint/kotlin-tools";
import { plan } from "avi12-lint/plan";

const PRESET = "node_modules/kotlin-config-avi12";
const TOOLS = {
  ktlint: "cache/ktlint.jar",
  detekt: "cache/detekt.jar"
};
const BASE = {
  java: "java",
  tools: TOOLS,
  presetDirectory: PRESET,
  projectFiles: ["app/Main.kt", "ui/View.kt", "build/Out.kt", "docs/README.md"],
  platform: "linux"
};

function steps(overrides = {}) {
  return kotlinSteps({
    ...BASE,
    ...overrides
  });
}

test("java versions are read from both the old and the new scheme", () => {
  assert.equal(parseJavaMajor('java version "24.0.2" 2025-07-15'), 24);
  assert.equal(parseJavaMajor('openjdk version "17.0.9" 2023-10-17'), 17);
  assert.equal(parseJavaMajor('java version "1.8.0_392"'), 8);
  assert.equal(parseJavaMajor("command not found"), undefined);
});

test("the java command follows JAVA_HOME", () => {
  assert.equal(javaCommand({}), "java");
  assert.equal(javaCommand({ JAVA_HOME: "C:\\jdk\\" }), "C:\\jdk/bin/java");
});

test("a missing or old java is reported clearly, and a failed download names its cause", () => {
  assert.match(kotlinNotices({ javaMajor: undefined })[0], /Java 17 or newer \(none was found/);
  assert.match(kotlinNotices({ javaMajor: 11 })[0], /Java 11 was found/);
  assert.deepEqual(kotlinNotices({ javaMajor: MINIMUM_JAVA_VERSION }), []);
  assert.match(kotlinNotices({ javaMajor: 21, toolError: "offline" })[0], /could not be prepared \(offline\)/);
});

test("a full run gives ktlint the preset editorconfig and the repo's Kotlin files minus ignored folders, serially", () => {
  const [ktlint, detekt] = steps();
  assert.equal(ktlint.name, "ktlint");
  assert.equal(detekt.name, "detekt");
  assert.deepEqual(
    [ktlint, detekt].map(step => step.isParallel),
    [false, false]
  );
  assert.ok(ktlint.isDirect && detekt.isDirect);
  assert.deepEqual(ktlint.command.slice(0, 1 + KOTLIN_JVM_FLAGS.length), ["java", ...KOTLIN_JVM_FLAGS]);
  assert.ok(ktlint.command.includes(`--editorconfig=${PRESET}/.editorconfig`));
  assert.deepEqual(ktlint.split.files, ["app/Main.kt", "ui/View.kt"]);
  assert.ok(detekt.commands[0].includes("app/Main.kt,ui/View.kt"));
  assert.ok(!ktlint.command.includes("--format"));
});

test("detekt is layered preset then consumer, never autocorrects, and keeps its heap small", () => {
  const [, detekt] = steps({ consumerDetekt: "config/detekt/detekt.yml" });
  const [command] = detekt.commands;
  assert.ok(KOTLIN_JVM_FLAGS.includes("-Xmx768m") && command.includes("-Xmx768m"));
  assert.equal(command[command.indexOf("--config") + 1], `${PRESET}/detekt.yml,config/detekt/detekt.yml`);
  assert.ok(command.includes("--parallel") && command.includes("--build-upon-default-config"));
  assert.ok(!command.includes("--auto-correct") && !command.includes("-ac"));
  assert.equal(command[command.indexOf("--classpath") + 1], TOOLS.detekt);
});

test("fix mode formats with ktlint and still checks with detekt", () => {
  const [ktlint, detekt] = steps({ isFix: true });
  assert.ok(ktlint.command.includes("--format"));
  assert.ok(!detekt.command.includes("--format"));
});

test("changed files narrow both steps, drop ignored folders, and skip when no Kotlin file changed", () => {
  const [ktlint, detekt] = steps({
    changedFiles: ["app/src/Main.kt", "build/Generated.kt", "script.kts", "README.md", "generated/Api.kt"]
  });
  assert.deepEqual(ktlint.split.files, ["app/src/Main.kt", "script.kts"]);
  assert.ok(detekt.commands[0].at(-1) === "app/src/Main.kt");
  assert.deepEqual(steps({ changedFiles: ["README.md", "build/X.kt"] }), []);
  assert.deepEqual(steps({ projectFiles: ["generated/Api.kt", ".gradle/X.kt"] }), []);
});

test("a long file list is batched so no command passes the budget", () => {
  const files = Array.from({ length: 1000 }, (_, index) => `app/src/main/kotlin/Feature${index}.kt`);
  const [, detekt] = steps({
    changedFiles: files,
    platform: "win32"
  });
  assert.ok(detekt.commands.length > 1);
  const listed = detekt.commands.flatMap(command => command.at(-1).split(","));
  assert.deepEqual(listed, files);
  for (const command of detekt.commands) {
    assert.ok(command.at(-1).length <= 28000);
  }
});

test("plan adds the Kotlin steps only when the runner prepared them", () => {
  const names = given => plan({ hasFile: () => false, ...given }).map(step => step.name);
  assert.deepEqual(names({ languages: ["kotlin"] }), ["text-check"]);
  assert.deepEqual(names({ languages: ["kotlin"], kotlin: BASE }), ["text-check", "ktlint", "detekt"]);
});

test("the report reads both tools into one shape, drops the noise and keeps a crash", () => {
  const ktlint = formatReport({
    tool: "ktlint",
    text: [
      "WARNING: A restricted method has been called",
      "src/A.kt:3:1: Wildcard import (standard:no-wildcard-imports)",
      "",
      "Summary error count (descending) by rule:",
      "  standard:no-wildcard-imports: 1"
    ].join("\n")
  });
  assert.equal(ktlint, "src/A.kt:3:1  ktlint/no-wildcard-imports  Wildcard import\navi12-lint: ktlint: 1 finding\n");
  const detekt = formatReport({
    tool: "detekt",
    text: "C:\\repo\\A.kt:2:35: This expression contains a magic number. [MagicNumber]\nAnalysis failed with 1 weighted issues.\n"
  });
  assert.equal(
    detekt,
    "C:\\repo\\A.kt:2:35  detekt/MagicNumber  This expression contains a magic number.\navi12-lint: detekt: 1 finding\n"
  );
  assert.equal(formatReport({ tool: "detekt", text: "WARNING: x\n" }), "");
  assert.match(formatReport({ tool: "detekt", text: "Provided configuration file is invalid\n" }), /invalid/);
});

function fakeSystem({ cached, downloaded }) {
  const calls = [];
  const files = new Map(cached === undefined ? [] : [["cache/tool.jar", cached]]);
  return {
    calls,
    dependencies: {
      hashFile: async file => {
        calls.push(`hash ${file}`);
        const hash = files.get(file);
        if (hash === undefined) {
          throw new Error("missing");
        }

        return hash;
      },
      download: async ({ file }) => {
        calls.push("download");
        files.set(file, downloaded);
      },
      makeDirectory: async () => {},
      move: async (from, to) => {
        calls.push(`move ${from} ${to}`);
        files.set(to, files.get(from));
        files.delete(from);
      },
      remove: async file => {
        calls.push(`remove ${file}`);
        files.delete(file);
      }
    }
  };
}

const TOOL = {
  file: "tool.jar",
  url: "https://example.invalid/tool.jar",
  sha256: "good"
};

test("a cached jar with the pinned hash is used without a download", async () => {
  const { calls, dependencies } = fakeSystem({ cached: "good" });
  const found = await ensureTool({ tool: TOOL, cacheDirectory: "cache", dependencies });
  assert.equal(found, toolPath({ cacheDirectory: "cache", tool: TOOL }));
  assert.ok(!calls.includes("download"));
});

test("a missing or corrupt jar is downloaded, verified and moved into place", async () => {
  for (const cached of [undefined, "corrupt"]) {
    const { calls, dependencies } = fakeSystem({ cached, downloaded: "good" });
    await ensureTool({ tool: TOOL, cacheDirectory: "cache", dependencies });
    assert.ok(calls.includes("download"));
    assert.ok(calls.includes("move cache/tool.jar.part cache/tool.jar"));
  }
});

test("a download that does not match the pinned hash is deleted and rejected", async () => {
  const { calls, dependencies } = fakeSystem({ downloaded: "evil" });
  await assert.rejects(ensureTool({ tool: TOOL, cacheDirectory: "cache", dependencies }), /expected good/);
  assert.ok(calls.includes("remove cache/tool.jar.part"));
  assert.ok(!calls.some(call => call.startsWith("move")));
});

test("type resolution can be turned off, which drops the classpath", () => {
  const [, detekt] = steps({ isTypeResolved: false });
  assert.ok(!detekt.commands[0].includes("--classpath"));
});

test("a path under the working directory is written relative to it", () => {
  const text = "C:\\repo\\app\\A.kt:2:35: bad [MagicNumber]\nD:\\other\\B.kt:1:1: bad [MagicNumber]\n";
  const report = formatReport({
    tool: "detekt",
    text,
    cwd: "C:\\repo"
  });
  assert.ok(report.startsWith("app/A.kt:2:35  detekt/MagicNumber"));
  assert.ok(report.includes("D:\\other\\B.kt:1:1"));
});
