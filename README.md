# lint-config

Shared lint configuration for avi12's repositories, as plain JS, JSON and CSS
packages with no build step
They are consumed straight from GitHub and never published to npm

## Packages

| Package | What it is |
|---|---|
| `packages/oxlint-config` | oxlint preset: correctness, Google style rules, `@/` imports with `../` banned, any lint-disable text is an error, and the former ESLint rules as JS plugins (unused imports, sorting, stylistic layout, the house rules); `library.json` adds the JSDoc and tree-shaking rules for `src/`; `wxt.json` for WXT extensions |
| `packages/oxlint-plugin-naming` | `naming/convention` for oxlint's JS plugin API, with `allowedNames` and `fileOverrides` that each carry a reason |
| `packages/oxfmt-config` | oxfmt preset: formatting and import order |
| `packages/eslint-config` | ESLint flat config for Svelte files only: the template rules oxlint and oxfmt cannot see; a TypeScript-only repo needs no ESLint |
| `packages/stylelint-config` | stylelint preset for CSS and Svelte or HTML style blocks |
| `packages/fallow-config` | fallow preset for the dead-code audit |
| `packages/biome-config` | optional and minimal: only `noFloatingPromises` |
| `packages/avi12-lint` | `avi12-lint` runs the tools one after another |

## Install

Every package installs from a tag of this repository

```sh
pnpm add -D "oxlint-config-avi12@github:avi12/lint-config#v0.4.9&path:/packages/oxlint-config"
pnpm add -D "oxlint-plugin-naming@github:avi12/lint-config#v0.4.9&path:/packages/oxlint-plugin-naming"
pnpm add -D "oxfmt-config-avi12@github:avi12/lint-config#v0.4.9&path:/packages/oxfmt-config"
pnpm add -D "eslint-config-avi12@github:avi12/lint-config#v0.4.9&path:/packages/eslint-config"
pnpm add -D "stylelint-config-avi12@github:avi12/lint-config#v0.4.9&path:/packages/stylelint-config"
pnpm add -D "fallow-config-avi12@github:avi12/lint-config#v0.4.9&path:/packages/fallow-config"
pnpm add -D "avi12-lint@github:avi12/lint-config#v0.4.9&path:/packages/avi12-lint"
```

Add only the ones you use; `avi12-lint` runs whichever tools have a config file
Install `oxlint`, `oxfmt`, `eslint` and `stylelint` yourself; they are peers


## Use

oxlint, including the naming rule

```json
{
  "extends": [
    "./node_modules/oxlint-config-avi12/oxlint.json",
    "./node_modules/oxlint-plugin-naming/preset.json"
  ],
  "rules": {
    "naming/convention": ["error", {
      "allowedNames": [{ "reason": "The manifest spells it so", "names": ["manifest_version"] }],
      "fileOverrides": [{ "reason": "Mirrors an external API", "files": ["src/api.ts"] }]
    }]
  }
}
```

- `allowedNames` exempts exact identifiers, `fileOverrides` exempts whole files
- Every entry needs a `reason`; an entry without one makes the rule fail loudly
- `presets` exempts keys that an outside format dictates: `webextension-manifest` (snake_case manifest keys), `webextension-messages` (PascalCase message names), `hook-names` (colon-style names such as `build:publicAssets`), `sveltekit` (`ssr`, `csr`, `prerender` and `trailingSlash`, only in `+page`/`+layout` route files, `.server` ones included)
- Enum-like objects follow the project pattern: in `export const X = { A: "a" } as const` with only literal values every member must be `UPPER_CASE`; the keys of any other object (a PascalCase lookup, for example) may be camelCase, `UPPER_CASE` or PascalCase
- `allowedPatterns` is the same with your own regex: `[{ "pattern": "^x_", "reason": "vendor keys" }]`

Presets for oxlint: `oxlint-config-avi12/browser.json` adds the browser globals, `oxlint-config-avi12/webextension.json` adds the extension globals (`chrome`, `browser`) on top of it, `oxlint-config-avi12/wxt.json` adds WXT's default exports in `entrypoints/` and in `*.d.ts` on top of that (`wxt.config.ts` is already exempt)

oxlint for a library: extend `oxlint-config-avi12/library.json` instead, which adds JSDoc on the public API and the tree-shaking rules for `src/**/*.ts` and leaves tests out

