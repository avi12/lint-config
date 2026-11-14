const KTLINT_LINE = /^(.+?):(\d+):(\d+): (.*) \((?:[\w-]+):([\w-]+)\)$/;
const DETEKT_LINE = /^(.+?):(\d+):(\d+): (.*) \[(\w+)\]$/;
const NOISE_LINES = [
  /^WARNING: /,
  /^\d\d:\d\d:\d\d\.\d+ \[main\] WARN /,
  /^Analysis failed with /,
  /^Summary error count/,
  /^ {2}[\w-]+:[\w-]+: \d+$/,
  /^\s*$/
];

/**
 * One consistent report for ktlint and detekt: each finding as `file:line:column  tool/rule  message`, then a count.
 * `tool` names which parser reads a line, and a path under `cwd` is written relative to it; JVM warnings, detekt's own verdict and ktlint's summary table are dropped,
 * and anything else (a crash, an invalid config) is kept as it came so a failure is never hidden. Pure.
 */
export function formatReport({ tool, text, cwd = "" }) {
  const prefix = cwd === "" ? undefined : `${cwd.replaceAll("\\", "/").replace(/\/+$/, "")}/`;
  function relative(file) {
    const unified = file.replaceAll("\\", "/");
    return prefix && unified.startsWith(prefix) ? unified.slice(prefix.length) : file;
  }

  const pattern = tool === "ktlint" ? KTLINT_LINE : DETEKT_LINE;
  const findings = [];
  const others = [];
  for (const line of text.split(/\r?\n/)) {
    const match = pattern.exec(line);
    if (match) {
      const [, file, row, column, message, rule] = match;
      findings.push(`${relative(file)}:${row}:${column}  ${tool}/${rule}  ${message}`);
      continue;
    }

    const isNoise = NOISE_LINES.some(noise => noise.test(line));
    if (!isNoise) {
      others.push(line);
    }
  }

  const noun = findings.length === 1 ? "finding" : "findings";
  const summary = findings.length > 0 ? [`avi12-lint: ${tool}: ${findings.length} ${noun}`] : [];
  const lines = [...findings, ...others, ...summary];
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}
