# Linting Rust, C++, C# and Kotlin

Research for extending lint-config beyond TypeScript
Status: step 1 (research and the parity matrix); nothing here is released

## Summary

- One table, `packages/house-rules/rules.json`, maps every TypeScript house rule to its Rust, C++, C# and Kotlin equivalent, or to a gap
- Free tools already cover most rows; configure them, never reimplement
- The gaps are few and mostly structural, so one shared ast-grep rule pack
  (tree-sitter, Rust, about 0.5 s and 60 MB on every repository measured) fills them for all four languages
- No new native linter binary: ast-grep is that binary
- `avi12-lint` detects the languages by their config files and runs each tool with
  the same time and memory guards, changed-files mode and no-disable-comments rule as for TypeScript

## Inventory

Counted from `git ls-files` of the main checkouts, excluding vendored code
(worktrees, `.merge`, `-parity`, `-drop` and `.lint` copies are ignored)

| Language | Repositories (lines) | Tooling already in place |
|---|---|---|
| Rust | pade 48k, edge-plus 12k, agentic-gaming-assistant 9k, any-stt 1.7k, winui-svelte `launcher` 1.5k, cyberpunk-2077-new-tab `launcher` | `rustfmt.toml` (width 100) in pade, edge-plus, any-stt, agentic-gaming-assistant; `[lints.clippy]` with `all` and `pedantic`, `unwrap_used = deny`, `unsafe_code = forbid`; edge-plus adds `min_ident_chars` with a `clippy.toml` allow-list |
| C++ | edge-plus 25k, any-stt 20k, windows-skin-switcher 7.6k, jc2-rtx (about 196k, mostly a vendored fork), fancy-pants-adventures-vr, interview-prep | `.clang-format` (Google, 80 columns, `InsertBraces`) and `.clang-tidy` in edge-plus, any-stt and windows-skin-switcher; each repo has a `tools/lint.ps1` that also runs a regex pass for restricted syntax |
| C# | cyber-journeys-port and cyberpunk-2077-new-tab `companion/dotnet` 5.3k, windows-skin-switcher 1.2k, edge-plus 1k, interview-prep 0.3k | `.editorconfig` in the companion and windows-skin-switcher; csproj with `Nullable`, `EnableNETAnalyzers`, `AnalysisMode Recommended`; no analyzer packages |
| Kotlin | ide-code-walkthrough 19k, winui-svelte `ide/webstorm` 9.6k, sb-companion 2.7k | ktlint plus detekt through Gradle in all three, `detekt.yml` (58 to 70 lines) with `maxIssues: 0`, `.editorconfig` at 120 columns |

Two things follow
The C++ and Rust repos already ported the TypeScript rules by hand, each with its own copy of the
comment table "oxlint rule, what answers it here"; this document replaces those copies with one source
The C++ gate runs clang-tidy once per translation unit through `cmd /c` and `vcvars`, serially, with no cache

## Which house rules carry over

| Class | Decision |
|---|---|
| Naming: full words, `is`/`has`/`can`/`should` booleans, CONSTANT_CASE constants, `i`-prefixed indices, length 3 | Carry over; the language's own case wins where it dictates one (Rust `snake_case` functions, C# `PascalCase` members) |
| Control flow: early return, nesting at most 3, no nested ternary, braces always | Carry over |
| Named boolean for a compound condition | Carry over everywhere; no free tool has it |
| No magic numbers, no unchecked unwrap or non-null assertion, no unsafe casts | Carry over |
| One destructured parameter object from 2 parameters | Only an idiomatic variant: Rust, C#, Kotlin and C++ have named arguments, structs or records, so the rule is a threshold plus the swappable-parameters check |
| No written return types, no `any`, `for...in`, namespaces, `require`, wrapper types | Do not apply; the language requires them or lacks them |
| Layout rules of the house plugin (expand nested object, argument newline) | Do not apply; the formatter (rustfmt, clang-format, `dotnet format`, ktlint) and the language style guide win |
| No suppress comments, exemptions in config with a reason | Carry over; the suppression syntax differs per language (matrix row `no-suppression`) |
| No dead code, no import cycle, one concern per file, public API docs | Carry over where a tool exists; cross-file dead code in C++, C# and Kotlin has no free tool |
| No comment that restates code | Review only, as in TypeScript |
| No em dash, no full stops in Markdown prose | One language-independent text check in `avi12-lint` |

