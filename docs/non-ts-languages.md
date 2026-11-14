# Linting Rust, C++, C# and Kotlin

Research for extending lint-config beyond TypeScript
Status: phases 0 to 5 done (0.10.0): the matrix with every tool id verified, the ast-grep rule packs, the runner steps and the Kotlin presets with their ktlint and detekt step; phase 6 is open

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
| max-nesting | block nesting at most 3 deep, callbacks at most 3 deep | `max-depth`, `max-nested-callbacks` | ~ clippy cognitive_complexity with cognitive-complexity-threshold (20; it counts branches, not nesting) | ~ readability-function-cognitive-complexity | Sonar S134 (max 3) | detekt NestedBlockDepth (threshold 4: a depth of 4 is flagged, so at most 3 deep passes) |
| named-boolean-condition | a compound or comparing condition is extracted into a named boolean first | `house/google-syntax` | **gap**: ast-grep house-compound-condition | **gap**: ast-grep house-compound-condition | **gap**: ast-grep house-compound-condition | **gap**: ast-grep house-compound-condition |
| no-magic-numbers | a number other than 0, 1, -1, 2 is a named constant | `house/no-magic-numbers` | **gap**: ast-grep house-magic-number | readability-magic-numbers (IgnoredIntegerValues) | Sonar S109 | detekt MagicNumber (ignoreNumbers) |
| no-unchecked-unwrap | no non-null assertion and no unwrap of an absent value | `typescript/no-non-null-assertion` | clippy unwrap_used, expect_used | bugprone-unchecked-optional-access | **gap**: ast-grep house-null-forgiving, with CS8602 as an error | detekt UnsafeCallOnNullableType; ast-grep house-null-forgiving for the !! operator |
| no-unchecked-cast | no unsafe or unchecked cast | `typescript/consistent-type-assertions` | rustc unsafe_code = forbid (a crate that calls Win32 allows it in avi12-rust.local.toml), clippy as_conversions, cast_possible_truncation | google-readability-casting, cppcoreguidelines-pro-type-cstyle-cast, -const-cast, -reinterpret-cast | AllowUnsafeBlocks off, IDE0019, IDE0020 | detekt UnsafeCast (only a cast that can never succeed) |
| parameter-object | two or more parameters become one parameter object | `house/positional-parameters` | ~ clippy too_many_arguments with too-many-arguments-threshold (5: from six parameters a struct says what each one is) | ~ bugprone-easily-swappable-parameters | ~ named arguments; CA1068 and Sonar S107 past a threshold | ~ named arguments; detekt LongParameterList past a threshold |
| no-written-return-types | infer return types instead of writing them | `house/house-syntax` | n/a: the language requires them | n/a: the language requires them | n/a: the language requires them | n/a: the language style guide wins |
| identifier-length | names of at least 3 characters, with a short allow-list | `id-length` | clippy min_ident_chars with allowed-idents-below-min-chars (threshold 2; i, j, x, y, id, to, on, ok, Io, T and E pass) | readability-identifier-length (IgnoredVariableNames) | **gap**: ast-grep house-identifier-length | detekt VariableMinLength, FunctionMinLength (minimum 2; a single letter such as i, x or y is flagged, and of, on, to and id pass) |
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
| concise-forms | no redundant closure, field name or object initializer | `object-shorthand`, `arrow-body-style` | clippy redundant_closure, redundant_field_names | readability-redundant-member-init, readability-redundant-string-cstr, readability-redundant-smartptr-get, readability-redundant-control-flow | IDE0017, IDE0028, IDE0090 | detekt UnnecessaryLet; ktlint mixed-condition-operators |
| no-import-work | no work at module load, so unused code is dropped | `house/tree-shaking` | n/a: statics are const-evaluated | cert-err58-cpp | CA1810, CA2207 | **gap**: ast-grep house-no-object-init-work |
| public-api-docs | every public symbol has a description | `jsdoc-js/require-jsdoc` | rustc missing_docs | ~ clang -Wdocumentation | CS1591 with GenerateDocumentationFile | detekt UndocumentedPublicClass, UndocumentedPublicFunction |
| no-restating-comments | no comment that restates the code | `doc:CLAUDE.md Which rules win` | **gap**: review only | **gap**: review only | **gap**: review only | **gap**: review only |
| file-per-concern | one concern per file, named after its main declaration | `doc:CLAUDE.md Code style` | n/a: a file is a module | **gap**: review only: a header and source pair is a file-system rule, no linter sees it | StyleCop SA1649, SA1402 | ktlint filename; detekt MatchingDeclarationName |
| size-limits | functions and classes stay small | `max-depth` | clippy too_many_lines (threshold 100), cognitive_complexity (threshold 20) | readability-function-size, readability-function-cognitive-complexity | CA1502, CA1506 | detekt LongMethod, CyclomaticComplexMethod, TooManyFunctions |
| no-dead-code | no unused export, file or dependency | `doc:fallow` | rustc dead_code; cargo-machete | ~ -Wunused, linker --gc-sections report; no cross-file tool | ~ IDE0051, IDE0052 for private; public is a gap | ~ compiler warnings, detekt UnusedPrivateMember; public is a gap |
| narrowest-visibility | private or internal by default | `typescript/explicit-member-accessibility` | rustc unreachable_pub | misc-use-internal-linkage, misc-use-anonymous-namespace | IDE0040, CA1812, CA1515 | compiler -Xexplicit-api=strict |
| warnings-are-errors | correctness findings fail the run | `doc:categories.correctness` | cargo clippy -- -D warnings | WarningsAsErrors: '*' in .clang-tidy | TreatWarningsAsErrors, AnalysisMode | allWarningsAsErrors; maxIssues 0 in detekt.yml |
| formatting | the formatter owns layout; the language style guide wins over house layout rules | `doc:oxfmt` | rustfmt (width 100) | clang-format BasedOnStyle Google | dotnet format with .editorconfig | the formatter is ktlint |

