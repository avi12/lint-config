# lint-config

Shared lint configuration for avi12's repositories, as plain JS, JSON and CSS
packages with no build step
They are consumed straight from GitHub and never published to npm

## Packages

| Package | What it is |
|---|---|
| `packages/oxlint-config` | oxlint preset: correctness, Google style rules, `@/` imports with `../` banned, any lint-disable text is an error |
| `packages/oxlint-plugin-naming` | `naming/convention` for oxlint's JS plugin API, with `allowedNames` and `fileOverrides` that each carry a reason |
| `packages/oxfmt-config` | oxfmt preset: formatting and import order |
| `packages/eslint-config` | ESLint flat config: only what oxlint and oxfmt cannot do, plus an optional Svelte layer |
| `packages/stylelint-config` | stylelint preset for CSS and Svelte or HTML style blocks |
| `packages/fallow-config` | fallow preset for the dead-code audit |
| `packages/biome-config` | optional and minimal: only `noFloatingPromises` |
| `packages/avi12-lint` | `avi12-lint` runs the tools one after another |

## Install

Every package installs from a tag of this repository
`avi12/lint-config` is private, so a consumer's CI needs a read-only token (see below)

```sh
pnpm add -D "oxlint-config-avi12@github:avi12/lint-config#v0.2.0&path:/packages/oxlint-config"
pnpm add -D "oxlint-plugin-naming@github:avi12/lint-config#v0.2.0&path:/packages/oxlint-plugin-naming"
pnpm add -D "oxfmt-config-avi12@github:avi12/lint-config#v0.2.0&path:/packages/oxfmt-config"
pnpm add -D "eslint-config-avi12@github:avi12/lint-config#v0.2.0&path:/packages/eslint-config"
pnpm add -D "stylelint-config-avi12@github:avi12/lint-config#v0.2.0&path:/packages/stylelint-config"
pnpm add -D "fallow-config-avi12@github:avi12/lint-config#v0.2.0&path:/packages/fallow-config"
pnpm add -D "avi12-lint@github:avi12/lint-config#v0.2.0&path:/packages/avi12-lint"
```

Add only the ones you use; `avi12-lint` runs whichever tools have a config file
Install `oxlint`, `oxfmt`, `eslint` and `stylelint` yourself; they are peers

### CI in a private consumer repository

pnpm clones this repository over HTTPS, and a private repository needs a credential for that
Create a fine-grained personal access token with read-only `Contents` access to `avi12/lint-config` alone
and store it in each consumer repository as the Actions secret `LINT_CONFIG_TOKEN`
Then route GitHub URLs through it before the install step

```yaml
- run: git config --global url."https://x-access-token:${{ secrets.LINT_CONFIG_TOKEN }}@github.com/".insteadOf "https://github.com/"
- run: pnpm install --frozen-lockfile
```

The default `GITHUB_TOKEN` cannot read another private repository, which is why a separate secret is needed

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

`avi12-lint` runs oxlint, ESLint, oxfmt and stylelint in turn, for each tool
whose config file exists
`--fix` fixes instead of checking
ESLint caches to `node_modules/.cache/eslint/` and runs at concurrency 1
`--concurrency N` or `AVI12_LINT_CONCURRENCY` raises it, clamped to 1-4

## Tests

`pnpm test` lints small fixtures at concurrency 1
- parity: a `.ts` file reports the same with and without the Svelte layer
- clash: no rule is enforced by both ESLint and oxlint, no opposing pair is on,
  one layout rule owns each aspect of a Svelte file, and fixing is idempotent
  in both fixer orders
- naming: `allowedNames` and `fileOverrides` work and demand a reason
- runner: the plan, and the concurrency clamp

CI runs the same on every push (`.github/workflows/ci.yml`)