Style guides win where they speak: Google C++ (clang-format, clang-tidy `google-*`),
Rust API guidelines and rustfmt defaults, Microsoft C# conventions (`.editorconfig`),
Kotlin coding conventions (ktlint)

## Rule parity matrix

Generated from `packages/house-rules/rules.json` by
`node packages/house-rules/src/write-docs.js`; a test fails when this section is stale
or when a TypeScript rule named in a row no longer exists in `oxlint-config`
Cell legend: a plain cell is an existing rule to configure, `~` an idiomatic variant,
**gap** a rule we write in the engine named, `n/a` does not apply

<!-- matrix:start -->

| Status | Rust | C++ | C# | Kotlin |
|---|---|---|---|---|
| map: an existing rule does it; configure it | 20 | 23 | 22 | 22 |
| variant: an existing rule does the idiomatic version of it | 2 | 4 | 2 | 2 |
| gap: no rule exists; we write it in the engine named | 8 | 9 | 10 | 9 |
| na: the language makes it moot or the language style guide wins | 8 | 2 | 4 | 5 |

| Rule | Intent | TypeScript | Rust | C++ | C# | Kotlin |
|---|---|---|---|---|---|---|
| braces | every if, else, for and while body is braced | `curly` | n/a: the grammar requires braces | clang-format InsertBraces | IDE0011 (csharp_prefer_braces = true) | detekt BracesOnIfStatements, MandatoryBracesLoops |
| strict-equality | no loose equality | `eqeqeq` | n/a: no loose equality | n/a: no loose equality | n/a: no loose equality | n/a: no loose equality |
| immutable-by-default | const or val unless reassigned; readonly on what is never reassigned | `prefer-const`, `no-var` | rustc unused_mut | misc-const-correctness | IDE0044, RCS1118 | detekt VarCouldBeVal |
| no-nested-ternary | no nested conditional expression | `no-nested-ternary` | n/a: no ternary; nesting is covered by max-nesting | readability-avoid-nested-conditional-operator | RCS1238 | n/a: no ternary; nesting is covered by max-nesting |
| early-return | no else after return, no lonely if in an else | `no-else-return`, `no-lonely-if` | clippy redundant_else, collapsible_else_if | readability-else-after-return | RCS1208 | **gap**: ast-grep house-else-after-return, house-lonely-if |
| max-nesting | block nesting at most 3 deep, callbacks at most 3 deep | `max-depth`, `max-nested-callbacks` | ~ clippy cognitive_complexity with cognitive-complexity-threshold | ~ readability-function-cognitive-complexity | Sonar S134 (max 3) | detekt NestedBlockDepth (threshold 3) |
| named-boolean-condition | a compound or comparing condition is extracted into a named boolean first | `house/google-syntax` | **gap**: ast-grep house-compound-condition | **gap**: ast-grep house-compound-condition | **gap**: ast-grep house-compound-condition | **gap**: ast-grep house-compound-condition |
| no-magic-numbers | a number other than 0, 1, -1, 2 is a named constant | `house/no-magic-numbers` | **gap**: ast-grep house-magic-number | readability-magic-numbers (IgnoredIntegerValues) | Sonar S109 | detekt MagicNumber (ignoreNumbers) |
| no-unchecked-unwrap | no non-null assertion and no unwrap of an absent value | `typescript/no-non-null-assertion` | clippy unwrap_used, expect_used | bugprone-unchecked-optional-access | **gap**: ast-grep house-null-forgiving, with CS8602 as an error | detekt UnsafeCallOnNullableType; ast-grep house-null-forgiving for the !! operator |
| no-unchecked-cast | no unsafe or unchecked cast | `typescript/consistent-type-assertions` | rustc unsafe_code = forbid, clippy as_conversions, cast_possible_truncation | google-readability-casting, cppcoreguidelines-pro-type-cstyle-cast, -const-cast, -reinterpret-cast | AllowUnsafeBlocks off, IDE0019, IDE0038 | detekt UnsafeCast |
| parameter-object | two or more parameters become one parameter object | `house/positional-parameters` | ~ clippy too_many_arguments with too-many-arguments-threshold | ~ bugprone-easily-swappable-parameters | ~ named arguments; CA1068 and Sonar S107 past a threshold | ~ named arguments; detekt LongParameterList past a threshold |
| no-written-return-types | infer return types instead of writing them | `house/house-syntax` | n/a: the language requires them | n/a: the language requires them | n/a: the language requires them | n/a: the language style guide wins |
| identifier-length | names of at least 3 characters, with a short allow-list | `id-length` | clippy min_ident_chars with allowed-idents-below-min-chars | readability-identifier-length (IgnoredVariableNames) | **gap**: ast-grep house-identifier-length | detekt VariableMinLength, FunctionMinLength |
| naming-case | types in UpperCamelCase, values in lowerCamelCase, constants in CONSTANT_CASE (a language that dictates its own case keeps it) | `naming/convention` | rustc non_camel_case_types, non_snake_case, non_upper_case_globals | readability-identifier-naming | IDE1006 with dotnet_naming_rule in .editorconfig | ktlint class-naming, property-naming, function-naming; detekt naming set |
| boolean-prefix | a boolean starts with is, has, can or should and reads positively | `naming/convention` | **gap**: ast-grep house-boolean-prefix (declared bool) | **gap**: ast-grep house-boolean-prefix (declared bool) | **gap**: ast-grep house-boolean-prefix (declared bool) | detekt BooleanPropertyNaming (allowedPattern is|has|can|should) |
| no-abbreviations | full words; a deny-list of known abbreviations | `naming/convention` | **gap**: ast-grep house-abbreviation | **gap**: ast-grep house-abbreviation | **gap**: ast-grep house-abbreviation | **gap**: ast-grep house-abbreviation |
| index-prefix | an index variable is i-prefixed (iItem) or a bare i | `naming/convention` | **gap**: ast-grep house-index-prefix | **gap**: ast-grep house-index-prefix | **gap**: ast-grep house-index-prefix | **gap**: ast-grep house-index-prefix |
| no-parent-imports | imports from the project root, never a relative climb | `house/no-parent-imports` | **gap**: ast-grep house-no-super-path | **gap**: ast-grep house-no-parent-include | n/a: namespaces, not paths | n/a: packages, not paths |
| no-import-cycle | no import cycle | `import/no-cycle` | n/a: crate cycles are a compile error; module cycles are legal | misc-header-include-cycle | **gap**: none free; a dependency test (NetArchTest) later | **gap**: none free; a dependency test (Konsist) later |
| sorted-imports | imports first and in a fixed order | `perfectionist/sort-named-imports`, `import/first` | rustfmt reorder_imports | clang-format SortIncludes | dotnet format with dotnet_sort_system_directives_first | ktlint import-ordering |
| no-unused | no unused import, variable or parameter | `unused-imports/no-unused-imports` | rustc unused_imports, unused_variables | misc-unused-parameters, misc-unused-using-decls | IDE0005, IDE0060 | ktlint no-unused-imports; detekt UnusedParameter |
| no-suppression | no disable or suppress comment or attribute; exemptions live in config with a reason | `no-warning-comments`, `typescript/ban-ts-comment` | clippy allow_attributes, allow_attributes_without_reason | **gap**: avi12-lint text check no-suppress-comment (NOLINT and clang diagnostic pragmas) | **gap**: avi12-lint text check no-suppress-comment (pragma warning disable, SuppressMessage) | detekt ForbiddenAnnotation (Suppress), ForbiddenComment |
| todo-needs-owner | no TODO without an owner | `doc:CLAUDE.md Tidiness` | clippy todo, unimplemented | google-readability-todo | Sonar S1135 | detekt ForbiddenComment |
| no-em-dash | no em dash in code, comments or docs | `house/no-em-dash` | **gap**: avi12-lint text check no-em-dash | **gap**: avi12-lint text check no-em-dash | **gap**: avi12-lint text check no-em-dash | **gap**: avi12-lint text check no-em-dash |
| banned-apis | named globals, functions and types are forbidden, each with a message | `no-restricted-globals`, `typescript/no-explicit-any` | clippy disallowed_methods, disallowed_types | bugprone-unsafe-functions CustomFunctions | BannedApiAnalyzers RS0030 with BannedSymbols.txt | detekt ForbiddenMethodCall, ForbiddenImport |
| throw-error-types | throw only error types, never a literal; catch narrowly | `no-throw-literal` | n/a: errors are typed | hicpp-exception-baseclass, bugprone-empty-catch | CA2201, CA1031 | detekt TooGenericExceptionThrown, TooGenericExceptionCaught, EmptyCatchBlock |
| no-floating-result | an ignored result or promise is deliberate | `no-void` | rustc unused_must_use; clippy let_underscore_future | modernize-use-nodiscard, bugprone-unused-return-value | CS4014 | **gap**: none free; ast-grep house-unused-deferred |
| for-of | iterate with for-of, no index loops, no forEach or reduce | `unicorn/no-array-for-each` | clippy needless_range_loop | modernize-loop-convert | n/a: foreach and LINQ are idiomatic | n/a: forEach is idiomatic |
| concise-forms | no redundant closure, field name or object initializer | `object-shorthand`, `arrow-body-style` | clippy redundant_closure, redundant_field_names | readability-redundant-member-init, readability-redundant-string-cstr, readability-redundant-smartptr-get, readability-redundant-control-flow | IDE0017, IDE0028, IDE0090 | detekt UnnecessaryLet, UnnecessaryParentheses |
| no-import-work | no work at module load, so unused code is dropped | `house/tree-shaking` | n/a: statics are const-evaluated | cert-err58-cpp | CA1810, CA2207 | **gap**: ast-grep house-no-object-init-work |
| public-api-docs | every public symbol has a description | `jsdoc-js/require-jsdoc` | rustc missing_docs | ~ clang -Wdocumentation | CS1591 with GenerateDocumentationFile | detekt UndocumentedPublicClass, UndocumentedPublicFunction |
| no-restating-comments | no comment that restates the code | `doc:CLAUDE.md Which rules win` | **gap**: review only | **gap**: review only | **gap**: review only | **gap**: review only |
| file-per-concern | one concern per file, named after its main declaration | `doc:CLAUDE.md Code style` | n/a: a file is a module | **gap**: review only: a header and source pair is a file-system rule, no linter sees it | StyleCop SA1649, SA1402 | ktlint filename; detekt MatchingDeclarationName |
| size-limits | functions and classes stay small | `max-depth` | clippy too_many_lines, cognitive_complexity | readability-function-size, readability-function-cognitive-complexity | CA1502, CA1506 | detekt LongMethod, CyclomaticComplexMethod, TooManyFunctions |
| no-dead-code | no unused export, file or dependency | `doc:fallow` | rustc dead_code; cargo-machete | ~ -Wunused, linker --gc-sections report; no cross-file tool | ~ IDE0051, IDE0052 for private; public is a gap | ~ compiler warnings, detekt UnusedPrivateMember; public is a gap |
| narrowest-visibility | private or internal by default | `typescript/explicit-member-accessibility` | rustc unreachable_pub | misc-use-internal-linkage, misc-use-anonymous-namespace | IDE0040, CA1812 | compiler -Xexplicit-api=strict |
| warnings-are-errors | correctness findings fail the run | `doc:categories.correctness` | cargo clippy -- -D warnings | WarningsAsErrors: '*' in .clang-tidy | TreatWarningsAsErrors, AnalysisMode | allWarningsAsErrors; maxIssues 0 in detekt.yml |
| formatting | the formatter owns layout; the language style guide wins over house layout rules | `doc:oxfmt` | rustfmt (width 100) | clang-format BasedOnStyle Google | dotnet format with .editorconfig | the formatter is ktlint |

