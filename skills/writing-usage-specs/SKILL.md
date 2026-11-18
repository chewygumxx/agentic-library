---
name: writing-usage-specs
description: >-
  Writes and checks usage specs, the KDL describing a CLI's commands,
  arguments and flags, and generates completions, docs and clients from
  them. Use when writing, reviewing or debugging a usage spec, whether a
  .usage.kdl file, the #USAGE comments of a script run by a usage
  shebang, or a mise task's usage field; or when generating shell
  completions, Markdown, man pages, SDKs or a breaking-change check from
  one with the usage CLI.
license: GPL-3.0-only
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/writing-usage-specs/SKILL.md
   -
   -->

# Writing usage specs

## Workflow

1. Find the source the CLI actually reads. Edit a hand-written
   `.usage.kdl`, a script's `#USAGE` or `//USAGE` comments, or a mise
   task's `usage` field in place. If a framework exports the spec, edit
   its CLI declarations and regenerate the export. Check the
   [script runner and sidecar rules](./references/scripts.md) when a
   file's diagnostics and runtime disagree.
2. Run `usage --version` to check the available CLI. Use the project's
   pinned version if it has one and check compatibility with its
   oldest supported version. The examples here were checked on 7.4.0.
   See [upstream installation](https://usage.jdx.dev/cli/#installation) if the
   executable is missing.
3. Make the smallest interface change. Declare constraints such as
   choices and required values in KDL when the runtime enforces them.
   Use `#true` and `#false` for booleans, `<name>` for required values,
   `[name]` for optional values, and a trailing `...` for variadics.
   Put one-line descriptions in `help` and details in `long_help`.
4. Lint the actual spec, then verify a representative success and
   rejection. Use `usage explain --format json` to check bindings and
   value origins. A report can exit zero with errors, so assert that
   `errors` is empty and `refused` is null for a valid case, and check the
   expected value or error. Run the actual script or task for runtime
   changes, including dynamic choices and mounts. Probe candidates
   with `usage complete-word` for completion changes. See
   [verification](./references/verification.md) for runnable checks.

For stdin, use `-f -` with spec readers such as `explain` and generators,
and a positional `-` with `lint` and `diff`. A relative `include` needs
a source file. Use a file path when a spec has relative includes.
`usage mcp` uses stdin for its transport.

## Runnable example

From the skill directory, with Usage and Bash on `PATH`, run
[greet.sh](./scripts/greet.sh). It keeps the interface in `#USAGE`
comments and prints a greeting from the parsed values.

```sh
usage lint -W scripts/greet.sh
./scripts/greet.sh Ada
./scripts/greet.sh --help
./scripts/greet.sh --greeting goodbye Ada
```

The normal invocation prints `hello, Ada` and exits 0. Help shows
`--greeting` and exits 0. The rejected greeting exits 1 and prints an
invalid-choice diagnostic on stderr. Run
[check-example.sh](./scripts/check-example.sh) with `jq` on `PATH` to
assert lint, bindings, completion, and script behavior together.

```sh
./scripts/check-example.sh
```

## Read by task

- [Arguments and flags](./references/arguments-and-flags.md) for
  arity, forwarding, choices, defaults, relationships, and flag scope.
- [Commands and the root](./references/commands.md) for aliases,
  dispatch, help layout, effects, mounts, and deprecation.
- [Completion](./references/completion.md) for candidates, dynamic
  providers, delegation, and shell setup.
- [Shared and structured declarations](./references/structure.md)
  for includes, shared flags, groups, sigils, clauses, and outputs.
- [Settings](./references/config.md) for config sources, types, and
  JSON Schema.
- [Scripts and mise tasks](./references/scripts.md) for spec lookup,
  shebangs, environment exports, and exit statuses.
- [Verification](./references/verification.md) for choosing checks
  and diagnosing rejections or unexpected bindings.
- [Generators](./references/generators.md) for docs, clients, spec
  diffs, framework exports, and MCP.

Use the matching Usage release's [upstream source](https://github.com/jdx/usage/releases)
when behavior depends on the version. For the full language and tested
behavior, see the [Usage specification](https://usage.jdx.dev/spec/),
[argv grammar](https://usage.jdx.dev/spec/argv),
[configuration resolution](https://usage.jdx.dev/spec/resolution), and
[7.4.0 conformance corpus](https://github.com/jdx/usage/blob/v7.4.0/corpus/README.md).
