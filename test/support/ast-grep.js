import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHIM = join(ROOT, "node_modules", "@ast-grep", "cli", "ast-grep");
const MAX_BUFFER = 256 * 1024 * 1024;

export const PACK = join(ROOT, "packages", "ast-grep-rules");

/** The findings of one language's rule pack over `files` (paths under its folder), as `{ rule, file, line }`. */
export function astGrepFindings({ language, files }) {
  const cwd = join(PACK, language);
  const { stdout, error } = spawnSync(process.execPath, [SHIM, "scan", "-c", "sgconfig.yml", "--json=compact", ...files], {
    cwd,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER
  });
  if (error) {
    throw error;
  }

  return JSON.parse(stdout).map(match => ({
    rule: match.ruleId,
    file: match.file.replaceAll("\\", "/"),
    line: match.range.start.line + 1
  }));
}