<!-- matrix:end -->

Rule ids marked from memory (Roslynator, Sonar and StyleCop ids, some clippy names)
are verified in phase 0 against each tool's own rule listing

## Tools surveyed (versions of 2026-11)

| Language | Use | Considered | Version |
|---|---|---|---|
| Rust | clippy with a `[lints]` table, rustfmt, cargo-machete, cargo-deny | dylint 6.4.0 for custom lints (needs a nightly toolchain pin, kept for type-aware gaps only) | clippy 0.1.99, cargo-deny 0.20.2, machete 0.9.2 |
| C++ | clang-format, clang-tidy (`run-clang-tidy -j`) | cppcheck (not installed, overlaps clang-tidy); custom clang-tidy checks need an LLVM build, rejected | LLVM 22.1.7 |
| C# | Roslyn analyzers through `.editorconfig` severity and `Directory.Build.props`: built-in CA and IDE, Roslynator, Meziantou, StyleCop (SA1402, SA1649 only), BannedApiAnalyzers; `dotnet format` | a custom Roslyn analyzer package, kept for type-aware gaps only | .NET SDK 10.0.404, Roslynator 5.0.1, Meziantou 3.0.339, StyleCop 1.3.180 |
| Kotlin | ktlint (format and style), detekt (correctness, naming, complexity) as CLI jars, compiler warnings as errors | custom ktlint and detekt rule sets, kept for type-aware gaps only | ktlint 1.8.0, detekt 1.23.8 |
| All | ast-grep (YAML rules over tree-sitter) | semgrep (Python, slower start, not installed; ast-grep needs no runtime) and a hand-written tree-sitter binary (duplicates ast-grep) | ast-grep 0.51.2, tree-sitter 0.27.2 |

