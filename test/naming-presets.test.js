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
  }), []
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
  }), []
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
  }), []
  );
});

test("allowedPatterns takes a regex and demands a reason", () => {
  const allowed = {
 allowedPatterns: [{
     pattern: "^x_",
     reason: "vendor keys" 
  }] 
};
  assert.deepEqual(
    findings({
     options: allowed,
     source: "export const o = { x_y: 1 };\n" 
  }), []
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
