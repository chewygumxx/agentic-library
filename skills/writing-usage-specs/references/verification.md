<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/writing-usage-specs/references/verification.md
   -
   -->

# Verification

Use the project's pinned Usage version and real entry point. After
each edit, rerun the smallest check that reproduces the failure, then
check a valid invocation to catch regressions.

## Lint the source

```sh
usage lint -W mycli.usage.kdl
```

Findings have codes, for example `duplicate-flag` or
`required-after-optional`. Lint reports a KDL or spec loading error
before it can check declarations. Otherwise it fails on errors, and
`-W` includes warnings. Missing help is informational. Use
`--format json` to collect findings, or `-q` for findings alone in
text. `--sorted` also checks alphabetical subcommand and flag
declaration order. Enable it when the project follows that convention.

A higher `min_usage_version` can produce a warning with a successful
exit. Run the spec on the oldest version you intend to support.

## Assert binding and rejection

From the skill directory, this Bash example checks the report for
one valid invocation. It requires `jq`.

```bash
report=$(usage explain -f scripts/greet.sh --format json -- greet --greeting welcome Ada) &&
  jq -e '
    .refused == null and (.errors == []) and
    any(.values[]; .name == "greeting" and .value == "welcome")
  ' <<<"$report"
```

In CI, preserve the command's own nonzero exit status if it fails to
produce a report, for example when the spec is missing. If the log
needs the report, capture it, print it, then apply the JSON predicate.

For a rejection assert the relevant reason. Missing required arguments
can appear in `errors`, and an invalid strict choice can appear in
`refused` with an empty `errors` array. The report itself can succeed
in either case. Inspect `tokens`, `values`, origins, and `shadowed`
when a successful invocation binds something unexpected. An explicit
`-e KEY=VALUE` list replaces the whole environment used by `explain`.
Test unset and empty environment variables separately when changing
fallbacks.

## Run the actual entry point

Run the script, CLI, or mise task with representative valid and
invalid arguments. Check its output and status. Use a temporary
fixture or a supported non-mutating path for commands that change
state. For forwarded arguments, assert what the child receives.

`explain` skips `mount run=` and `choices run=` providers. With mounts,
lint can also leave examples unchecked. Use a controlled provider and
run the actual command for acceptance, rejection, and provider
failure. For a CLI that exports a spec, verify the executable still
implements the reported interface.

For completion changes, run `usage complete-word -f FILE -- PROGRAM
ARGS ''` and check the candidates. Use the target `--shell` to inspect
its quoting, and try Tab in that shell when testing installation or
insertion. Running this diagnostic can invoke completion providers.

## Diagnose common symptoms

| Symptom | What to check |
| --- | --- |
| Missing positional after a multi-value flag | Trace it with `explain`. `--include <glob>...` greedily consumes the following words. Use `var=#true` with one value per occurrence when that matches the contract, or test a bound or separator. |
| Wrapper drops flags or a separator | Put Usage's own `--` before the program name in probes. Keep the wrapper's literal `--` in the remaining argv, and assert the child sees the expected words, including any second separator meant for it. |
| Help or completion shows a different spec | Compare the generated spec and the actual entry point's help. Check the script's sidecar, the export command, and the installed CLI version. |
| `relative includes require a source file` | Pass the original path to Usage so it can resolve the relative include. Piped text has no source path. |

See the upstream [lint](https://usage.jdx.dev/cli/reference/lint),
[explain](https://usage.jdx.dev/cli/reference/explain), and
[complete-word](https://usage.jdx.dev/cli/reference/complete-word)
references for options supported by the CLI.
