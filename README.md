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
| `packages/eslint-config` | ESLint flat configs for Svelte and Vue files only: the template rules oxlint and oxfmt cannot see; a TypeScript-only repo needs no ESLint |
| `packages/stylelint-config` | stylelint preset for CSS and Svelte, Vue or HTML style blocks |
| `packages/fallow-config` | fallow preset for the dead-code audit |
| `packages/biome-config` | optional and minimal: only `noFloatingPromises` |
| `packages/house-rules` | the rule parity matrix (`rules.json`): each TypeScript house rule and its Rust, C++, C# and Kotlin equivalent; see `docs/non-ts-languages.md` |
| `packages/ast-grep-rules` | ast-grep rule packs, one per language (`rust`, `cpp`, `csharp`, `kotlin`): the house rules no linter of those languages has; each rule has a fixture of must-flag and must-not-flag lines |
| `packages/kotlin-config` | the Kotlin presets: `.editorconfig` for ktlint, `detekt.yml`, and `tools.json` with the pinned ktlint and detekt versions and checksums; fixtures of must-flag and must-not-flag files per rule |
| `packages/rust-config` | the Rust presets: `lints.toml` (every matrix row as a rustc or clippy lint level), `clippy.toml` (thresholds, the short-name idioms, tests may unwrap), `rustfmt.toml` (width 100) and `deny.toml` (advisories, licences, bans, sources); `avi12-lint rust-config` writes them into a repo; fixture crates mark the line each lint must flag |
| `packages/cpp-config` | the C++ presets: `format.json` (Google, 80 columns, `InsertBraces`) and `tidy.json` (every matrix row for C++ as clang-tidy checks, the house naming and the thresholds, a reason for each check that is off); `avi12-lint cpp-config` writes `.clang-format` and `.clang-tidy` into a repo; fixtures mark the line each check must flag |
| `packages/avi12-lint` | `avi12-lint` runs the tools one after another; for Rust, C++, C# and Kotlin it runs ast-grep and a text check, for Kotlin also ktlint and detekt, for Rust also `cargo fmt`, `clippy`, `machete` and `deny`, and for C++ also `clang-format` and a cached, memory-bounded `clang-tidy` |

## Install

Every package installs from a tag of this repository

```sh
pnpm add -D "oxlint-config-avi12@github:avi12/lint-config#v0.4.13&path:/packages/oxlint-config"
pnpm add -D "oxlint-plugin-naming@github:avi12/lint-config#v0.4.13&path:/packages/oxlint-plugin-naming"
pnpm add -D "oxfmt-config-avi12@github:avi12/lint-config#v0.4.13&path:/packages/oxfmt-config"
pnpm add -D "eslint-config-avi12@github:avi12/lint-config#v0.4.13&path:/packages/eslint-config"
pnpm add -D "stylelint-config-avi12@github:avi12/lint-config#v0.4.13&path:/packages/stylelint-config"
pnpm add -D "fallow-config-avi12@github:avi12/lint-config#v0.4.13&path:/packages/fallow-config"
pnpm add -D "avi12-lint@github:avi12/lint-config#v0.4.13&path:/packages/avi12-lint"
pnpm add -D "rust-config-avi12@github:avi12/lint-config#v0.8.0&path:/packages/rust-config"
pnpm add -D "cpp-config-avi12@github:avi12/lint-config#v0.9.0&path:/packages/cpp-config"
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
- Enum-like objects follow the project pattern: in `export const X = { A: "a" } as const` where every value is a string literal, every member must be `UPPER_CASE`; an object of only numbers counts too when it is exported and the file has `type X = typeof X[keyof typeof X]`; the keys of any other object (a numeric config such as `{ min: 0, max: 10 } as const`, a PascalCase lookup) may be camelCase, `UPPER_CASE` or PascalCase
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
- A repo without Svelte or Vue files has no `eslint.config.js` and no ESLint dependency at all

ESLint, only when the repo has `.vue` files

```js
import { vue } from "eslint-config-avi12/vue";

