import assert from "node:assert/strict";
import { test } from "node:test";

import { patchSvelteCheck } from "../packages/avi12-lint/src/svelte-check.js";

const SVELTE_CHECK_SOURCE = `function tryParseTsGoVersion(tsconfigPath) {
    const pkg = tryParsePkg(tsconfigPath, '@typescript/native') ??
        tryParsePkg(tsconfigPath, '@typescript/native-preview');
    return pkg;
}
function getTsGoBinPath(tsconfigPath) {
    const pkg = tryParseTsGoVersion(tsconfigPath);
    const binPathRelative = pkg.bin[pkg.pkgJsonName === '@typescript/native-preview' ? 'tsgo' : 'tsc'];
    return binPathRelative;
}`;

test("tsrs is looked up before the Go compiler, and its bin is the one run", () => {
  const patched = patchSvelteCheck(SVELTE_CHECK_SOURCE);

  assert.ok(patched.indexOf("tryParsePkg(tsconfigPath, 'tsrs')") < patched.indexOf("'@typescript/native'"));
  assert.ok(patched.includes("{ 'tsrs': 'tsrs', '@typescript/native-preview': 'tsgo' }"));
  assert.ok(!patched.includes("? 'tsgo' : 'tsc'];"));
});

test("the patched source is still valid JavaScript", () => {
  assert.doesNotThrow(() => new Function(patchSvelteCheck(SVELTE_CHECK_SOURCE)));
});

test("a svelte-check whose lookup changed is rejected instead of left half-patched", () => {
  assert.throws(() => patchSvelteCheck("function somethingElse() {}"), /lookup changed/);
});
