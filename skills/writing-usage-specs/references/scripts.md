<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/writing-usage-specs/references/scripts.md
   -
   -->

# Scripts and mise tasks

## Find the spec the entry point reads

- Standalone specs typically use the binary's name, for example
  `mycli.usage.kdl`.
- Usage shebangs read declarations from `#USAGE` or `//USAGE` comments,
  depending on the language. The `# [USAGE]` spelling also works.
  Run the executable with its actual shebang, or use the same runner
  explicitly.
- With Usage 7.4.0, `usage exec` and spec readers such as `lint`,
  `explain`, and `generate json` prefer `.<script>.usage.kdl` beside the
  script. The dedicated shell runners read the script's inline spec.
  If help or completion disagrees with a `usage bash` script, check for
  a sidecar. Compare `usage generate json -f ./my-script` with
  `./my-script --help` and a real invocation.
- Mise tasks put KDL in the `usage` field of an inline task or in
  `#USAGE` comments in a file task. For an inline task, lint the actual
  KDL field and verify with `mise run <task> --help` and
  `mise run <task> <args>`.
- A framework-owned CLI can export the spec through an option such as
  `mycli --usage-spec` or `mycli __usage_spec__`. Find the export the
  project uses before editing generated artifacts.

Use `#!/usr/bin/env -S usage bash` and make the script executable to run
it by path. Usage also has `zsh`, `fish`, and `powershell` runners.
For another interpreter, use `#!/usr/bin/env -S usage exec node`.
When interpreter flags precede the script, quote the interpreter and its
flags as one word, for example
`#!/usr/bin/env -S usage exec "deno run --allow-env=usage_*"`.

## Read bound arguments in the body

Each value arrives as `usage_<name>`. For a flag, use its long name,
falling back to its short name. Names are lowercased and dashes become
underscores. `flag "-o --out <path>"` yields `usage_out`, and
`arg "[My-File]"` yields `usage_my_file`.

- A switch supplied on the command line becomes `true`. An explicit
  negation can set it to `false`. Use
  `[ "${usage_force:-}" = true ]` in an `if` to handle both and work
  with `set -u`. An omitted switch without a default leaves an
  inherited value in place with a Usage shebang. Set `default=#false`
  when an omitted switch must stay false even with an inherited value.
  Check the clean invocation, an explicit negation, and the invocation
  with the inherited variable set.
- `count=#true` exports a count. Probe short bundles before
  subcommands if they include parent-local flags.
- A variadic is exported as one shell-quoted string. In a POSIX shell,
  `eval "set -- ${usage_files-}"` recovers its elements and preserves
  spaces and empty values. Apply it only to the value supplied by the
  runner. Clear the inherited value at launch, for example with
  `env -u usage_files ./my-script ...`, and test an empty list. When
  forwarding a tail, verify spaces, empty arguments, and a literal
  second `--` by checking what the child receives.
- `usage_cmd` is the canonical subcommand path, such as `db migrate`,
  even when the user typed an alias. It is unset for a root invocation.
  A flag or argument named `cmd` reserves that variable for its own
  value, including when omitted.

Mise passes parsed values to task bodies as `$usage_<name>` and to
templates as `{{ usage.<name> }}`. It clears inherited `usage_*` names
case-insensitively. Overrides such as `USAGECLI_SHELL_BASH` use the
`USAGECLI_` prefix.

## Interpret exit statuses

A Usage runner exits 1 on argument rejection and 181 when it cannot
read the spec or resolve a dependency such as a mount. After the script
runs, it returns the script's exit status. Use stderr and the expected
body output to distinguish a parser failure from a body that exits 1
or 181. In Bash, a final `[ condition ] && action` gives the whole
script status 1 when the condition is false. Use an `if` for a
successful no-op.

See [the upstream script guide](https://usage.jdx.dev/cli/scripts) for
interpreter and Windows shell setup, and [the 7.4.0 runner](https://github.com/jdx/usage/blob/v7.4.0/cli/src/cli/shell.rs#L258)
and [spec loader](https://github.com/jdx/usage/blob/v7.4.0/cli/src/cli/generate/mod.rs#L57)
for sidecar behavior.
