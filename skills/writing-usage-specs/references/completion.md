<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/writing-usage-specs/references/completion.md
   -
   -->

# Completion

What Tab offers for a value, and how the shells get it. The lines of a
block are alternatives.

## Contents

- [Where candidates come from](#where-candidates-come-from)
- [Type](#type)
- [Run](#run)
- [Delegate](#delegate)
- [Installing completions](#installing-completions)
- [Checking](#checking)

## Where candidates come from

The argument's `choices`, when it declares them, win over every
`complete`. Otherwise a `complete` inside the argument, then a named one
at the top level, then one in the command being completed, and failing
all of them, files. A fixed list belongs in `choices`, which also
validates; `complete` only suggests.

```kdl
complete "plugin" run="mycli plugins list"  // every argument named plugin
arg "<plugin>" { complete run="mycli plugins list" }  // this one alone
flag "--out <path>" { complete type="dir" }  // shorthand for the flag's arg
cmd "deploy" {
  arg "<environment>"
  complete "environment" run="mycli environments"  // this command only
}
```

`run`, `type` and `delegate` are alternatives; give one.

## `type`

| type                       | offers                                            |
| -------------------------- | ------------------------------------------------- |
| `file`, `path`             | files and directories                             |
| `path:toml,yaml`, `file:…` | directories, and files with those extensions      |
| `dir`                      | directories                                       |
| `executable`               | executable paths                                  |
| `command`                  | commands the shell knows, `PATH` included         |
| `command_args`             | a command, then paths                             |
| `config_keys`              | the keys of the spec's `config` block             |
| `config_values`            | the values of the key named earlier on the line   |
| `username`, `hostname`     | users and hosts                                   |
| `none`, `url`, `email`     | nothing, and no file fallback                     |
| `unknown`                  | nothing, but the shell's fallback stays           |

## `run`

`run` is a POSIX command line run by `sh -c`, falling back to `cmd /c` on
Windows without `sh`, with stdin closed and `__USAGE` set. It prints one
candidate per line; with `descriptions=#true`, `value:description`, where
`\:` escapes a colon.

It is a [Tera](https://keats.github.io/tera/) template over `words`, the
words typed so far, `CURRENT`, the index of the one being completed, and
`PREV`. Interpolated words are not escaped: pass each through
`shell_quote`, and a whole line through `shell_join | shell_quote`.

```kdl
arg "<module>"
arg "<controller>"
complete "module" run="ls modules"
complete "controller" run="ls modules/{{ words[PREV] | shell_quote }}/controllers"
complete "pkg" run="mycli search {{ words[CURRENT] | shell_quote }}" descriptions=#true
```

## `delegate`

A wrapper hands its trailing words to the wrapped program's own
completion:

```kdl
arg "<layer>"
arg "<command>" var=#true double_dash="automatic"
complete "command" delegate="terraform"
```

`wrapper layer1 plan -o<Tab>` offers what `terraform plan -o<Tab>` would.
It asks bash (with bash-completion), zsh or fish, without loading the
user's rc files, so the wrapped completion must be installed where those
shells find it unaided: bash-completion's completions directory, zsh's
default `fpath`. PowerShell and Nushell get nothing. `double_dash` lets
every later word, flags too, reach the wrapped command.

## Installing completions

```sh
usage generate completion zsh mycli -f mycli.usage.kdl --install
usage generate completion bash mycli --usage-cmd "mycli --usage-spec" --cache-key 1.2.0
usage generate completion fish mycli -f mycli.usage.kdl > mycli.fish
```

Shells are `bash`, `zsh`, `fish`, `powershell` and `nu`. `--install`
writes only the completion file and prints any rc line still needed; it
replaces a file it did not write only with `--force`. `--usage-cmd` reads
the spec from the installed binary on each Tab, so completion follows
upgrades; `--cache-key` runs it once per key. Bash needs bash-completion
2.11 or later, sourced first.

Every script calls `usage complete-word` at runtime, so `usage` must be on
`PATH` wherever it is used; `--usage-bin` names another. A Rust-framework
CLI ships native completions instead.

For usage-shebang scripts, one line enables every such script on `PATH`:
`source <(usage g completion-init bash)` in `~/.bashrc`, after
bash-completion; `source <(usage g completion-init zsh)` in `~/.zshrc`;
`usage g completion-init fish | source` in
`~/.config/fish/conf.d/usage.fish`.

## Checking

```sh
usage complete-word -f scripts/greet.sh -- greet --greeting ''
```

Run from the skill directory to see `hello` and `welcome` as candidates.
The final `''` asks for all matches for the current word. Use the target
`--shell` for quoting and try Tab in the actual shell for insertion
behavior.