## Measured

One run each on this machine, one at a time, wall time and peak working set of the whole process tree

| Tool | Input | Time | Peak memory |
|---|---|---|---|
| rustfmt `--check` | pade, 48k lines | 1.2 s | 155 MB |
| clippy, cold | winui-svelte `launcher`, 1.5k lines, few dependencies | 2.1 s | 230 MB |
| ast-grep, two rules | pade, 48k lines | 0.4 s | 54 MB |
| clang-format, one call | edge-plus DLL, 112 files | 1.5 s | 225 MB |
| clang-format, one process per file | the same tree plus its build folder | 153 s | 619 MB |
| clang-tidy | one translation unit, edge-plus `dllmain.cpp` | 6.2 s | 416 MB |
| ast-grep, two rules | edge-plus DLL | 0.5 s | 58 MB |
| `dotnet build` with analyzers | companion, 5.3k lines, cold | 9.8 s | 634 MB |
| ast-grep, one rule | companion | 0.5 s | 81 MB |
| ktlint | ide-code-walkthrough, 19k lines | 4.0 s | 827 MB |
| detekt | ide-code-walkthrough | 6.0 s | 511 MB |
| ast-grep, two rules | ide-code-walkthrough | 0.5 s | 57 MB |

What the numbers say
- ast-grep is 10 to 100 times cheaper than any compiler-backed tool, and its cost does not grow with the toolchain
- Spawning a formatter per file is 100 times slower than one call; the runner always batches
- clang-tidy costs about 6 s and 400 MB a unit; 27 units run serially is minutes, so the runner needs `-j` bounded by the memory guard and a changed-files mode
- ktlint and detekt are cheap as CLI jars; run them one after another, not together (827 MB)
- Cold clippy on a Tauri crate was not measured (it compiles the dependency tree once, minutes); a shared `CARGO_TARGET_DIR` keeps it warm
- The house rule that ast-grep fills most, a compound condition not extracted into a named boolean, finds 64 places in pade, 13 in ide-code-walkthrough, 12 in the companion and 1 in the edge-plus C++; there is no narrowing exemption yet (the TypeScript rule has one, see `guarded-conditions.js`)