<!-- matrix:end -->

Every tool rule id in the matrix is verified against `packages/house-rules/tool-ids/*.txt`,
written by `pnpm ids:refresh` from the tools themselves (clippy and rustc `-W help`, `clang-tidy --list-checks`,
the Roslyn analyzer packages, `detekt --generate-config`, the ktlint standard rule set), and a test fails on an id no list has
Config keys (clippy.toml thresholds, clang-tidy options, detekt properties) are not rule ids and are not checked

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
| rust steps (fmt, clippy, machete, deny), cold | pade `src-tauri`, 48k lines, the whole Tauri tree, 4 jobs, own target folder | 67.7 s | 2758 MB |
| rust steps, warm | pade `src-tauri` | 3.4 s | 192 MB |
| rust steps, cold | edge-plus `app/panel/src-tauri`, 12k lines | 51.9 s | 2462 MB |
| rust steps, warm | edge-plus `app/panel/src-tauri` | 4.1 s | 528 MB |
| clippy, cold | any-stt `winui/src-tauri` (Tauri) | 46.1 s | 2602 MB |
| clippy, cold | agentic-gaming-assistant `src-tauri` (Tauri) | 64.8 s | 2424 MB |
| `cargo fmt --check`, `cargo machete`, `cargo deny check`, warm | pade | 0.4 s, 0.1 s, 1.2 s | under 100 MB |
| ast-grep, two rules | pade, 48k lines | 0.4 s | 54 MB |
| clang-format, one call | edge-plus DLL, 112 files | 1.5 s | 225 MB |
| clang-format, one process per file | the same tree plus its build folder | 153 s | 619 MB |
| clang-tidy | one translation unit, edge-plus `dllmain.cpp` | 6.2 s | 416 MB |
| ast-grep, two rules | edge-plus DLL | 0.5 s | 58 MB |
| clang-tidy, cold | any-stt dictation DLL, 65 units, 32 workers | 13.6 s | 4167 MB |
| clang-tidy, warm (every unit cached) | any-stt | 3.4 s | 168 MB |
| clang-tidy, one unit edited | any-stt | 4.8 s | 121 MB |
| clang-tidy `--fix`, in place, one unit at a time | any-stt | 88 s | n/a |
| clang-tidy `--fix`, exported, merged and applied once | any-stt | 13 s | n/a |
| clang-tidy, cold | edge-plus DLL, 27 units | 15.4 s | 2369 MB |
| clang-tidy, warm | edge-plus | 4.0 s | 98 MB |
| clang-tidy, cold | windows-skin-switcher, 13 C++/WinRT units | 68.9 s | 13356 MB |
| clang-tidy, warm | windows-skin-switcher | 3.5 s | 179 MB |
| csharp steps (`dotnet format`, `dotnet build` with analyzers), cold | companion, 5.3k lines, WinUI 3, restore and compile | 25.7 s | 602 MB |
| csharp steps, warm | companion | 20.4 s | 693 MB |
| csharp steps, cold | windows-skin-switcher, 1.2k lines, WinUI 3 | 26.6 s | 595 MB |
| csharp steps, warm | windows-skin-switcher | 20.9 s | 600 MB |
| csharp steps, `--changed` with one file | companion | 20.4 s | 708 MB |
| ast-grep, one rule | companion | 0.5 s | 81 MB |
| ktlint | ide-code-walkthrough, 19k lines | 4.0 s | 827 MB |
| detekt | ide-code-walkthrough | 6.0 s | 511 MB |
| ast-grep, two rules | ide-code-walkthrough | 0.5 s | 57 MB |

