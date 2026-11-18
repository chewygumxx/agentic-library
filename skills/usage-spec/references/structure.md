<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/usage-spec/references/structure.md
   -
   -->

# Shared and structured declarations

Nodes that say something about several declarations at once, or about
what a command prints.

## `include`

```kdl
include file="./settings.usage.kdl"
```

Merges another file, resolved from the including file, where the
`include` stands: of two declarations of one value, the later wins. An
included file that declares a command's flags replaces that command's
`use` and `group` nodes with them. It does not survive a
round trip: re-emitted specs hold the merged result.

## `flagset` and `use`

```kdl
flagset "output" {
  flag "-v --verbose" help="Print more"
  flag "--json" help="Machine-readable output"
}
cmd "build" { use "output"; flag "--release" }
cmd "test" { flag "--filter <pattern>"; use "output" }
```

Flags declared once, for the commands that `use` them, where a `global`
would give them to every descendant. `flagset` is top-level only; `use`
goes wherever flags go, takes several names, expands in place, and may
appear inside another `flagset`. A command's own flag beats the set's for
any spelling they share. Sets hold flags alone, never `arg`. Each name is
declared once, across includes too.

## `group`

```kdl
group "input" "--file" "--url" "--stdin"                              // at most one
group "input" "--file" "--url" "--stdin" required=#true               // exactly one
group "input" "--file" "--url" "--stdin" required=#true multiple=#true // at least one
```

At least two members; dashed for flags, bare for positionals. It lives on
the command that declares its members. Exclusivity counts only what was
supplied; the requirement is met by a default, so a required group whose
member has a default enforces nothing.

## Sigil arguments

```kdl
min_usage_version "6.5"
arg "[tool]..." sigil="+" { choices "node@22" "node@24" }
arg "<command>"
arg "[args]..."
```

A positional matched by its prefix, not its place: `ex +node@24 node -v`
binds `tool=node@24`, `command=node`, `args=-v`. The prefix is stripped
before validation and restored on completion candidates. Sigils must not
start with `-`, nor be prefixes of one another; `--` makes later ones
plain data. `usage lint` 7.4 still warns that such a declaration puts a
variadic or an optional argument first; check it with `usage explain`.

## `clause`

```kdl
min_usage_version "6.6"
clause "tasks" separator=":::" {
  arg "<task>"
  arg "[args]..." double_dash="automatic"
}
```

A repeatable group of arguments and scoped flags: `run lint --fix ::: test`
gives two instances. Without `separator`, it holds exactly one required,
non-variadic `arg`, which ends each instance:
`use --postinstall A a --postinstall B b`. One clause per command, and
not beside top-level arguments, sigils or `restart_token`; defaults and
`env` do not fill it.

## `output`, `select` and `exit_code`

```kdl
cmd "check" {
  flag "--format <FORMAT>" help="Output format"
  output "human" default=#true help="Human-readable report"
  output "json" media_type="application/json" framing="json" {
    schema file="report.schema.json"
  }
  output "jsonl" framing="jsonl" help="One event per line"
  select "--format"
  exit_code 0 "all checks passed"
  exit_code 1 "a check failed"
}
```

`framing` is `text`, the default, `json` or `jsonl`. `select` fills the
flag's choices from the output names; a switch selects one output with
`output "json" select="--json"`. Top-level declarations apply CLI-wide; a
command redeclares an output to refine it, or hides it. Exit codes fold
by number. Generated docs list them, and generated SDKs add `execJson`,
`exec_json` and streaming JSONL methods.
