# lint-config
Shared lint config for all of Avi's TypeScript repositories; consumed from GitHub tags, never npm
Goal: the fastest lint with the smallest memory; every choice below was measured

# Tool order (cheapest that can do the job; one owner per rule)
1. oxlint (native, then open-source ESLint plugins via `jsPlugins`; never write a rule when one exists)
2. oxfmt for formatting
3. ESLint only for Svelte template rules; no `.svelte` file means no ESLint
4. Biome last, minimal
5. tsrs for type checks and type-aware oxlint (`tsrs-lint`)
6. No GPU (tested: no gain, and Avi plays VRAM-heavy games)

# Rules
- No lint-disable comments, here or in consumers; use config (naming `allowedNames`, `allowedPatterns`, `fileOverrides`, oxlint overrides) with a reason
- No clashing rules; `test/clash.test.js` must stay green
- Never type-aware ESLint (`projectService`), the memory problem this repo removes
- Defaults: ESLint concurrency 2, `--cache-strategy content`
- Never weaken a preset for a consumer; fix the consumer or add a documented option
- `@/` imports, never `../`; Google style; named exports; no comments by default; no em dashes; no full stops in Markdown prose

# Workflow
- `pnpm lint` and `pnpm test` green before each commit; one heavy job at a time
- Digestible commits ending `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- Consumer-visible change: set package versions, tag `vX.Y.Z` on `main`, update the README "Migrating from" notes; the tag is the release
- Never force-push or move a tag; no npm publish
- A defect found by a consumer migration is fixed here with a test
