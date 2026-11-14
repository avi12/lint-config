import { posix } from "node:path";

const HEX_RADIX = 16;
const HEX_ESCAPE_LENGTH = 4;
const ESCAPES = {
  n: "\n",
  t: "\t",
  r: "\r",
  0: "\0"
};

function readQuoted({ text, start }) {
  const quote = text[start];
  let value = "";
  let index = start + 1;
  while (index < text.length) {
    const character = text[index];
    const isEscape = quote === '"' && character === "\\";
    const isDoubled = quote === "'" && character === "'" && text[index + 1] === "'";
    if (isDoubled) {
      value += "'";
      index += 2;
    } else if (isEscape) {
      const next = text[index + 1];
      const hex = /^x([0-9A-Fa-f]{2})/.exec(text.slice(index + 1, index + HEX_ESCAPE_LENGTH));
      value += hex ? String.fromCharCode(Number.parseInt(hex[1], HEX_RADIX)) : (ESCAPES[next] ?? next);
      index += hex ? HEX_ESCAPE_LENGTH : 2;
    } else if (character === quote) {
      return {
        value,
        end: index + 1
      };
    } else {
      value += character;
      index += 1;
    }
  }

  return {
    value,
    end: index
  };
}

function readScalar({ text, start }) {
  const isQuoted = text[start] === "'" || text[start] === '"';
  if (isQuoted) {
    return readQuoted({
      text,
      start
    });
  }

  const end = text.indexOf("\n", start);
  const stop = end === -1 ? text.length : end;
  return {
    value: text.slice(start, stop).trim(),
    end: stop
  };
}

/**
 * One spelling of a file path: forward slashes, `..` and `.` segments resolved, an upper-case drive letter. A unit in
 * `test/` reports a header it includes as `test/../src/x.h`, which is the same file as `src/x.h`. Pure.
 */
export function canonicalPath(path) {
  const normalized = posix.normalize(path.replaceAll("\\", "/"));
  return normalized.replace(/^[a-z]:/, drive => drive.toUpperCase());
}

function replacementsOf(block) {
  const replacements = [];
  const entry = /^\s*- FilePath:\s*/gm;
  const body = /\s*Offset:\s*(\d+)\s*Length:\s*(\d+)\s*ReplacementText:\s*/y;
  for (let match = entry.exec(block); match !== null; match = entry.exec(block)) {
    const file = readScalar({
      text: block,
      start: entry.lastIndex
    });
    body.lastIndex = file.end;
    const numbers = body.exec(block);
    if (!numbers) {
      continue;
    }

    const text = readScalar({
      text: block,
      start: body.lastIndex
    });
    replacements.push({
      file: canonicalPath(file.value),
      offset: Number(numbers[1]),
      length: Number(numbers[2]),
      text: text.value
    });
    entry.lastIndex = text.end;
  }

  return replacements;
}

/**
 * The fixable diagnostics of a clang-tidy `--export-fixes` YAML file, each as `{ replacements }` with every
 * replacement `{ file, offset, length, text }` (offsets in bytes of the file as it was when the unit ran). A
 * diagnostic is one atomic fix: its replacements are applied together or not at all. Pure.
 */
export function parseFixes(yaml) {
  return yaml
    .split(/^ {2}- DiagnosticName:/m)
    .slice(1)
    .map(block => ({
      replacements: replacementsOf(block)
    }))
    .filter(({ replacements }) => replacements.length > 0);
}

function isSame({ one, two }) {
  return one.offset === two.offset && one.length === two.length && one.text === two.text;
}

function isConflicting({ one, two }) {
  const isInsertionClash = one.offset === two.offset && (one.length === 0 || two.length === 0);
  const isOverlap = one.offset < two.offset + two.length && two.offset < one.offset + one.length;
  const isIdentical = isSame({
    one,
    two
  });
  return !isIdentical && (isInsertionClash || isOverlap);
}

/**
 * Merges the fixes of every unit into one conflict-free list per file, as `clang-apply-replacements` does: a
 * diagnostic that every unit repeats (a header fix) is applied once, and a diagnostic with a replacement that
 * overlaps one already accepted is dropped whole, never partly. Takes `diagnostics` from `parseFixes`; returns a
 * Map of file to replacements sorted by offset. Pure.
 */
export function mergeReplacements(diagnostics) {
  const accepted = new Map();
  for (const { replacements } of diagnostics) {
    const isRejected = replacements.some(replacement =>
      (accepted.get(replacement.file) ?? []).some(other =>
        isConflicting({
          one: replacement,
          two: other
        })
      )
    );
    if (isRejected) {
      continue;
    }

    for (const replacement of replacements) {
      const list = accepted.get(replacement.file) ?? [];
      const isKnown = list.some(other =>
        isSame({
          one: replacement,
          two: other
        })
      );
      accepted.set(replacement.file, isKnown ? list : [...list, replacement]);
    }
  }

  return new Map(
    [...accepted].map(([file, list]) => [
      file,
      [...list].sort((one, two) => one.offset - two.offset || one.length - two.length)
    ])
  );
}

/** Applies sorted, non-overlapping replacements to the bytes of a file. Pure. */
export function applyReplacements({ bytes, replacements }) {
  const parts = [];
  let position = 0;
  for (const { offset, length, text } of replacements) {
    parts.push(bytes.subarray(position, offset), Buffer.from(text));
    position = offset + length;
  }

  parts.push(bytes.subarray(position));
  return Buffer.concat(parts);
}