- `house/positional-parameters` is the "2+ parameters take one destructured object" rule alone, so one override turns it off for code that mirrors a third-party signature:
  `"overrides": [{ "files": ["vendor/**"], "rules": { "house/positional-parameters": "off" } }]`

ESLint, only when the repo has `.svelte` files

```js
import { svelte } from "eslint-config-avi12/svelte";

export default svelte();
```

- `svelte({ ignores, overrides })` is the whole config: install `eslint`, `eslint-plugin-svelte`, `svelte-eslint-parser` and `typescript`
- A repo without Svelte files has no `eslint.config.js` and no ESLint dependency at all

Other presets: `extends` the JSON of `stylelint-config-avi12` and
`fallow-config-avi12`, and pass `oxfmt-config-avi12/oxfmt.json` to `oxfmt -c`

### Rules every consumer meets

- Array types are `T[]` everywhere, including `{ ... }[]`; oxlint's `array-type` is set to `array`, so no tool asks for `Array<{ ... }>`
- A lone comparison against a literal, `null` or `undefined` (`value === null`) stays inline in an `if`; any other comparison or a compound condition goes into a named boolean
- Imports use `@/path` from the project root; a `../` import is an error
  Map the alias in `tsconfig.json` (`"paths": { "@/*": ["./src/*"] }`)
- No disable comments: `eslint-disable`, `oxlint-disable`, `@ts-ignore` and `@ts-nocheck` are errors wherever they appear, and the Svelte ESLint layer ignores inline directives
  Fix the code, or add an `allowedNames` or `fileOverrides` entry with a reason
- `any` and a bare `@ts-expect-error` are errors in `.ts` and in the script of `.svelte`; oxlint reads both

### The `@/` alias in a repository with several packages

Packages that share one TypeScript program or one Vite build clash on a bare `@/`, since it can point at only one root
Give each package its own `paths` entry and its own Vite alias, with `@` at that package's root; the lint rule is unchanged

