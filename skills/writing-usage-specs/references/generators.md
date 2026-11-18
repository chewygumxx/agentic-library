<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/writing-usage-specs/references/generators.md
   -
   -->

# Generators

What the `usage` CLI makes from a spec. Each generator reads `-f FILE`,
a spec or a usage-shebang script, or `-f -` for stdin; `json`,
`json-schema`, `sdk` and `go` also take `--spec` for the spec as a
string, but `markdown`, `manpage` and `completion` do not. `diff` takes
its two specs as arguments, and there `-f` is `--format`. `generate` is
also `g`. Regenerate the outputs whenever the spec changes, and keep
hand-written additions out of generated files.

## Reference pages

```sh
usage g markdown -f mycli.usage.kdl --out-file docs/cli.md
usage g markdown -f mycli.usage.kdl --multi --out-dir docs/commands \
  --url-prefix /commands --link-extension ''
usage g markdown -f mycli.usage.kdl --template spec=./spec.md.tera --out-file docs/cli.md
usage g manpage -f mycli.usage.kdl -o mycli.1
usage g manpage -f mycli.usage.kdl --section 5 -o mycli.5
```

`--multi` writes a page per command, nested as the commands are.
`--template NAME=PATH` replaces one Tera template, `spec`, `index`,
`command`, `argument`, `flag` or `config`; the rest stay available to
`include`. Markdown takes each node's `help_md`, then `long_help`, then
`help`; `source_code_link_template` links each command to its source.
`usage g man -f mycli.usage.kdl | man -l -` previews a page on Linux.

## Typed clients and data

```sh
usage g sdk -l typescript -o ./sdk -f mycli.usage.kdl
usage g sdk -l python -o ./sdk -f mycli.usage.kdl -p mycli_sdk
usage g json -f mycli.usage.kdl
usage g json-schema -f mycli.usage.kdl --title mycli --url https://example.com/mycli.json
usage g go -f mycli.usage.kdl -p cli -o cli/spec_gen.go
```

The SDKs build an argument list and run the CLI as a subprocess, so the
CLI must be installed where they run, though `usage` need not be. Choices
become literal types; declared `output` formats add parsed JSON and
streaming JSONL methods. `json` prints the parsed spec, with `include`
and `flagset` resolved, for any tool that would rather not read KDL.
`json-schema` needs a `config` block.

## Breaking changes

```sh
usage diff released.usage.kdl current.usage.kdl
```

Findings are `breaking`, `compatible` or `metadata`, each with a code
such as `choice-removed`; it exits `1` on a breaking one, unless
`--exit-zero`. `--format json` gives them as data. Breaking is anything
that makes a command line that worked fail, bind differently or resolve
to another value: a removed flag or spelling, a narrowed strict
`choices`, a new required positional or `conflicts`, a changed default.
Help text, hiding, `effect` and deprecation are metadata. `version` and
mounts' discovered commands are never compared. Compare specs emitted by
the same generator version, or what a newer generator learnt to express
reads as new constraints. As a release gate:

```sh
git show "$(git describe --tags --abbrev=0)":mycli.usage.kdl > released.usage.kdl
mycli --usage-spec | usage diff released.usage.kdl - --breaking
```

## For agents

`usage mcp -f mycli.usage.kdl` serves the spec over MCP on stdio, with a
`list_commands` tool that gives each command's `effect` and a
`describe_command` tool for its help, flags and arguments, so an agent
learns what a CLI does and touches without running it.

## Specs from frameworks

A CLI built on another framework exports its spec through an integration
rather than a hand-written file: `clap_usage` for clap, `cobra_usage` for
Cobra, `usage-spec-effect` for Effect, and community packages for
argparse, Click, Typer, Commander.js, oclif, yargs, Kong, urfave/cli,
OptionParser, picocli, JCommander and Clikt. Such a spec carries only
what the framework can report. For the rest, such as `repository`, save
it to a file and write a spec that includes it, then declares what it
lacks: a node after the `include` wins over the included one.
