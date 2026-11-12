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

## Use

Install a package from a tag of this repository

```sh
pnpm add -D "oxlint-config-avi12@github:avi12/lint-config#v0.1.0&path:/packages/oxlint-config"
```

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

ESLint

```js
import { base } from "eslint-config-avi12/base";
import { svelte } from "eslint-config-avi12/svelte";

export default [...base(), ...svelte()];
```

- `svelte()` is optional: install `eslint-plugin-svelte` and `svelte-eslint-parser`
- `base({ formatter: "eslint" })` keeps the stylistic layout rules in ESLint for a repo without oxfmt
- `sourceFiles` and `testFiles` choose where the JSDoc and tree-shaking rules apply
- Inline `eslint-disable` directives are ignored, and oxlint fails on their text

Other presets: `extends` the JSON of `stylelint-config-avi12` and
`fallow-config-avi12`, and pass `oxfmt-config-avi12/oxfmt.json` to `oxfmt -c`

## Who owns what

- oxlint: every rule it has, run on `.ts` and the script of `.svelte`
- oxfmt: formatting and import order
- ESLint: Svelte template rules, custom layout rules, selector bans, JSDoc,
  unused-import removal, and the layout oxfmt cannot express
- Biome: nothing oxlint can do
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
