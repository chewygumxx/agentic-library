---
name: usage-spec
description: >-
  Use when writing, reviewing or debugging a usage spec, whether a
  .usage.kdl file, the #USAGE comments of a script run by a usage
  shebang, or a mise task's usage field; or when generating shell
  completions, Markdown, man pages, SDKs or a breaking-change check from
  one with the usage CLI.
license: GPL-3.0-only
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/usage-spec/SKILL.md
   -
   -->

# Usage specs

A usage spec describes a CLI's commands, arguments, flags, help,
completion and settings once, in [KDL](https://kdl.dev). The `usage` CLI
parses scripts against it and generates what a CLI ships with:
completions, reference pages, man pages and typed clients. mise reads the
same language for its tasks' arguments. Here is how a spec is written,
checked and put to work. Written against usage 7.4.

The typed Rust and Go frameworks that emit a spec from code are out of
scope; see `https://usage.jdx.dev/rust/` and `https://usage.jdx.dev/go/`.

## Where a spec lives

- **A `.usage.kdl` file**, named for the binary: `mycli.usage.kdl`.
- **Comments at the top of a script** run by a usage shebang. The prefix
  follows the language, `#USAGE` or `//USAGE`; `# [USAGE]` is also read.

  ```bash
  #!/usr/bin/env -S usage bash
  #USAGE flag "-f --force" help="Overwrite the output"
  #USAGE arg "<file>" help="File to write" default="out.txt"
  [ "$usage_force" = true ] && rm -f "$usage_file"
  ```

  `usage zsh`, `usage fish` and `usage powershell` run the other shells;
  any other interpreter goes through `usage exec`, as
  `#!/usr/bin/env -S usage exec node`, or with its arguments quoted as one
  word, `usage exec "deno run --allow-env=usage_*"`.

- **A mise task's `usage` field**, a string of the same KDL:
  `usage = 'flag "--staged" help="Lint staged files alone"'`.

- **Printed by the CLI itself**, by a framework integration such as
  `mycli --usage-spec`, or `mycli __usage_spec__` from the Rust framework.
  Every `usage` command that takes `-f` takes `-` for stdin, so pipe it.

## KDL in brief

- A line is a node: a name, then values, then `key=value` properties,
  then an optional `{ }` block of child nodes.
- Booleans are `#true` and `#false`. A bare `true` is a syntax error.
- Quote every string. Long text goes in a raw string,
  `#"""` on its own line, the text, then `"""#`; its indentation is
  stripped to that of the closing line.
- Most properties may also be written as a child node of the same name,
  which reads better for long or multi-valued ones:
  `flag "--x" { long_help #"""…"""# }`.
- `//` comments a line; `/-` comments out the next node.

## The vocabulary at a glance

```kdl
min_usage_version "6.7.1" // oldest usage that reads this spec; put it first
name "My CLI"
bin "mycli"
version "1.2.0"
about "Deploy services from your terminal"

flag "-v --verbose" help="More output" global=#true count=#true
flag "--color" help="Colour output" negate="--no-color" default=#true

cmd "deploy" help="Deploy a service" effect="write" {
  alias "d"
  arg "<service>" help="Service to deploy"
  arg "[extra]..." help="Passed through" double_dash="automatic"
  flag "-e --env <env>" help="Target environment" default="staging" env="MYCLI_ENV" {
    choices "staging" "production"
  }
  example "mycli deploy api -e production" header="Deploy to production"
}
cmd "plugins" help="Manage plugins" subcommand_required=#true {
  cmd "install" help="Install a plugin" {
    arg "<plugin>" help="Plugin to install" {
      complete run="mycli plugins available"
    }
  }
}
```

- `<name>` is required, `[name]` optional, a trailing `...` variadic.
- A flag with no `<value>` is a switch. Short and long spellings on one
  line are aliases.
- Only `global=#true` flags reach subcommands. Root flags and arguments
  belong to the root alone, and a required root argument is required
  even when a subcommand is chosen, unless `subcommand_negates_reqs #true`.
- A value comes from the command line, then `env`, then `default`.

Each node's full vocabulary is in a reference, read when the spec needs
it:

- [Arguments and flags](./references/arguments-and-flags.md): arity,
  `--`, choices, validation, relationships, environment, value shapes.
- [Commands and the root](./references/commands.md): help text and
  layout, aliases, default subcommands, mounts, effects, deprecation,
  unknown flags and variables, multicall and views.
- [Completion](./references/completion.md): the `complete` node, its
  built-in types, `run` templates and `delegate`.
- [Shared and structured declarations](./references/structure.md):
  `flagset`, `group`, `clause`, sigils, `output` and `include`.
- [Settings](./references/config.md): the `config` block, where values
  come from, types and its JSON Schema.
- [Generators](./references/generators.md): completions, Markdown, man
  pages, SDKs, `diff`, `mcp`, and their flags.

## What a script receives

Each flag and argument arrives as `usage_<name>`: its long name, or its
argument name, lower-cased with dashes turned to underscores.
`flag "-o --out <path>"` is `$usage_out`; `arg "[My-File]"` is
`$usage_my_file`.

- A switch is `true` when given and **unset** when not, so test it with
  `${usage_force:+...}` or `[ "$usage_force" = true ]`. A switch with
  `default=#true` and `negate` is always set, `true` or `false`.
- `count=#true` holds the count: `-vv` is `2`.
- A variadic holds its values joined by spaces, quoted as a shell would
  where a value has spaces: `eval "set -- $usage_files"` or
  `eval "files=($usage_files)"` recovers the list.
- `usage_cmd` holds the chosen subcommand path, `db migrate`, by its
  canonical name even when an alias was typed; unset at the root.
- `usage` exits `1` when the command line breaks the spec and `181` when
  the spec or a `mount` cannot be read; otherwise it exits with the
  script's own code.

In a mise task the same values reach `run` as `$usage_<name>`, and mise's
templates as `{{ usage.<name> }}`. mise clears every inherited variable
starting `usage_`, case-insensitively, so an override such as
`USAGECLI_SHELL_BASH` must use the `USAGECLI_` spelling.

## Checking a spec

Run all three after every change; each reads a file, a usage-shebang
script, or `-`:

```sh
usage lint mycli.usage.kdl
usage explain -f mycli.usage.kdl -- mycli deploy api -e production
usage complete-word -f mycli.usage.kdl -- mycli deploy api --env ''
```

- `lint` reports what parses but is wrong: a duplicate flag, a required
  argument after an optional one, a variadic that is not last, missing
  help, an example its own spec rejects. Add `-W` to fail on warnings,
  `--sorted` to hold declaration order.
- `explain` prints which token bound to what, every value that came from
  `env`, a `default` or `default_if`, and which declaration lost to it.
  `-e KEY=VALUE` replaces the whole environment, for a reproducible report.
- `complete-word` prints what Tab offers at the last word; `''` asks for
  every candidate.

A KDL error, or a node or property the running usage does not know, fails
the parse with the offending span. A spec newer than the installed usage
says so through `min_usage_version` as a warning; `usage --version` tells
you what you are checking against.

## Writing one well

- Give every command, flag and argument `help`: it is the one-line text
  of `-h`, completion menus and generated docs. Put the rest in
  `long_help`, which `--help` and the generators use.
- Declare what the CLI enforces, so that help, completions, SDK types and
  `usage diff` all know it: `choices` over prose listing values,
  `required=#true`, `conflicts`, a `group` over pairwise conflicts.
- Mark a command that changes things with `effect`, `write` or
  `destructive`. A command without one is unknown, not safe, and
  `effect` is not inherited.
- Prefer a dynamic `complete run=` or `choices run=` over copying values
  another tool owns into the spec.
- Set `min_usage_version` to the oldest release with every node used, once
  the spec is read by tooling you do not control.
- Keep one source of truth. A spec the CLI prints is regenerated from
  code; a hand-written spec is the interface's contract, and a release
  checks it with `usage diff` before shipping.
