const KEY_LINE = /^\s*("[^"]+"|'[^']+'|[A-Za-z0-9_.-]+)\s*=\s*(.*)$/;
const TABLE_LINE = /^\s*\[([^[\]]+)\]\s*(?:#.*)?$/;

function bracketBalance(text) {
  let balance = 0;
  let quote = "";
  for (const character of text) {
    if (quote) {
      quote = character === quote ? "" : quote;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "#") {
      break;
    } else if (character === "[" || character === "{") {
      balance += 1;
    } else if (character === "]" || character === "}") {
      balance -= 1;
    }
  }

  return balance;
}

/**
 * Reads the flat TOML the presets use (tables of `key = value`, a value on one line or a bracketed one over several)
 * into `Map<table, Map<key, { value, comments }>>`; the top level is the table `""`, `comments` are the lines
 * directly above a key and `value` is its text unchanged. Pure.
 */
export function parseFlatToml(text) {
  const tables = new Map([["", new Map()]]);
  let table = tables.get("");
  let comments = [];
  let open;
  for (const line of text.split(/\r?\n/)) {
    if (open) {
      open.entry.value += `\n${line}`;
      open.balance += bracketBalance(line);
      open = open.balance > 0 ? open : undefined;
      continue;
    }

    const tableMatch = TABLE_LINE.exec(line);
    const keyMatch = KEY_LINE.exec(line);
    if (tableMatch) {
      table = tables.get(tableMatch[1]) ?? new Map();
      tables.set(tableMatch[1], table);
      comments = [];
    } else if (keyMatch) {
      const entry = {
        value: keyMatch[2].trim(),
        comments
      };
      table.set(keyMatch[1], entry);
      const balance = bracketBalance(keyMatch[2]);
      open =
        balance > 0
          ? {
              entry,
              balance
            }
          : undefined;
      comments = [];
    } else if (line.trim().startsWith("#")) {
      comments = [...comments, line.trim()];
    } else {
      comments = [];
    }
  }

  return tables;
}

/** Layers `local` over `base`: a key of the same table replaces the base's, comments included. Pure. */
export function mergeFlatToml({ base, local }) {
  const merged = new Map([...base].map(([table, entries]) => [table, new Map(entries)]));
  for (const [table, entries] of local) {
    const target = merged.get(table) ?? new Map();
    merged.set(table, target);
    for (const [key, entry] of entries) {
      target.set(key, entry);
    }
  }

  return merged;
}

/** Writes the entries of one table as lines, each entry's comments first. Pure. */
export function renderEntries(entries) {
  return [...entries].flatMap(([key, { value, comments }]) => [...comments, `${key} = ${value}`]);
}
