<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/usage-spec/references/arguments-and-flags.md
   -
   -->

# Arguments and flags

The `arg` and `flag` vocabulary. A flag's value is itself an `arg`, so
what this says of an argument's value holds for a flag's too. The lines
of a block are alternatives, not one spec.

## Declaring

```kdl
arg "<file>"                  // required; completes files, as any arg does
arg "[dir]"                   // optional; named dir, completes directories
arg "<file>..."               // variadic, one or more; [file]... is zero or more
arg "<file>" var=#true var_min=2 var_max=5
arg "<start> <end>"           // exactly two values, each with its own label

flag "-u --user <user>"       // takes a value
flag "--user" { alias "-u"; arg "<user>" }  // the same, written out
flag "-f --force"             // a switch
flag "-v --verbose" count=#true             // -vvv is 3
flag "--include <glob>" var=#true           // repeated: --include a --include b
flag "--include <glob>..."                  // several per occurrence: --include a b
flag "--color" negate="--no-color" default=#true
```

`alias` takes several names; `alias "x" hide=#true` keeps one out of docs
and completions. Every node takes `help`, `long_help` and `help_md` (for
generated Markdown), `help_heading` to group it, `display_order`, `hide`,
`note` and `warning` callouts for long help, and finer `hide_default_value`,
`hide_env`, `hide_possible_values`, `hide_short_help` and
`hide_long_help`.

## Values and their sources

- `default="x"`, or a list as a child node, `default "a" "b"`.
- `env="MYCLI_X"`, then `env_fallback "A" "B"` in order, then
  `deprecated_env "OLD"`, read last and reported as deprecated. The
  command line beats all of them; any of them beats `default`. An empty
  variable is set. For a switch, only `1` and `true` in any case set it.
- `default_if "--json" "true"` on the flag receiving the value: the default
  when `--json` is present; `default_if "--output" "json" "pretty"` when
  `--output` is `json`. The first match wins.
- `default_missing="always"`: the value of a bare `--color`.
- `value_optional=#true` with `[LEVEL]`: absent, bare and valued differ.
- `require_equals=#true`: only `--inspect=9229` binds; pair it with
  `default_missing` so a bare flag means something and the next word
  stays a positional.
- `bool_value=#true`: a switch also takes `--color=true|false`.

## Choices and validation

```kdl
arg "<shell>" { choices "bash" "zsh" "fish" }
arg "<backend>" { choices strict=#false "core" "git" }  // suggest, accept others
arg "<service>" { choices "all" run="docker compose config --services" }
arg "<env>" { choices env="DEPLOY_ENVS" }  // split on commas or whitespace
arg "<color>" {
  choices ignore_case=#true {
    choice "always" help="Always colour" { alias "yes" }
    choice "never"
  }
}
arg "<port>" validate="int(value) >= 1 && int(value) <= 65535" validate_error="must be a port"
```

Choices are strict and case-sensitive unless they say otherwise, and they
reach help, completion, validation and SDK types. `choices run=` runs its
command with `sh -c` only at runtime, for help, validation and
completion, never in generated output. `validate` is an
[expr](https://expr-lang.org) expression over the string `value`, checked
for each value after defaults and environment apply.

`delimiter=","` splits one word into several values before choices apply;
it needs a variadic.

## Hyphens and `--`

- `allow_negative_numbers=#true`: `-1` is a value; `--force` still a flag.
- `allow_hyphen_values=#true` (flags): the next word is the value whatever
  it looks like, `--` included.
- `value_terminator=";"` (variadics): ends the values without keeping it.
- `double_dash` on an argument:

  | value       | meaning                                                  |
  | ----------- | -------------------------------------------------------- |
  | `optional`  | the default; may come before or after `--`               |
  | `required`  | only after `--`; shorthand `arg "<-- cmd>..."`           |
  | `automatic` | once it binds, everything after is verbatim, flags too   |
  | `preserve`  | further `--` words are kept as values                    |

  `required` takes everything after `--`, past earlier variadics: with
  `arg "[tool]..."` and `arg "[-- command]..."`,
  `mycli node@20 -- node app.js` binds `tool=node@20` and
  `command=node app.js`. It is clap's `last(true)`.

## Relationships

```kdl
flag "--file <f>" conflicts="--stdin"      // both given is an error
flag "--file <f>" overrides="--stdin"      // the last given wins
flag "--out <p>" requires="--format"       // --out needs --format
flag "--file <f>" required_if="--dir"      // --dir needs --file
flag "--file <f>" required_unless="--dir"  // one of them is needed
flag "--dump" exclusive=#true              // alone, no other flag or argument
flag "--sign" { requires "--key" "--identity" }  // several: a child node
flag "--token <t>" { required_if_eq "--mode" "remote" }
flag "--ok <x>" { required_if_eq_all "--mode" "remote" "--scope" "global" }
flag "--sum <s>" { required_unless_all "--stdin" "--file" }
flag "--config <f>" { requires_if "remote.toml" "--token" }
```

A property names one selector: `conflicts="--b --c"` is an error; write a
child node, `conflicts "--b" "--c"`. Dashed selectors name flags, bare
ones positionals; arguments take the same nodes. Conflicts and exclusivity
count only what was supplied; requirements are met by a value from
anywhere, a default included. For three or more mutually exclusive
flags, or "one of these is required", use a `group`.

Specs generated from clap never carry `requires_if`, `default_if` or
`default_missing`, as clap cannot report them: declare them in a spec
merged over the generated one.

## Deprecation and effect

```kdl
flag "--output <p>" deprecated="use --out" deprecated_remove_at="3.0.0"
flag "--legacy" deprecated="use --modern" deprecated_warn_at="2027.1.0"
flag "--clear" effect="destructive"
arg "[value]" effect="write"
```

A deprecated flag warns when given, on the command line or by its
environment variable, not when defaulted. `deprecated_warn_at` withholds
the warning until the CLI's own `version` reaches it. `effect` on a flag
or argument only raises its command's effect when it is supplied.

## Scope

A `global=#true` flag works on its command and every descendant, before or
after the subcommand word. A non-global flag may still precede one of its
command's subcommands, `mycli run --force task`, but is not inherited.