export default vue();
```

- `vue({ ignores, overrides })` mirrors the Svelte layer: install `eslint`, `eslint-plugin-vue`, `vue-eslint-parser` and `typescript`; `eslint-plugin-svelte` and `svelte-eslint-parser` stay optional peers, so a Vue repo installs neither
- It runs on `.vue` files only and holds what needs the template AST: `eslint-plugin-vue`'s `flat/recommended` (essential, strongly-recommended and recommended), `vue/block-order` (script, template, style), `vue/block-lang` (`ts`), `vue/attributes-order`, PascalCase components in templates, `vue/define-macros-order`, `vue/no-v-html`, hyphenated `v-on` events, shorthand `v-bind`, `v-on` and `v-slot`, `local/no-padded-tag`, and the em dash check
- Parity with Svelte: a ternary in a template tag (`{{ a ? b : c }}`) is banned, since Svelte bans it too; use `v-if`/`v-else`; a ternary inside a directive value such as `:label="a ? b : c"` stays allowed, as in Svelte attributes
- Unlike `.svelte`, oxfmt formats `.vue` files whole (script, template and style), so every layout rule of `eslint-plugin-vue` is off except `vue/html-self-closing`, which oxfmt does not do; `eslint-plugin-vue`'s warnings are errors here, and ESLint keeps only the rules oxfmt cannot express
- oxlint judges the script of a `.vue` file like a `.ts` file, except unused imports and variables, which ESLint decides with the template in view; the naming plugin treats a `.vue` script like a `.svelte` one
- No `nuxt` naming preset: Nuxt's mandated names (`defineProps`, `definePageMeta`, `pages/[id].vue`) are functions and file names the naming rule does not judge; a Nuxt repo that meets a mandated key adds an `allowedNames` entry with its reason
- stylelint reads the `<style>` of a `.vue` file through `postcss-html`, as for Svelte

Other presets: `extends` the JSON of `stylelint-config-avi12` and
`fallow-config-avi12`, and pass `oxfmt-config-avi12/oxfmt.json` to `oxfmt -c`

### Rules every consumer meets

- Array types are `T[]` everywhere, including `{ ... }[]`; oxlint's `array-type` is set to `array`, so no tool asks for `Array<{ ... }>`
- A lone comparison against a literal, `null` or `undefined` (`value === null`) stays inline in an `if`; any other comparison or a compound condition goes into a named boolean
- Imports use `@/path` from the project root; a `../` import is an error
  Map the alias in `tsconfig.json` (`"paths": { "@/*": ["./src/*"] }`)
- No disable comments: `eslint-disable`, `oxlint-disable`, `@ts-ignore` and `@ts-nocheck` are errors wherever they appear, and the Svelte ESLint layer ignores inline directives
  Fix the code, or add an `allowedNames` or `fileOverrides` entry with a reason
- Type assertions (`as Type`, `<Type>x`, `x as unknown as T`, `{} as T`) are errors in `.ts`, `.tsx` and the script of `.svelte`, tests included; `as const` and `satisfies` stay allowed; an assertion tells the compiler what it cannot check, so a wrong one fails at runtime instead of in the build; prefer a type guard, a schema (zod) parse, a typed annotation or a narrowing helper; a genuine case goes in an oxlint `overrides` entry that lists the file and turns `typescript/consistent-type-assertions` off, with the reason in the consumer's CLAUDE.md, never an inline disable
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

### Migrating from 0.8.0

- A repository with C++ (a `CMakeLists.txt`, a `*.vcxproj`, a `.clang-format` or a `.clang-tidy`) now also runs `clang-format` and `clang-tidy`
  - add `cpp-config-avi12` as a devDependency (`github:avi12/lint-config#v0.9.0&path:/packages/cpp-config`), keep the repo's own exemptions in `avi12-cpp.local.json` at the repo root and run `avi12-lint cpp-config`; commit what it writes (`.clang-format`, `.clang-tidy`, and a `.clang-tidy` in each folder named under `tidy.directories`) and run it again after bumping the tag; the runner fails when a generated file is stale
  - LLVM is found on the PATH, in Visual Studio's `VC/Tools/Llvm` folder or in `C:/Program Files/LLVM/bin` (`AVI12_LINT_LLVM_BIN` names another); a missing tool is a one-line notice and the step is skipped (`AVI12_LINT_REQUIRE_CPP=1` turns a notice into a failure); on Windows the Visual Studio x64 environment is read once from `vcvars64.bat` so clang finds the MSVC and SDK headers
  - `avi12-cpp.local.json` keys: `sources` (`include` and `exclude` regexes over repo-relative paths; vendored, build and output folders are always out), `database` (where the compile flags come from, below), `format` (a clang-format key to set, or `null` to drop), and `tidy`: `enable` (extra checks), `disable` (a check name to its reason), `options` with `optionReasons` (every option needs a reason), `headerFilterRegex`, `directories` (a folder to `disable`, `options` and `optionReasons`, written as a `.clang-tidy` that inherits the root one), and `ignoredPaths` (a regex to its reason: findings in generated code, such as a C++/WinRT projection, do not fail a unit)
  - the compile database is written to `.verify/clang-tidy` from one of three sources: `{ "path": "build/native-Release/compile_commands.json", "externalIncludes": "regex" }` for a CMake database (precompiled header flags are dropped, an include folder matching the regex becomes external), `{ "buildscript": { "file", "project", "includeRoot", "flags" } }` for a sighmake buildscript (the standard, the solution and project defines and the include folders are read from it, so there is no second copy), or `{ "flat": { "standard", "defines", "includes", "flags" } }`
  - `clang-format --dry-run --Werror` runs once over every covered file, batched by the argument budget, never one process per file (`--fix` runs it with `-i`)
  - `clang-tidy` runs one process per translation unit through a pool bounded by the CPU count, by free memory over a unit's measured cost and by `AVI12_LINT_CPP_MEMORY_MB` (8192), `AVI12_LINT_TIDY_JOBS` sets the size; a unit that passed is not run again until the tool, the `.clang-tidy`, its compile arguments, the unit or a project header it includes changes (`.verify/clang-tidy-cache`; add `.verify/` to `.gitignore`); `--changed` and `--staged` run the changed units and the units that include a changed header
  - `clang-tidy` fixes are opt in: `AVI12_LINT_TIDY_FIX=1 avi12-lint --fix` exports each unit's fixes, merges them as `clang-apply-replacements` does, applies them once and then formats; run it until it reports 0 files; a fixer can still write wrong code, so build and test afterwards (the fixer made `DllMain` and `wmain` static before `misc-use-internal-linkage` was switched off, and rewrote `modernize-use-ranges` calls into code that does not compile, which is off too)
  - `--only=cpp` runs these steps alone
