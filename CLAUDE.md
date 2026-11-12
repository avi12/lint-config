# lint-config

Avi's shared lint configuration for every TypeScript repository
Public repository `avi12/lint-config`, default branch `main`, consumed from GitHub tags, never from npm
This file is for contributors and coding agents; read it before changing anything

# What this is for
- One place for the lint rules of all of Avi's TypeScript repositories, so a repository carries a few lines of config instead of hundreds
- The goal is the fastest lint with the smallest memory footprint; the old setup ran type-aware ESLint workers at about 1.5 GB each (25 GB in total)
- Every decision below was measured; do not undo one without new measurements

# Layout
- `packages/oxlint-config`: the main preset (`oxlint.json`) plus `browser`, `webextension`, `wxt` and `library` presets and the `house` JS plugin (local layout rules, selector bans, no-em-dash)
- `packages/oxlint-plugin-naming`: the naming rule as an oxlint JS plugin (replaces type-aware `@typescript-eslint/naming-convention`); options `allowedNames`, `allowedPatterns` and `fileOverrides`, every entry needs a reason; presets `webextension-manifest`, `webextension-messages`, `hook-names`, `sveltekit`
- `packages/oxfmt-config`: oxfmt formatter preset (oxfmt does not format `.svelte`)
- `packages/eslint-config`: Svelte-only ESLint layer (`svelte()`); ESLint exists only for rules that need Svelte template syntax trees
- `packages/stylelint-config`, `packages/fallow-config`: presets for CSS and for the dead-code audit
- `packages/biome-config`: optional and minimal (`noFloatingPromises` only); Biome stays last in line
- `packages/avi12-lint`: the `avi12-lint` runner (plans which tools to run, `--changed`, `--staged`, `AVI12_LINT_CONCURRENCY`)
- `test/`: parity fixtures (ts-only and ts+svelte), the clash and fixer-stability test, plan tests

# Division of labour (prefer the cheapest tool that can do the job)
1. oxlint native rules, then open-source ESLint plugins loaded through oxlint `jsPlugins` (never write a rule from scratch when an open-source one exists)
2. oxfmt for formatting
3. ESLint only for Svelte template rules; a repository with no `.svelte` file needs no ESLint at all
4. Biome only for what oxlint and oxfmt cannot do
5. tsrs (`npm.im/tsrs`, a Rust TypeScript 7 compiler) for type checks and type-aware oxlint through `tsrs-lint`; it is about 9 times faster than `tsc`
6. GPU was tested and rejected: no GPU linter exists, hashing is 30 times cheaper than reading the files, and Avi plays VRAM-heavy games; never add GPU use

# Rules for every change
- No lint-disable comments anywhere, in this repository or in consumers; cover an exception with config (`allowedNames`, `allowedPatterns`, `fileOverrides`, an oxlint override) and write the reason next to it
- No two rules may clash: the clash test runs every fixer and every linter and asserts zero violations and that a second fix run changes nothing; keep it green
- One owner per rule: a rule lives in exactly one tool
- Imports are Vite-style `@/` (the project root), never `../`
- Google style for every language; named exports; no comments by default; no em dashes; no full stops in Markdown prose; early returns, named booleans for compound conditions, full-word names
- Do not weaken a preset to make a consumer pass; fix the consumer, or add a documented option here
- Never type-aware ESLint parsing (`projectService`); that is the memory problem this repository exists to remove
- Defaults: ESLint concurrency 2 with `--cache --cache-strategy content`; concurrency `auto` costs 5 to 6 GB for no gain
- Keep the README's "Migrating from" notes current whenever consumer-visible config changes

# Workflow
- `pnpm lint` and `pnpm test` must be green before every commit; run heavy jobs one at a time
- Digestible commits: one logical change each, with a message saying what and why; end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- A consumer-visible change gets a new tag on `main` (`vMAJOR.MINOR.PATCH`) and the package versions set to it in the release commit; consumers pin the tag: `github:avi12/lint-config#vX.Y.Z&path:/packages/<name>`
- No npm publish, no GitHub release; the tag is the release
- Never force-push, never move or delete a tag a consumer may pin

# Consumers
- Migration status and the skip list live in Avi's memory, not here; consumer repositories migrate on a `chore/shared-lint-config` branch, then merge to `main` and push, with no deployments
- When a migration finds a defect in a shared package, fix it here with a test, then tag; never patch around it inside the consumer
- Known skip: `skillshare-player-control`, `youtube-auto-hd` (its `-private` repository is the deployed one), `google-maps-search-box`
