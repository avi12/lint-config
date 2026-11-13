const WINDOWS_BUDGET = 6000;
const DEFAULT_BUDGET = 100000;
const BUDGET_ENV = "AVI12_LINT_ARG_BUDGET";

/**
 * The character budget for the file arguments of one command: small on win32, whose command line is capped at
 * 8191 characters, larger elsewhere; `AVI12_LINT_ARG_BUDGET` overrides it.
 */
export function argumentBudget({ platform, env = {} }) {
  const override = Number(env[BUDGET_ENV]);
  const isOverridden = Number.isInteger(override) && override > 0;
  if (isOverridden) {
    return override;
  }

  return platform === "win32" ? WINDOWS_BUDGET : DEFAULT_BUDGET;
}

/**
 * Splits `{ head, files, tail }` into commands whose file arguments each fit the budget (a file is counted with its
 * separator and quotes); a step with no files, or whose files fit, stays one command.
 */
export function batchCommands({ head, files, tail, budget }) {
  const batches = [];
  let current = [];
  let used = 0;
  for (const file of files) {
    const cost = file.length + 3;
    const isFull = current.length > 0 && used + cost > budget;
    if (isFull) {
      batches.push(current);
      current = [];
      used = 0;
    }

    current.push(file);
    used += cost;
  }

  const isRemainderPending = current.length > 0 || batches.length === 0;
  if (isRemainderPending) {
    batches.push(current);
  }

  return batches.map(batch => [...head, ...batch, ...tail]);
}

/**
 * Runs the commands one after another through `runOne` (which resolves 0 or 1) and merges the exit codes: 1 if any
 * failed, and every batch still runs so one pass lists every finding.
 */
export async function runSequentially({ commands, runOne }) {
  let merged = 0;
  for (const [index, command] of commands.entries()) {
    const code = await runOne({
      command,
      isFirst: index === 0
    });
    merged = Math.max(merged, code);
  }

  return merged;
}