- The `plan` export gained a `cpp` argument, and the `avi12-lint` exports `cpp`, `cpp-config`, `cpp-fixes`, `cpp-tidy` and `cpp-tools` are new

### Migrating from 0.7.0

- A repository with a `Cargo.toml` now also runs `cargo fmt --check`, `cargo clippy --all-targets --all-features --keep-going -- -D warnings`, `cargo machete` and `cargo deny check` per Cargo root (a `[workspace]` manifest, or a package that lies in none), one after another under a guard of their own (`AVI12_LINT_RUST_MEMORY_MB` 8192, `AVI12_LINT_RUST_TIME_LIMIT_MS` 30 minutes)
  - add `rust-config-avi12` as a devDependency (`github:avi12/lint-config#v0.8.0&path:/packages/rust-config`) and run `avi12-lint rust-config` once; commit what it writes, and run it again after bumping the tag (the runner fails when the generated files are stale)
  - clippy has no `extends`, so the generator writes `clippy.toml`, `rustfmt.toml` and `deny.toml` next to each root's manifest, and a block between `# avi12-lint:begin` and `# avi12-lint:end` at the end of every manifest: `[workspace.lints.*]` in the workspace root, `[lints] workspace = true` in each member, `[lints.*]` in a package outside a workspace
  - a manifest that already has `[lints]` tables is reported, not overwritten: move them into `avi12-rust.local.toml` (next to the root manifest) and delete them
  - an exemption is a key in `avi12-rust.local.toml` with a comment saying why, never an `#[allow]` (`clippy::allow_attributes` is denied): `[rust]` and `[clippy]` change a lint level for the workspace, `[member.<crate>.rust]` and `[member.<crate>.clippy]` for one crate (a crate that calls Win32 sets `unsafe_code = "allow"`), `[clippy-config]` and `[rustfmt]` change a `clippy.toml` or `rustfmt.toml` key, `[deny.<table>]` a `deny.toml` table (a key replaces the preset's, arrays included)
  - the lints that bite an application crate hardest are `missing_docs`, `unreachable_pub`, `as_conversions`, `expect_used`, `indexing_slicing` and `min_ident_chars`; a Tauri app lists `missing_docs = "allow"` for its own package, since nothing in it is a public API
  - clippy builds into `.verify/rust-target` (so it never waits for the lock of a dev build; add `.verify/` to `.gitignore`); `AVI12_LINT_RUST_TARGET=shared` uses Cargo's own target directory, and a `CARGO_TARGET_DIR` in the environment is respected; `CARGO_BUILD_JOBS` is 4
  - `--fix` runs `cargo fmt` and `cargo clippy --fix --allow-dirty --allow-staged`; machete and deny never fix; `--changed` and `--staged` keep only the crates that own a changed `.rs` file (a changed manifest, lock file or lint config means the whole root, and `cargo deny` runs only then); `--only=rust` runs these steps alone
  - a missing `cargo`, clippy, rustfmt, machete or deny is a one-line notice with the install command and the step is skipped (`AVI12_LINT_REQUIRE_RUST=1` turns a notice into a failure); `AVI12_LINT_RUST_DENY_FETCH=0` runs `cargo deny` offline
  - `AVI12_LINT_RUST_PRESET` points the generator at a preset folder other than `node_modules/rust-config-avi12`
- `--only=kotlin` now works through a `family` on each step, so `--only=rust` and `--only=kotlin` share one filter
- The matrix text for the Rust rows says what the config does (thresholds, the short names that pass)

### Migrating from 0.6.0

- A repository with Kotlin now also runs `ktlint` and `detekt` (serial, one JVM at a time, `-Xmx768m`), without Gradle
  - add `kotlin-config-avi12` as a devDependency (`github:avi12/lint-config#v0.7.0&path:/packages/kotlin-config`) and a Java 17 or newer runtime; the runner says so when either is missing and skips both tools (`AVI12_LINT_REQUIRE_KOTLIN=1` turns the skip into a failure)
  - the two CLI jars are downloaded once into `.verify/kotlin-tools` and checked against the SHA-256 pinned in `tools.json`; `.verify/` belongs in `.gitignore`
  - ktlint reads the preset `.editorconfig` as its default, so the repo's own `.editorconfig` wins on any property it sets; detekt reads the preset `detekt.yml` and then the repo's own `detekt.yml` (the shallowest one), whose keys win, so an exemption is a key in that file with a comment saying why
  - `--fix` runs `ktlint --format`; detekt never autocorrects; `--changed` and `--staged` pass only the Kotlin files that changed; `--only=kotlin` runs these two steps alone
  - detekt gets its own jar as the classpath, so the rules that need type resolution (`BooleanPropertyNaming`, `VarCouldBeVal`, `UnsafeCast`, `UnnecessaryLet`, `ForbiddenAnnotation`) run against the Kotlin standard library; `AVI12_LINT_KOTLIN_TYPES=0` drops the classpath, which is three times faster and runs those rules not at all
  - `UnusedImports` and `UnnecessaryParentheses` are off (ktlint owns imports and its mixed-condition-operators needs the parentheses); `UnreachableCode` and `UnreachableCatchBlock` are off in the preset: with a partial classpath they flag every call into an unresolved library, and the Kotlin compiler reports them exactly
- The matrix text for `max-nesting`, `identifier-length` and `no-unchecked-cast` now says what the Kotlin config does

### Migrating from 0.5.1

- Nothing changes for a TypeScript-only repository: no language step is planned without a marker file
- A repository with Rust, C++, C# or Kotlin (`Cargo.toml`, `CMakeLists.txt`, `.clang-tidy`, `.clang-format`, a `*.csproj`, `build.gradle.kts` or `detekt.yml` at any depth) now also runs, under the memory and time guard
  - one `ast-grep <language>` step per language, with the rule pack `ast-grep-rules-avi12` (add both `@ast-grep/cli` and the pack as devDependencies; the runner says so when either is missing and skips that language)
  - one `text-check` step: a suppress comment (`#[allow(`, `NOLINT`, `#pragma warning disable`, `@Suppress`, `SuppressMessage`, `#pragma clang diagnostic ignored`, `eslint-disable`) or an em dash is an error
- An exemption of the text check lives in `avi12-lint.config.json` as `textCheck.exemptions` (`files` globs, `rules` of `no-suppress-comment` or `no-em-dash`, and a `reason` that is required); an ast-grep rule exempts files with `ignores` and a `note`
- `avi12-lint text-check [files]` runs the text check alone
- `house-rules-avi12` ships `tool-ids/*.txt` (every rule id of clippy, rustc, clang-tidy, the Roslyn analyzers, detekt and ktlint); `pnpm ids:refresh` regenerates them

### Migrating from 0.5.0

- `vue()` turns off every layout rule of `eslint-plugin-vue` that oxfmt owns (it formats `.vue` templates), and makes the plugin's warnings errors

### Migrating from 0.4.15

- New, optional: `eslint-config-avi12/vue` for Vue repos; install `eslint`, `eslint-plugin-vue`, `vue-eslint-parser` and `typescript`, write `export default vue();`
- `eslint-config-avi12` declares its Svelte and Vue plugins as optional peers; a Svelte repo changes nothing
- `avi12-lint` plans ESLint when the repo holds `.svelte` or `.vue` files, and passes stylelint, oxlint and oxfmt the `.vue` files too
- oxlint's `.svelte` override (no unused-import or unused-variable judgement) now covers `.vue`

### Migrating from 0.4.14

- The stylelint preset now allows the font-relative units `ch`, `lh`, `rlh`, `ex`, `cap` and `ic` (they were banned through `stylelint-config-ccb`); a consumer that rewrote them to `em` can restore the originals
- Still banned, as print or non-layout units: `cm`, `mm`, `Q`, `in`, `pc`, `pt`, `s` (use `ms`), `grad`, `rad`, `turn`, `dpcm`

### Migrating from 0.4.13

- `typescript/consistent-type-assertions` (`assertionStyle: never`) is now in the base oxlint preset, so a consumer that never had its own copy starts seeing errors on every `as Type`, `<Type>x` and `{} as T`; `as const` and `satisfies` are fine
- Fix by narrowing: a type guard, a `zod` parse for loose data, `satisfies`, a typed annotation or a narrowing helper
- For the few genuine cases add an oxlint `overrides` entry with `files` listing the file and `"typescript/consistent-type-assertions": "off"`, and write the reason in the repository's CLAUDE.md; tests are not exempt unless listed

### Migrating from 0.4.12

- `avi12-lint` runs oxlint with `--disable-nested-config`, so a git submodule or a nested folder with its own `.oxlintrc.json` no longer fails with "Plugin name 'naming' is already registered"; `ignorePatterns` never stopped that discovery; set `AVI12_LINT_NESTED_CONFIG=1` or pass `--nested-config` for a repo that relies on nested configs; a native `oxlint` run (outside `avi12-lint`) needs `oxlint --disable-nested-config` itself
- `oxfmt-config-avi12` sets `endOfLine` to `lf`; on Windows add `* text=auto eol=lf` to `.gitattributes` (or set `core.autocrlf` to `false`) so a CRLF checkout does not list files as modified after `--fix`; one `--fix` run turns CRLF into LF and a second changes nothing
- fallow `extends` replaces arrays instead of merging them, so one local `ignoreDependencies` entry dropped the preset list; keep local additions in `fallow.local.json` and run `avi12-lint fallow-config` to write `.fallowrc.json` with the preset and your entries united (arrays united, objects merged, scalars from the local file); `fallow-config-avi12` now exports `./fallow.json`
- `avi12-lint --full` (or `AVI12_LINT_FALLOW_FULL=1`) runs `fallow` over the whole tree under the same memory and time guard; without it fallow still runs only with `--changed`, since a full audit is the costly one

### Migrating from 0.4.11

- `naming/convention` applies `allowedNames` and `allowedPatterns` to every selector it checks (functions, variables, parameters, members, enum members, classes, type names and type parameters), so a `fileOverrides` entry kept only for a framework-mandated function or component name can go
- `stylelint-config-avi12` is now a JS preset (`stylelint.mjs`) that drops any rule the installed stylelint does not know, and supports stylelint 17 and 18; the peer range is `^17.0.0 || ^18.0.0`, so a `^17` pin kept as a workaround can be lifted; keep `extends: ["stylelint-config-avi12"]`
- A single `avi12-lint --fix` run settles one-line object arguments; a test now asserts a second run changes nothing

### Migrating from 0.4.10

- The `../` import ban is now `house/no-parent-imports`, a rule of its own: a `no-restricted-imports` block in your config no longer replaces it, so imports that slipped through before are errors now; replace them with `@/path`
- Enum-like objects need string-literal values (or exported numbers with a matching `typeof X[keyof typeof X]` alias): a numeric config object such as `{ min: 0, max: 10 } as const` may use camelCase members again
- `fallow-config-avi12` ignores the lint packages as unused dependencies, so drop any `ignoreDependencies` entries you added for them
- `house/google-syntax` no longer flags a condition whose later operand uses the narrowing of an earlier one (`typeof x === "string" && x.length > 0`, `isFoo(x) && x.bar`); independent compounds are still flagged

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
ESLint is planned only when `eslint.config.js` exists and the repo holds a `.svelte` or `.vue` file, and it gets those files alone
It starts first because it is the one that peaks in memory, and the light tools run beside it
Output is printed per tool when it finishes, so lines never interleave

| Flag | Effect |
|---|---|
| `--fix` | fixes instead of checking; tools then run one after another, so fixers never race |
| `--changed` | only the files that differ from the merge base with `main`, plus untracked ones; fallow audits against that base |
| `--staged` | only the staged files, for lint-staged; fallow is skipped |
| `--full` | also runs fallow over the whole tree, under the memory guard |
| `--nested-config` | lets oxlint load nested `.oxlintrc.json` files |
| `--concurrency N` | ESLint workers, clamped to 1-4 |

- `AVI12_LINT_CONCURRENCY` is the same as `--concurrency`, and the flag wins
- ESLint runs at concurrency 2 (1 with `--changed` or `--staged`) with `--cache --cache-strategy content`,
  stored in `.verify/eslint-cache/`; add `.verify/` to `.gitignore`
- With `--changed` or `--staged`, oxlint, ESLint, stylelint and oxfmt get the file list, and `fallow audit --base` gets the merge base (`--changed` only);
  tsrs checks the whole project, as a type error can sit in an untouched file
- A tool with no matching changed file is skipped
- Rust, C++, C# and Kotlin: a language is detected by its marker file; each gets its own `ast-grep` step over its changed files outside `target`, `build`, `bin`, `obj`, `vendor` and other build or dependency folders (the whole project with those folders excluded otherwise), plus one `text-check` step; both are guarded like fallow (`AVI12_LINT_FALLOW_MEMORY_MB`, `AVI12_LINT_FALLOW_TIME_LIMIT_MS`)
- Kotlin: `ktlint` and `detekt` run from cached CLI jars over the repo's Kotlin files (changed ones with `--changed`), batched to fit a Windows command line, in the same watchdog; the report is one line per finding, `file:line:column  tool/rule  message`, then a count; Java 17 or newer is required
- Rust: per Cargo root, `cargo fmt --check`, `cargo clippy`, `cargo machete` and `cargo deny check` as serial guarded steps, with the report as the tool prints it; a stale generated config or a manifest with its own `[lints]` fails the run
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
- rust: the generator (preset merged with the local file, idempotent, CRLF-safe), the plan with a fake tool probe, and fixture crates run through the real tools: every configured lint flags exactly the marked lines, a clean crate flags nothing, `cargo fmt` and `clippy --fix` settle in one pass, deny and machete accept a clean crate; each skips with a message when the tool is not installed

CI runs the same on every push (`.github/workflows/ci.yml`)
