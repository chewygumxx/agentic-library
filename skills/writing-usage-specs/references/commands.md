<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/writing-usage-specs/references/commands.md
   -
   -->

# Commands and the root

The `cmd` node and the root's own nodes. The root is a command: every
policy below goes at the top level for the whole CLI or on a `cmd` for
one, unless it says otherwise. The lines of a block are alternatives.

## Identity and help

```kdl
min_usage_version "6.7.1"
name "My CLI"
bin "mycli"
version "1.0.0"
long_version "1.0.0\ncommit abc123"
author "Example Team"
license "MIT"
repository "https://github.com/me/mycli"
about "Short description, for -h"
long_about "Longer description, for --help"
about_md "Markdown, for generated docs"
before_help "Above the page"
after_long_help "Below the --help page"
usage "mycli [OPTIONS] <COMMAND>"  // replaces the generated synopsis
example "mycli --version" header="Version" help="Print the version"
source_code_link_template "https://github.com/me/mycli/blob/main/src/cli/{{path}}.rs"
```

A `cmd` takes `help`, `long_help`, `help_md`, `before_help`,
`after_help` and their `long_` and `_md` forms, as properties or child
nodes. `-h` shows the short forms, `--help` the long, and generated
Markdown the `_md` form, then the long, then the short. `example` takes
`lang` for highlighting, and a raw string for multi-line output.

Layout: `help_heading="Configuration"` files a command under a heading in
its parent's list, and `heading "Configuration" help="..."` gives that
section prose. `display_order`, `next_line_help`, `flatten_help` (inline
every child), `subcommand_help_heading`, `subcommand_value_name`,
`term_width` and `max_term_width` (zero disables). The root also takes
`help_template` with placeholders such as `{{about}}`, `{{usage}}`,
`{{flags}}`, `{{args}}`, `{{commands}}` and `{{after_help}}`, and `logo`
art with a `style`.

## Subcommands

```kdl
cmd "config" help="Manage settings" subcommand_required=#true {
  alias "cfg" "cf"
  alias "conf" hide=#true                  // kept out of docs and completion
  cmd "set" help="Set a value" { arg "<key>"; arg "<value>" }
}
cmd "old" hide=#true
```

- `default_subcommand "run"` (root only) routes an unmatched first word
  to `run`; a known command still wins. Add
  `default_subcommand_flags #true` to let `run`'s flags come first,
  `default_subcommand_on_empty #true` to select it on a bare invocation,
  and `default_subcommand_help #true` to append its help to the root's.
- `arg_required_else_help #true`: a bare invocation shows help.
- `subcommand_negates_reqs #true`: choosing a child waives the parent's
  required arguments and flags.
- `args_conflicts_with_subcommands #true`: a parent argument and a child
  cannot both be given.
- `subcommand_precedence_over_arg #true`: a child's name ends a parent
  variadic that would otherwise take it.
- `allow_missing_positional #true`: `[a] <b>` binds one word to `b`.
- `args_override_self #false`: a repeated single-value flag is an error
  rather than the last one winning.
- `restart_token=":::"` (a named `cmd` only): `run lint ::: test` parses
  twice, keeping the last; a `clause` keeps every one.
- `disable_help`, `disable_help_flag`, `disable_help_subcommand`,
  `disable_version_flag`; a declared flag takes the role over with
  `action="help"`, `"help_short"`, `"help_long"`, `"help_all"` or
  `"version"`. Generated specs write the parser's own `-h` and `-V` out
  so, with `builtin=#true`, which keeps them out of the synopsis.

## Unknown words

```kdl
unknown_flags "error"              // refuse them; the default, value, passes them on
cmd "exec" unknown_flags="value"   // the nearest command's setting wins
external_subcommand #true          // an unknown word and the rest go to it
unknown_env prefix="MYCLI_" { allow "MYCLI_PLUGIN_DIR" }
```

`unknown_flags` is inherited. With `external_subcommand`, a known command
and `default_subcommand` still win, and nothing after the external word
is parsed. `unknown_env` refuses every variable under the prefix that no
`env`, `env_fallback`, `deprecated_env` or config `prop` in the tree
declares; `allow` lists the ones read outside the spec.

## Effects and deprecation

```kdl
cmd "ls" effect="read"
cmd "use" effect="write"
cmd "uninstall" effect="destructive"
cmd "compile" deprecated="use build" deprecated_remove_at="3.0.0"
cmd "doctor" surface="internal" { available_if "debug-build" }
```

`read` changes nothing; `write` changes only what can be recreated;
`destructive` may delete or overwrite. An invocation's effect is the
maximum of its command's and those of the flags and arguments it
supplies. A command without one is unknown, and a child never inherits
its parent's; `usage mcp` and generated docs report it. `surface` and
`available_if` are labels for tooling and change no parsing.

## Mounts

A `mount` runs a command, with `sh -c`, that prints KDL to merge beneath
it, for commands found at runtime such as a task runner's tasks:

```kdl
cmd "mount-usage-tasks" hide=#true
cmd "run" {
  mount run="mycli mount-usage-tasks" synopsis="[TASK] [ARGS]..."
}
mount run="mycli plugin-commands"  // at the root: commands from plugins
```

Completion and help run it up front; a parse runs a root mount only when
a word matches nothing declared, and not under a `default_subcommand`
unless the mount sets `overrides_default=#true`. Inside a mounted
command, root `complete` nodes and parent globals no longer apply: the
printed spec declares its own. A failing mount exits `181`. `synopsis`
only shows in the generated usage line.

## Multicall and views

`multicall #true`: `argv[0]`'s basename selects a command, busybox-style.
`view "aubr" root="run" globals=#true` presents the `run` command as an
executable of its own, for its docs and completions:
`usage g markdown --view aubr`.
