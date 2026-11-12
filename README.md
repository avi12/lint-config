# lint-config

Shared lint configuration for avi12's repositories, as plain JS, JSON and CSS
packages with no build step
They are consumed straight from GitHub and never published to npm

## Packages

| Package | What it is |
|---|---|
| `packages/oxlint-config` | oxlint preset: correctness, Google style rules, `@/` imports with `../` banned, any lint-disable text is an error; `wxt.json` for WXT extensions |
| `packages/oxlint-plugin-naming` | `naming/convention` for oxlint's JS plugin API, with `allowedNames` and `fileOverrides` that each carry a reason |
| `packages/oxfmt-config` | oxfmt preset: formatting and import order |
| `packages/eslint-config` | ESLint flat config: only what oxlint and oxfmt cannot do, plus an optional Svelte layer |
| `packages/stylelint-config` | stylelint preset for CSS and Svelte or HTML style blocks |
| `packages/fallow-config` | fallow preset for the dead-code audit |
| `packages/biome-config` | optional and minimal: only `noFloatingPromises` |
| `packages/avi12-lint` | `avi12-lint` runs the tools one after another |

## Install

Every package installs from a tag of this repository

```sh
pnpm add -D "oxlint-config-avi12@github:avi12/lint-config#v0.3.0&path:/packages/oxlint-config"
pnpm add -D "oxlint-plugin-naming@github:avi12/lint-config#v0.3.0&path:/packages/oxlint-plugin-naming"
pnpm add -D "oxfmt-config-avi12@github:avi12/lint-config#v0.3.0&path:/packages/oxfmt-config"
pnpm add -D "eslint-config-avi12@github:avi12/lint-config#v0.3.0&path:/packages/eslint-config"
pnpm add -D "stylelint-config-avi12@github:avi12/lint-config#v0.3.0&path:/packages/stylelint-config"
pnpm add -D "fallow-config-avi12@github:avi12/lint-config#v0.3.0&path:/packages/fallow-config"
pnpm add -D "avi12-lint@github:avi12/lint-config#v0.3.0&path:/packages/avi12-lint"
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

ESLint options of `base()`:

- `sourceFiles: []` skips the package-source layer
- `allowPositionalParameters: ["vendor/**"]` turns off "2+ parameters take one destructured object" for those globs, for code that mirrors a third-party signature

ESLint

```js
import { base } from "eslint-config-avi12/base";
import { svelte } from "eslint-config-avi12/svelte";

export default [...base(), ...svelte()];
```

- `svelte()` is optional: install `eslint-plugin-svelte` and `svelte-eslint-parser`
- `base({ formatter: "eslint" })` keeps the stylistic layout rules in ESLint for a repo without oxfmt
- `sourceFiles` and `testFiles` choose where the JSDoc and tree-shaking rules apply

Other presets: `extends` the JSON of `stylelint-config-avi12` and
`fallow-config-avi12`, and pass `oxfmt-config-avi12/oxfmt.json` to `oxfmt -c`

### Rules every consumer meets

- Array types are `T[]` everywhere, including `{ ... }[]`; oxlint's `array-type` is set to `array`, so no tool asks for `Array<{ ... }>`
- A lone comparison against a literal, `null` or `undefined` (`value === null`) stays inline in an `if`; any other comparison or a compound condition goes into a named boolean
- Imports use `@/path` from the project root; a `../` import is an error
  Map the alias in `tsconfig.json` (`"paths": { "@/*": ["./src/*"] }`)
- No disable comments: `eslint-disable`, `oxlint-disable`, `@ts-ignore` and `@ts-nocheck` are errors wherever they appear, and ESLint ignores inline directives
  Fix the code, or add an `allowedNames` or `fileOverrides` entry with a reason
- `any` and a bare `@ts-expect-error` are errors in `.ts` and in the script of `.svelte`; oxlint reads both

## Who owns what

- oxlint: every rule it has, run on `.ts` and the script of `.svelte`
- oxfmt: formatting and import order for `.ts`, `.js`, `.json` and the rest it supports
- Svelte files: oxfmt does not format `.svelte` (it reports no target file), so ESLint's Svelte layout rules (`svelte/indent`, `svelte/html-quotes` and the custom ones) own them; oxfmt is the default formatter for everything else
- ESLint: Svelte template rules, custom layout rules, selector bans, JSDoc,
  unused-import removal, and the layout oxfmt cannot express
- Biome: optional, only `noFloatingPromises`; leave it out unless you need that one rule
- No tool sees type information; `naming/convention` reads syntax only

## Runner

`avi12-lint` plans a tool only when its config file or binary exists
Default run: oxlint (type-aware through `tsrs-lint` when installed), `tsrs --noEmit` when installed,
stylelint, oxfmt and ESLint
ESLint starts first because it is the one that peaks in memory, and the light tools run beside it
Output is printed per tool when it finishes, so lines never interleave

| Flag | Effect |
|---|---|
| `--fix` | fixes instead of checking; tools then run one after another, so fixers never race |
| `--changed` | only the files that differ from the merge base with `main`, plus untracked ones |
| `--staged` | only the staged files, for lint-staged |
| `--concurrency N` | ESLint workers, clamped to 1-4 |

- `AVI12_LINT_CONCURRENCY` is the same as `--concurrency`, and the flag wins
- ESLint runs at concurrency 2 (1 with `--changed` or `--staged`) with `--cache --cache-strategy content`,
  stored in `.verify/eslint-cache/`; add `.verify/` to `.gitignore`
- With `--changed` or `--staged`, oxlint, ESLint, stylelint and `fallow audit` get the file list;
  tsrs checks the whole project, as a type error can sit in an untouched file
- A tool with no matching changed file is skipped

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

### Why not the GPU

It was tested and rejected
- No GPU linters exist; parsing and rule logic are branchy, serial work
- The one step a GPU could take is hashing for the cache, and hashing is 30 times cheaper than reading the files
- The machine plays VRAM-heavy games, and lint must never compete with them

## Tests

`pnpm test` lints small fixtures at concurrency 1; the runner tests only build plans and run nothing
- parity: a `.ts` file reports the same with and without the Svelte layer
- clash: no rule is enforced by both ESLint and oxlint, no opposing pair is on,
  one layout rule owns each aspect of a Svelte file, and fixing is idempotent
  in both fixer orders
- naming: `allowedNames`, `allowedPatterns`, `presets` and `fileOverrides` work and demand a reason
- presets: the browser and webextension globals, `sourceFiles: []` and `allowPositionalParameters`
- runner: the plan (default, fix, changed, staged, type-aware, overrides), and the concurrency clamp

CI runs the same on every push (`.github/workflows/ci.yml`)
