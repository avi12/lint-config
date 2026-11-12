import { execFileSync } from "node:child_process";

const BASE_CANDIDATES = ["origin/main", "main"];
const LIST_FLAGS = ["--name-only", "--diff-filter=ACMR"];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
}

function mergeBase() {
  for (const candidate of BASE_CANDIDATES) {
    try {
      return git(["merge-base", "HEAD", candidate])[0];
    } catch {
      continue;
    }
  }

  return "HEAD";
}

/** The files staged for commit that still exist. */
export function stagedFiles() {
  return git(["diff", "--cached", ...LIST_FLAGS]);
}

/** The files that differ from the merge base with `main`, in the working tree, plus the untracked ones. */
export function changedFiles() {
  const tracked = git(["diff", ...LIST_FLAGS, mergeBase()]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return [...new Set([...tracked, ...untracked])];
}