What the numbers say
- ast-grep is 10 to 100 times cheaper than any compiler-backed tool, and its cost does not grow with the toolchain
- Spawning a formatter per file is 100 times slower than one call; the runner always batches
- clang-tidy costs about 6 s and 400 MB a unit; 27 units run serially is minutes, so the runner needs `-j` bounded by the memory guard and a changed-files mode
- A C++/WinRT unit costs 2 GB where a plain Win32 unit costs 130 MB, so the pool learns the cost from the running units; the guard is soft (windows-skin-switcher peaked at 13 GB with the default pool, `AVI12_LINT_TIDY_JOBS=5` keeps it near 8 GB)
- The cache makes a warm run cost the node start, the Visual Studio environment and one clang-format call, about 3.5 s, whatever the unit count
- ktlint and detekt are cheap as CLI jars; run them one after another, not together (827 MB)
- A cold clippy on a Tauri crate compiles the dependency tree once, 45 to 70 s and about 2.6 GB with four jobs; every later run is under 5 s; the 1.2 GB target folder lives in `.verify/rust-target`, apart from the dev build, so a lint run never waits for the lock of a running `cargo tauri dev` (`AVI12_LINT_RUST_TARGET=shared` opts out; a shared folder was not measured)
- The house rule that ast-grep fills most, a compound condition not extracted into a named boolean, finds 64 places in pade, 13 in ide-code-walkthrough, 12 in the companion and 1 in the edge-plus C++; there is no narrowing exemption yet (the TypeScript rule has one, see `guarded-conditions.js`)

## Architecture

