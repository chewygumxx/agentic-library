<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/usage-spec/references/config.md
   -
   -->

# Settings

A `config` block describes a CLI's settings: their keys, types, sources
and documentation. Generated Markdown renders it as a settings reference,
`usage generate json-schema` as a schema for the config file, and the
`usage-config` library resolves values against it.

```kdl
min_usage_version "6.7.1"
flag "-j --jobs <n>" help="Parallel jobs"
config {
  file "/etc/mycli/config.toml" scope="system"
  file "~/.config/mycli/config.toml" scope="global"
  file "mycli.toml" findup=#true
  file "mycli.local.toml" findup=#true
  source "git" name="git config" doc_hint="git config `{key}`" \
      set_hint="git config {key} {value}"
  prop "jobs" type="uint" default=4 help="Number of parallel jobs" {
    cli "--jobs" "-j"
    env "MYCLI_JOBS"
    deprecated_env "MYCLI_THREADS"
  }
  prop "status.missing_tools" type="bool" default=#true help="Warn about missing tools"
  prop "check" type="bool" help="Check only" { source "git" "mycli.check" }
}
```

## Precedence

Command line, environment, config files (nearest first, a `.local` file
over its base), user files, system files, then the `prop`'s `default`.
A property's listed sources are consulted in the order written. `file`
nodes are in ascending precedence, the last winning; `findup` searches
each parent directory; `format` names `toml`, `json` or `yaml` when the
extension does not.

## `prop`

Keys are dotted and never nested: `prop "status.missing_tools"`, not a
`status` block. Properties: `type`, `default` (a typed value, or a child
`default "a" "b"` for a list), `help`, `long_help`, `help_heading`,
`default_note`, `optional`, `merge` (`replace`, `union`, `deep`), `scope`
(`any`, `global` refuses project files, `env` refuses all files),
`deprecated` with `deprecated_warn_at` and `deprecated_remove_at`,
`renamed_to`, `hide`, `since`, `parse` (`list_by_comma`, `list_by_colon`,
`list_by_os_path_separator`, `set_by_comma`) and `writes_to`. Children:
`cli`, `env`, `deprecated_env`, `alias`, `source`, `example`,
`choices { choice "a" help="..." }`, and `x "ns.key" value` for a tool's
own metadata, which usage carries but never reads.

## Types

```text
base := bool | string | int | uint | float | path | url | duration | object
type := base | list<type> | set<type> | map<base, type> | option<type> | type "|" type
```

An unknown type name is kept and read as a string.

## Completing and documenting it

`complete "key" type="config_keys"` and
`complete "value" type="config_values"` complete a `config get` and
`config set` pair from the block, aliases and renames included.
`usage generate json-schema -f mycli.usage.kdl --title mycli --url <url>`
writes the file's schema. A large block goes in its own file, brought in
with `include`.
