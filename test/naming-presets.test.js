import assert from "node:assert/strict";
import { test } from "node:test";

import { namingFindings } from "./support/tools.js";

const MANIFEST = "export const manifest = { default_locale: 'en', web_accessible_resources: [] };\n";
const MESSAGES = "export const messages = { ExtensionName: 'x', Greeting_Hello: 'y' };\n";
const HOOKS = "export const hooks = { 'build:publicAssets'() {}, 'build:done': () => {} };\n";

function findings({ options, source }) {
  return namingFindings({
    options,
    source
  });
}

test("webextension-manifest allows snake_case keys and nothing else changes", () => {
  assert.ok(
    findings({
      options: {},
      source: MANIFEST
    }).length > 0
  );
  assert.deepEqual(
    findings({
      options: {
        presets: ["webextension-manifest"]
      },
      source: MANIFEST
    }),
    []
  );
  const camel = "export const manifest = { someKey_Bad: 1 };\n";
  assert.ok(
    findings({
      options: {
        presets: ["webextension-manifest"]
      },
      source: camel
    }).length > 0
  );
});

test("webextension-messages allows PascalCase message names", () => {
  assert.ok(
    findings({
      options: {},
      source: MESSAGES
    }).length > 0
  );
  assert.deepEqual(
    findings({
      options: {
        presets: ["webextension-messages"]
      },
      source: MESSAGES
    }),
    []
  );
});

test("hook-names allows colon-style hook methods", () => {
  assert.ok(
    findings({
      options: {},
      source: HOOKS
    }).length > 0
  );
  assert.deepEqual(
    findings({
      options: {
        presets: ["hook-names"]
      },
      source: HOOKS
    }),
    []
  );
});

test("allowedPatterns takes a regex and demands a reason", () => {
  const allowed = {
    allowedPatterns: [
      {
        pattern: "^x_",
        reason: "vendor keys"
      }
    ]
  };
  assert.deepEqual(
    findings({
      options: allowed,
      source: "export const o = { x_y: 1 };\n"
    }),
    []
  );
  const unreasoned = { allowedPatterns: [{ pattern: "^x_" }] };
  assert.ok(
    findings({
      options: unreasoned,
      source: "export const o = { x_y: 1 };\n"
    }).length > 0
  );
});

test("an unknown preset fails loudly", () => {
  assert.ok(
    findings({
      options: {
        presets: ["nope"]
      },
      source: MANIFEST
    }).length > 0
  );
});

const ENUM_LIKE = "export const Mode = { Fast: 'f', SLOW: 's' } as const;\n";
const LOOKUP = "export const labels = { Fast: 'x', SomeKey: 1 };\n";
const SVELTEKIT = "export const ssr = false;\nexport const prerender = true;\nexport const trailingSlash = 'always';\n";

test("only the members of an enum-like as const object must be UPPER_CASE", () => {
  const found = findings({
    options: {},
    source: ENUM_LIKE
  });
  assert.equal(found.length, 1);
  assert.deepEqual(
    findings({
      options: {},
      source: LOOKUP
    }),
    []
  );
});

test("the sveltekit preset exempts the route options in route files only", () => {
  const options = { presets: ["sveltekit"] };
  assert.ok(
    namingFindings({
      options: {},
      source: SVELTEKIT,
      filename: "+layout.ts"
    }).length > 0
  );
  assert.deepEqual(
    namingFindings({
      options,
      source: SVELTEKIT,
      filename: "+layout.ts"
    }),
    []
  );
  assert.ok(
    namingFindings({
      options,
      source: SVELTEKIT,
      filename: "other.ts"
    }).length > 0
  );
});

test("numeric config objects stay free-form; enum-likeness needs strings, or exported numbers with a union alias", () => {
  const check = source =>
    findings({
      options: {},
      source
    }).length;
  assert.equal(check("export const range = { min: 0, max: 10, step: 1 } as const;\n"), 0);
  assert.equal(check("const range = { min: 0, max: 10 } as const;\nexport const x = range;\n"), 0);
  assert.equal(check("export const Mixed = { min: 0, label: 'a' } as const;\n"), 0);
  assert.equal(
    check(
      "export const Level = { low: 0, HIGH: 1 } as const;\nexport type Level = typeof Level[keyof typeof Level];\n"
    ),
    1
  );
  assert.equal(check("const Level = { low: 0 } as const;\nexport type Level = typeof Level[keyof typeof Level];\n"), 0);
  assert.equal(check("export const Mode = { fast: 'f' } as const;\n"), 1);
});