```text
packages/
  house-rules/        rules.json (the matrix), render.js; the single source of truth
  ast-grep-rules/     one rule pack, one file per rule, a `language:` per file, shared ids
  rust-config/        Cargo [lints] snippet, clippy.toml, rustfmt.toml, deny.toml
  cpp-config/         .clang-format, .clang-tidy (Google, house checks), run-clang-tidy settings
  csharp-config/      analyzers.json (packages, project properties, fixer exclusions), style.json (layout, naming), diagnostics.json (a severity per rule, a reason for each rule that is off, thresholds), sonar.json, banned.json; the generator writes .editorconfig, Directory.Build.props and .avi12-csharp/
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

What we wrote ourselves: the ast-grep packs (25 small YAML rules over the four languages),
the runner integration and the per-language presets; nothing else until a measured need

### Runner

- Detection by file: `Cargo.toml`, `.clang-format` or `.clang-tidy`, `*.csproj`, `build.gradle.kts` or `detekt.yml`, `sgconfig.yml`
- Plans extend `plan.js`: every tool is one step with a name, a command, a memory estimate and an input set
  (the changed files, or the project for compiler-backed tools)
- Memory and time guards extend `guard.js` with the measured numbers above:
  clang-tidy `-j` is the free memory divided by 450 MB, JVM tools never run together, `dotnet build -m:1`, `cargo clippy -j`
- Changed-files mode: ast-grep, clang-format, clang-tidy, ktlint and detekt take file lists;
  clippy and `dotnet build` are project-wide and run only when a file of their language changed; Rust narrows to the crates that own a changed `.rs` file (`-p crate`)
- Kotlin runs the CLI jars from a cache folder instead of Gradle (done, 0.7.0); Gradle stays the build's own gate
- detekt rules that need types run against the Kotlin standard library only (detekt's own jar as the classpath), because the project classpath needs Gradle; the two rules that misfire on unresolved calls are off
- C++ runs one `clang-format` call over every covered file and one `clang-tidy` process per translation unit through a pool; a passed unit is cached by the tool version, the `.clang-tidy`, the compile arguments, the unit and the project headers it includes (found by following its `#include` lines), so a header edit reruns every unit that includes it and nothing else
- clang-tidy `--fix` is opt in (`AVI12_LINT_TIDY_FIX=1`) and runs as export, merge and apply: an in-place fix per unit renames a declaration and only the uses in that unit, so every unit analysed after it fails to compile; the merge is per diagnostic (whole or not at all) and keys a file by its canonical path, because a unit in `test/` names a header as `test/../src/x.h`
- Four fixer defects found by the pilots: `modernize-use-ranges` writes `std::ranges::sort(range, , comparator)` (off in the preset), `misc-use-internal-linkage` makes `DllMain` and `wmain` static (off in the preset), a rename of `__ImageBase` or `wmain` breaks the link (ignored by default), and `readability-identifier-naming` renames a hand-declared mirror of a Windows type (each repo ignores its mirrors, with a reason)
- C# runs `dotnet format` and `dotnet build -warnaserror` per solution, or per project no solution covers, serially, with one MSBuild node, no node reuse and no compiler server (`-m:1 -nodeReuse:false -p:UseSharedCompilation=false --no-incremental`), so no process outlives its step; the build goes into `.verify/csharp-artifacts` (`--artifacts-path`), so the dev build bin and obj are never touched or locked, and the guard is 6 GB and 20 minutes (`AVI12_LINT_CSHARP_MEMORY_MB`, `AVI12_LINT_CSHARP_TIME_LIMIT_MS`)
- `avi12-lint csharp-config` writes `.editorconfig`, `.avi12-csharp/analyzers.props` (the analyzer package references, `Nullable`, `TreatWarningsAsErrors`, `EnforceCodeStyleInBuild`), `BannedSymbols.txt`, `CodeMetricsConfig.txt`, `SonarLint.xml` and a `Directory.Build.props` that imports the props (a repo with its own `Directory.Build.props` imports `.avi12-csharp/analyzers.props` itself); `avi12-csharp.local.json` holds the repo exemptions, each with its reason: `diagnostics` (a rule id to a severity and a reason), `files` (the same for one file), `directories` (the same, written as a nested `.editorconfig`), `options` and `properties` (a value and a reason), `thresholds` (a value and a reason), `banned` and `unbanned`, `generatedPaths` (a glob to a reason), `sections` (extra `.editorconfig` sections such as `end_of_line = crlf`) and `targets` (the solutions or projects to build)
- `dotnet format` never fixes `IDE0051`, `IDE0052`, `IDE0060`, `RCS1213`, `RCS1163` or `CA1515` (`formatExcludes` in `analyzers.json`): the workspace it loads has no XAML-generated code, so a handler only the markup binds looks unused and the fixer deleted `OnSkinPicked` and a dozen more in windows-skin-switcher, and the `CA1515` fixer made the XAML `App` class internal; `dotnet build` still reports the rules
- Compiler warnings are errors, and CS1591 (XML comment on a public member) is only reported by a compile that has no other error, so its fixture is a project of its own
- Sonar category switches do not work (a category name holds spaces, which a `.editorconfig` key cannot), so the generator writes `none` for every Sonar rule id but the four kept (`S107`, `S109`, `S134`, `S1135`); StyleCop is switched off by its eight category names but `SA1402` and `SA1649`
- Rules the pilots made the preset turn off, each with its reason in `diagnostics.json`: `CA1707` (CONSTANT_CASE needs underscores), `MA0006`, `MA0011`, `MA0016`, `MA0004`, `MA0026`, `MA0046`, `MA0048`, `MA0051` and `MA0134` (each duplicates a rule another package owns, or targets a library surface)
- The pilots turned off per repo, with the reason in `avi12-csharp.local.json`: `CA1031` where every catch is an app boundary, `RCS1075` for two best-effort cleanups, `CS1591`, `CA1515` and `MA0147` in WinUI apps (the XAML compiler makes the window public and async void is how a handler is written), `IDE1006` for a file that mirrors windows.h, `S107` for a six-parameter Win32 callback
- `S109` has no allow-list, so `/ 2` and bit shifts are reported; the house rule allows 2, which the pilots meet with a named constant; `IDE1006` has no Fix All, so a rename is a scripted pass checked by the compiler, and it cannot tell a positional record parameter from a parameter (a record is written with its members)
- `--only=csharp` runs these steps and the ast-grep C# pack; `--changed` formats the changed `.cs` files and builds only the target that owns a changed file (a changed `.editorconfig`, props, local file or `.avi12-csharp` input means every target)
- Per-folder exemptions are a `.clang-tidy` with `InheritParentConfig: true`, written by the generator from `tidy.directories`; findings in generated code are `tidy.ignoredPaths`
- Rust runs `cargo fmt`, `cargo clippy --keep-going`, `cargo machete` and `cargo deny` per Cargo root, serially, with `CARGO_BUILD_JOBS` 4 and a guard of 8 GB and 30 minutes (a cold Tauri tree peaks near 2.8 GB)
- clippy has no `extends`, so `avi12-lint rust-config` writes `clippy.toml`, `rustfmt.toml`, `deny.toml` and a managed `[lints]` block into each root; `avi12-rust.local.toml` holds the repo's exemptions, each with its reason, per workspace or per member crate
- `--keep-going` matters: a crate that fails hides the lints of every crate that depends on it, so without it a migration needs one build per layer
- The ast-grep Rust rules also run on a pilot: counts at the time of the pilots were winui-svelte `launcher` 33, pade 1957 (1188 of them `use super::*` in test modules), edge-plus 154, any-stt 32 and agentic-gaming-assistant 297; none of the pilots gates on them yet
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
| 0 | Done (0.6.0): the matrix, its renderer and tests; every rule id verified against the committed per-tool id lists | 0.5 day |
| 1 | Done (0.6.0): `ast-grep-rules` packs (one config per language, because ast-grep rejects a repeated id in one config), the `text-check` step, the runner steps with changed-files mode, fixtures | 1.5 days |
| 2 | Done (0.7.0): `kotlin-config`: detekt and ktlint presets read from the matrix, CLI-jar runner step with pinned checksums, fixtures and a fixer-stability test; winui-svelte `ide/webstorm`, ide-code-walkthrough and sb-companion converge on it | 1 day |
| 3 | Done (0.8.0): `rust-config`: lint levels, `clippy.toml`, `rustfmt.toml`, `deny.toml`, the generator `avi12-lint rust-config`, fmt, clippy, machete and deny steps, fixture crates; pilots winui-svelte `launcher`, pade, edge-plus, any-stt and agentic-gaming-assistant | 1 day |
| 4 | Done (0.9.0): `cpp-config`: `.clang-format` and `.clang-tidy` presets with fixtures, the generator `avi12-lint cpp-config`, a compile database from CMake, a sighmake buildscript or a flat description, vcvars read once, one clang-format call, a cached memory-bounded clang-tidy pool, merged parallel fixes, changed units only; pilots edge-plus, any-stt and windows-skin-switcher | 1.5 days |
| 5 | Done (0.10.0): `csharp-config`: Roslyn analyzer references, a generated `.editorconfig` (Google layout, house naming, one severity per rule, a reason for each rule that is off), banned symbols, code metrics and Sonar thresholds, the generator `avi12-lint csharp-config`, serial guarded `dotnet format` and `dotnet build -warnaserror` steps, fixtures that mark the line each rule must flag, a fixer-stability test; pilots companion and windows-skin-switcher | 1.5 days |
| 6 | Optional, only for measured gaps that need types: a detekt rule, a Roslyn analyzer or a dylint lint | 2 days |

Consumers migrate one repository per phase, after the tag, each in its own change
