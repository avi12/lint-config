const TSGO_LOOKUP = `function tryParseTsGoVersion(tsconfigPath) {
    const pkg = tryParsePkg(tsconfigPath, '@typescript/native') ??
        tryParsePkg(tsconfigPath, '@typescript/native-preview');`;

const TSRS_LOOKUP = `function tryParseTsGoVersion(tsconfigPath) {
    const tsrs = tryParsePkg(tsconfigPath, 'tsrs');
    if (tsrs && tsrs.pkgJsonName === 'tsrs') {
        return tsrs;
    }
    const pkg = tryParsePkg(tsconfigPath, '@typescript/native') ??
        tryParsePkg(tsconfigPath, '@typescript/native-preview');`;

const TSGO_BIN = "const binPathRelative = pkg.bin[pkg.pkgJsonName === '@typescript/native-preview' ? 'tsgo' : 'tsc'];";

const TSRS_BIN = `const binNames = { 'tsrs': 'tsrs', '@typescript/native-preview': 'tsgo' };
    const binPathRelative = pkg.bin[binNames[pkg.pkgJsonName] ?? 'tsc'];`;

const REPLACEMENTS = [
  [TSGO_LOOKUP, TSRS_LOOKUP],
  [TSGO_BIN, TSRS_BIN]
];

/**
 * svelte-check's `--tsgo` mode type-checks the Svelte files it transpiles with a TypeScript 7 compiler it finds by
 * name (`@typescript/native`, `@typescript/native-preview`). This lets it find tsrs, which takes the same command
 * line, first. It throws when svelte-check's source no longer has the code it rewrites, so a changed release fails
 * loudly instead of silently falling back. Pure.
 */
export function patchSvelteCheck(source) {
  let patched = source;
  for (const [original, replacement] of REPLACEMENTS) {
    if (!patched.includes(original)) {
      throw new Error("svelte-check's tsgo lookup changed: avi12-lint svelte-check needs an update for this version");
    }

    patched = patched.replace(original, replacement);
  }

  return patched;
}