```json
{
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"] }
  }
}
```

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }
  }
});
```

Where one program or one build must see several packages, keep `@/` for the package itself and add package-scoped names such as `@shared/` and `@vscode/`, each mapped the same way in `paths` and in `resolve.alias`

## Who owns what

- oxlint: every native rule, plus open-source ESLint plugins loaded through `jsPlugins` (`eslint-plugin-unused-imports`, `eslint-plugin-perfectionist`, `@stylistic/eslint-plugin`, `eslint-plugin-jsdoc`), plus the `house` plugin of this repository; all of it runs on `.ts` and on the script of `.svelte`
- oxfmt: formatting and import order for `.ts`, `.js`, `.json` and the rest it supports
- ESLint: only what needs the Svelte template AST (`svelte/*`, `local/expand-svelte-block`, `local/no-padded-tag`, the ban on a ternary in a template tag), and an em dash check over the whole `.svelte` file, markup included; oxfmt does not format `.svelte`, so `svelte/indent` and the other Svelte layout rules own the markup
- Biome: optional, only `noFloatingPromises`; leave it out unless you need that one rule
- No tool sees type information except oxlint's type-aware rules; `naming/convention` reads syntax only

| Former ESLint rule | Now |
|---|---|
| `unused-imports/no-unused-imports`, `perfectionist/*`, `@stylistic/*` | the same plugins through oxlint `jsPlugins` |
| `jsdoc/require-jsdoc`, `require-description`, `no-types` | `eslint-plugin-jsdoc` as `jsdoc-js/*`; oxlint's own `jsdoc` plugin keeps the name `jsdoc`; `check-tag-names` is the native one |
| `local/expand-nested-object-expression`, `expand-nested-type-literal`, `multiline-arg-paren-newline`, `no-em-dash` | `house/*` in oxlint (the same rule code) |
| `no-restricted-syntax` selectors | `house/google-syntax`, `house/house-syntax`, `house/positional-parameters`, `house/tree-shaking`; esquery selectors work in an oxlint JS plugin |
| `.forEach` and `.reduce` bans | `unicorn/no-array-for-each`, `unicorn/no-array-reduce` |
| the `Reflect` ban | `no-restricted-globals` |
| `import-newlines`, the `formatter: "eslint"` layout rules | dropped: oxfmt formats |

### Migrating from 0.4.9

- The `../` import ban now matches every depth: `../a/b.ts`, `../../x`, a bare `..` and dynamic `import("../x")` are errors, where only `../x` was before; replace them with `@/path` imports
- The stylelint preset keeps the value of a `-winui-*` property as written (`-winui-based-on: CaptionTextBlockStyle`); `value-keyword-case` still applies to every other property

### Migrating from 0.4.8

- Run `avi12-lint --fix` once: `object-shorthand` (oxlint, native, with `avoidExplicitReturnArrows`) turns a property whose value is a block-bodied arrow into a method, including quoted and computed keys, `async` and typed parameters; an arrow that uses `this` and an expression-bodied arrow stay as they are
- `reportUnusedDisableDirectives` is `off`: disable comments are banned by `no-warning-comments`, and oxlint reported "unused directive" inside ignored folders that carry their own `.oxlintrc.json` (a git submodule such as `companion/winui`); `ignorePatterns` of the root config does not reach a nested config, so for a submodule with its own config run `oxlint --disable-nested-config` or delete the nested config
- A unicode escape of the em dash survives every fixer (a test covers oxlint, oxfmt and ESLint); a literal em dash in the file you wrote came from the editor, not from a fixer

### Migrating from 0.4.7

- `avi12-lint --staged` and `--changed` split the file arguments of oxlint, ESLint, stylelint and oxfmt into batches under a character budget (6000 on Windows, whose command line stops at 8191 characters, 100000 elsewhere), so about 150 or more files no longer fail with "The command line is too long"; set `AVI12_LINT_ARG_BUDGET` to change it
- Batches of one step run one after another, and a step fails if any batch failed; `avi12-lint` exits 0 when every step passed and 1 when any step failed

### Migrating from 0.4.6

- `@stylistic/function-paren-newline` is dropped from the oxlint preset: oxfmt owns the parentheses of multi-line calls and arrows, and the two rules looped; delete any override that restates it
- `house/expand-nested-type-literal` leaves the type literal of a parameter to oxfmt in method signatures, function and constructor types, call and construct signatures and arrow parameters, as it already did for functions
- `house/google-syntax` allows a written return type of `never` and an assertion signature (`asserts value is string`), beside type predicates
- `avi12-lint --staged` and `--changed` pass only the selected files to oxlint, ESLint, stylelint and oxfmt (check mode); oxfmt formats only the extensions it supports and is skipped when none changed
- `fallow audit` runs only with `--changed`, as `fallow audit --base <merge base with main>`; `--staged` skips it and prints a message, since the index has no base
- `avi12-lint` never installs or rewrites a Git hook, and declares no install scripts; a `.git/hooks/pre-commit` that changes on `pnpm install` comes from the consumer's own `prepare` script (`simple-git-hooks` or `husky`), so remove that script or its config to stop it

### Migrating from 0.4.5

- `house/google-syntax` leaves a lone comparison inline (`status === PlayerStatus.PLAYING`, `value instanceof Date`, `left === right`), like a lone `x === null`
- `house/google-syntax` no longer reports a compound whose operands are only truthiness tests of identifiers or member chains (`!a || !b`, `a && b.c`) or narrowing checks; a call, or several comparisons that do not narrow, is still reported
- `id-length` already allows `_`, `i`, `j`, `x`, `y`, `id`, `to`, `on`, `ok` and `T` in the preset; to allow one more name, such as an interface `FS` merged with a third-party type, restate the rule in an oxlint override with the full list, because options replace and do not merge: `"id-length": ["error", { "min": 3, "exceptions": ["_", "i", "j", "x", "y", "id", "to", "on", "ok", "T", "FS"], "properties": "never" }]`; keep the reason in the override's neighbouring config notes, not in a comment

### Migrating from 0.4.4

- The Node heap cap does not reach the native `fallow` binary, which ran to 38 GB in a repo that ships js-dos files; `avi12-lint` now watches the spawned fallow process tree every second and terminates exactly that tree (`taskkill /T /F /PID` on Windows, `kill -9` of the tree elsewhere, never by name) past 4096 MB or 300 s, and fails the step with a message
- `AVI12_LINT_FALLOW_MEMORY_MB` and `AVI12_LINT_FALLOW_TIME_LIMIT_MS` change the limits
- `fallow-config-avi12` ignores `**/*.wasm`, `**/*.jsdos`, `**/*.min.js`, `**/vendor/**`, `**/.output/**`, `**/.wxt/**`; a repo that analyses vendored code on purpose overrides `ignorePatterns`

### Migrating from 0.4.3

- `avi12-lint` no longer declares `eslint-config-avi12` as a peer, which does not exist on npm and failed to install in repos without Svelte files; the concurrency and cache flags now live in `avi12-lint/eslint-flags`, and `eslint-config-avi12/defaults` and its re-exports (`clampConcurrency`, `eslintFlags` and the constants) are gone; only `IGNORES` stays
- `avi12-lint --fix` ends with oxfmt, after the last oxlint pass, and plans oxfmt when only its binary is installed, so no odd indentation or trailing space is left
- oxfmt hugs a function parameter's type literal onto the parameter line, which `house/expand-nested-type-literal` expanded again forever; the rule now leaves parameter types to oxfmt, and `@stylistic/object-property-newline` is dropped, since the house rules already own property layout and its fix split members mid-line; the fixture of `test/clash.test.js` holds a type literal, a nested object and a parameter type, so oxfmt and oxlint settle in either order
- `fallow audit` in `--changed` and `--staged` runs with `NODE_OPTIONS=--max-old-space-size=4096` (added to any `NODE_OPTIONS` you set), because it once grew to 38 GB on a dirty tree

### Migrating from 0.4.1

- `house/expand-nested-object-expression` now replaces the gap between tokens, so its fixes leave no odd indent or trailing space
- `house/google-syntax` no longer reports a compound condition whose operands are all narrowing checks (`===` or `!==` against a literal, `typeof`, `in`, `instanceof`), up to four levels of `&&` and `||`, because extracting it into a named boolean breaks TypeScript narrowing of a union; a compound condition with any other operand is still reported

### Migrating from 0.4.0

- `no-magic-numbers` is now `house/no-magic-numbers`: a numeric literal type is exempt anywhere (`Exclude<T, 720 | 480>`), a literal inside a `const` initializer, an enum member, a class property or a `parseInt` radix is named already, and `0`, `1`, `-1` and `2` are allowed
  Turn it off for files with an oxlint override of `house/no-magic-numbers`
- oxlint no longer judges unused imports or variables in `.svelte` files, since it sees the script block and not the markup
  The Svelte ESLint layer owns them: `unused-imports/no-unused-imports` runs there with the template in view, and `eslint-config-avi12` now depends on `eslint-plugin-unused-imports`
- `avi12-lint` passes oxfmt your `.gitignore` and `.prettierignore` and the preset's default ignore set: `.claude`, `_locales`, `locales`, lock files, `.wxt`, `.output`, `.svelte-kit`, `dist`, `build` and `coverage`
  oxfmt has no `extends`, so a copied `.oxfmtrc.json` cannot inherit them; the runner reads `ignorePatterns` from `oxfmt-config-avi12/oxfmt.json`
  Add more with `ignorePatterns` in your `.oxfmtrc.json`, or a line in `.gitignore` or `.prettierignore`

### Migrating from 0.3.0

- Drop from `devDependencies` when the repo has no `.svelte` files: `eslint`, `eslint-config-avi12`, `eslint-plugin-svelte`, `svelte-eslint-parser`, and delete `eslint.config.js`
- With `.svelte` files keep `eslint`, `eslint-config-avi12`, `eslint-plugin-svelte`, `svelte-eslint-parser` and `typescript`, and write `export default svelte();`; `base()` and the `formatter` option are gone
- `eslint-plugin-unused-imports`, `eslint-plugin-perfectionist`, `@stylistic/eslint-plugin`, `eslint-plugin-jsdoc`, `eslint-plugin-import-newlines` and `typescript-eslint` are never yours to install: `oxlint-config-avi12` carries the ones it needs
- Keep `oxlint` at 1.90 or later; the plugins load from the files in `oxlint-config-avi12/plugins`
- `allowPositionalParameters` becomes an oxlint override of `house/positional-parameters`; `sourceFiles: []` becomes extending `oxlint.json` instead of `library.json`
- Run `avi12-lint --fix` once; it runs oxlint, oxfmt and oxlint again, since one oxlint pass leaves fixes that overlap

## Runner

`avi12-lint` plans a tool only when its config file or binary exists
Default run: oxlint (type-aware through `tsrs-lint` when installed), `tsrs --noEmit` when installed,
stylelint, oxfmt and ESLint
ESLint is planned only when `eslint.config.js` exists and the repo holds a `.svelte` file, and it gets the Svelte files alone
It starts first because it is the one that peaks in memory, and the light tools run beside it
Output is printed per tool when it finishes, so lines never interleave

| Flag | Effect |
|---|---|
| `--fix` | fixes instead of checking; tools then run one after another, so fixers never race |
| `--changed` | only the files that differ from the merge base with `main`, plus untracked ones; fallow audits against that base |
| `--staged` | only the staged files, for lint-staged; fallow is skipped |
| `--concurrency N` | ESLint workers, clamped to 1-4 |

- `AVI12_LINT_CONCURRENCY` is the same as `--concurrency`, and the flag wins
- ESLint runs at concurrency 2 (1 with `--changed` or `--staged`) with `--cache --cache-strategy content`,
  stored in `.verify/eslint-cache/`; add `.verify/` to `.gitignore`
- With `--changed` or `--staged`, oxlint, ESLint, stylelint and oxfmt get the file list, and `fallow audit --base` gets the merge base (`--changed` only);
  tsrs checks the whole project, as a type error can sit in an untouched file
- A tool with no matching changed file is skipped
- `fallow audit` runs with its Node heap capped at 4 GB (`--max-old-space-size=4096`), a guard against a runaway audit on a dirty tree

### Measured on a 2263-file TypeScript and Svelte codebase

| Run | Time | Peak memory |
|---|---|---|
| ESLint concurrency 2, content cache, cold | 13.8 s | 1.7 GB |
| ESLint concurrency 2, content cache, warm | 6.8 s | 0.6 GB |
| ESLint concurrency auto | little faster | 5.5-6 GB |
| oxlint type-aware | 2 s | n/a |
| `tsrs --noEmit` | 0.8 s | n/a |
| changed files only | about 3 s | under 1 GB |

Concurrency 2 is the sweet spot: `auto` costs three times the memory for little gain

### Measured on a small fixture

150 TypeScript files and 10 Svelte files, run one after another, no cache

| Setup | ESLint | oxlint | oxfmt | Peak memory |
|---|---|---|---|---|
| 0.3.0: ESLint on everything | 3.5-4.9 s | 0.35 s | 0.25 s | 250-270 MB |
| 0.4.0: ESLint on Svelte only | 2.0-2.2 s | 2.0-2.1 s | 0.25 s | 205-215 MB |
| 0.4.0, no Svelte files | not started | 2.0-2.1 s | 0.25 s | 205-215 MB |

The work moved into oxlint, which pays about 0.3-0.7 s to load each JS plugin; the sequential total is about the same, the peak is lower, and a TypeScript-only repo loses the ESLint run altogether

### Why not the GPU

It was tested and rejected
- No GPU linters exist; parsing and rule logic are branchy, serial work
- The one step a GPU could take is hashing for the cache, and hashing is 30 times cheaper than reading the files
- The machine plays VRAM-heavy games, and lint must never compete with them

## Tests

`pnpm test` lints small fixtures at concurrency 1; the runner tests only build plans and run nothing
- parity: ESLint reports nothing on a `.ts` file, oxlint reports the same with and without Svelte files, and oxlint bans `any` in the script of a `.svelte` file
- clash: no rule is enforced by both ESLint and oxlint, no opposing pair is on,
  one layout rule owns each aspect of a Svelte file, and oxlint, oxfmt and ESLint fixing settles
  to one result in both fixer orders
- naming: `allowedNames`, `allowedPatterns`, `presets` and `fileOverrides` work and demand a reason
- presets: the browser and webextension globals, the library preset and the positional-parameters override, the former ESLint rules running in oxlint
- runner: the plan (default, fix, changed, staged, type-aware, overrides), and the concurrency clamp

CI runs the same on every push (`.github/workflows/ci.yml`)