## Architecture

```text
packages/
  house-rules/        rules.json (the matrix), render.js; the single source of truth
  ast-grep-rules/     one rule pack, one file per rule, a `language:` per file, shared ids
  rust-config/        Cargo [lints] snippet, clippy.toml, rustfmt.toml, deny.toml
  cpp-config/         .clang-format, .clang-tidy (Google, house checks), run-clang-tidy settings
  csharp-config/      Directory.Build.props, .editorconfig severities, BannedSymbols.txt
  kotlin-config/      detekt.yml, .editorconfig for ktlint, Gradle snippet
  avi12-lint/         detects languages, plans and guards the runs
```

| Rule class | Engine |
|---|---|
| Correctness, naming case, complexity, unused, casts, banned APIs | The language's own tool, configured from the matrix |
| Layout | rustfmt, clang-format, `dotnet format`, ktlint |
| Structure that needs only syntax (named boolean condition, suppress comments, parent paths, abbreviation list, declared-boolean prefix, index prefix, magic numbers in Rust) | ast-grep rule pack |
| Text (em dash, Markdown prose) | one check in `avi12-lint`, any file |
| Needs types (boolean prefix of an inferred type, swappable parameters) | Later: a detekt rule, a Roslyn analyzer or dylint, only if the declared-type ast-grep rule proves too weak |

What we write ourselves: the ast-grep pack (about 12 small YAML rules),
the runner integration and the per-language presets; nothing else until a measured need

### Runner

- Detection by file: `Cargo.toml`, `.clang-format` or `.clang-tidy`, `*.csproj`, `build.gradle.kts` or `detekt.yml`, `sgconfig.yml`
- Plans extend `plan.js`: every tool is one step with a name, a command, a memory estimate and an input set
  (the changed files, or the project for compiler-backed tools)
- Memory and time guards extend `guard.js` with the measured numbers above:
  clang-tidy `-j` is the free memory divided by 450 MB, JVM tools never run together, `dotnet build -m:1`, `cargo clippy -j`
- Changed-files mode: ast-grep, clang-format, clang-tidy, ktlint and detekt take file lists;
  clippy and `dotnet build` are project-wide and run only when a file of their language changed
- Kotlin runs the CLI jars from a cache folder instead of Gradle; Gradle stays the build's own gate
- The no-disable-comments rule is the matrix row `no-suppression`, enforced per language;
  an exemption lives in the preset's config with a reason, never at the line
- Tests, one per language: a clash test (the configured rule set contains no pair that
  contradicts another, as `clash.test.js` does), a fixer-stability test (formatter, fixer, formatter leaves no diff:
  clang-format and `clang-tidy --fix`, ktlint format and detekt autocorrect, rustfmt and `clippy --fix`,
  `dotnet format` style and whitespace), and a fixture per matrix row that proves its rule fires;
  a test skips with a message when the tool is not installed, as the WebStorm check does

## Phased plan

| Phase | Work | Effort |
|---|---|---|
| 0 | The matrix, its renderer and tests (done in this change); verify every rule id against each tool's own listing in a test that skips when the tool is missing | 0.5 day |
| 1 | `ast-grep-rules` pack for the structural gaps, runner step with changed-files mode, fixtures; first because it covers all four languages at once with no toolchain | 1.5 days |
| 2 | `kotlin-config`: detekt and ktlint presets read from the matrix, CLI-jar runner step; converges the three Kotlin repos | 1 day |
| 3 | `rust-config`: `[lints]` snippet, `clippy.toml`, `rustfmt.toml`, deny and machete steps | 1 day |
| 4 | `cpp-config`: `.clang-tidy` preset from edge-plus and any-stt, `compile_commands.json`, `run-clang-tidy -j`, vcvars once, changed units only | 1.5 days |
| 5 | `csharp-config`: `Directory.Build.props`, `.editorconfig` severities, analyzer references, `BannedSymbols.txt`, `dotnet format` step | 1.5 days |
| 6 | Optional, only for measured gaps that need types: a detekt rule, a Roslyn analyzer or a dylint lint | 2 days |

Consumers migrate one repository per phase, after the tag, each in its own change
