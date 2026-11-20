---
name: configuring-code-environment
description: >-
  Configures environment variables for the Claude Code CLI (`claude`).
  Use when setting variables or debugging overrides for authentication,
  providers, models, limits, proxies, or telemetry.
license: GPL-3.0-only
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/configuring-code-environment/SKILL.md
   -
   -->

# Configuring the Claude Code environment

Explain settings, flags, hooks, and provider credentials where they
affect the variables consumed by the `claude` process or its children.

## Establish the effective environment

1. For a specific installation, start with `claude --version` and the
   actual launch command, working directory, and shell or runner.
   Check which settings sources it loads, including any
   `--settings` or `--setting-sources` flags and `CLAUDE_CONFIG_DIR`.
2. Look up the variable in the official
   [environment reference](https://code.claude.com/docs/en/env-vars).
   Verify supported values, units, defaults, version requirements, and
   any dedicated setting or flag. Describe names absent from the docs
   as undocumented and verify them for the installed version before
   recommending them.
3. Choose the narrowest persistent scope the request needs. Keep
   credentials in the launch environment or a credential helper, rather
   than a tracked settings file. Merge into an existing `env` object.
4. Explain each proposed variable through its effect, a runnable example
   with placeholders for private values, and its interactions with other
   configuration. Say how to remove the override and verify the result.
5. Relaunch through the same launcher and check the affected behavior.
   When changing a startup model default, test in a fresh session.

Read only the reference needed:

- [Authentication and routing](references/authentication-routing.md)
  for keys, tokens, provider selectors, gateways, and separate accounts.
- [Models and runtime](references/models-runtime.md) for model aliases,
  effort, token budgets, compaction, Bash, and MCP timeouts.
- [Networking and telemetry](references/networking-telemetry.md) for
  proxy/TLS variables, optional traffic, updates, and OpenTelemetry.

## Place the variables

| Location | Scope and example |
| --- | --- |
| Launch environment | One invocation, CI job, service, or wrapper: `API_TIMEOUT_MS=1200000 claude` in Bash/Zsh |
| Shell profile | Future launches from shells that read that file: `export API_TIMEOUT_MS=1200000`; use the actual shell's startup file |
| User settings | Every local project: `~/.claude/settings.json`, under `env` |
| Shared project settings | Team defaults: `.claude/settings.json`, under `env`; commit only non-secret values |
| Local project settings | Personal project override: `.claude/settings.local.json`, under `env`; ensure it is ignored if creating it by hand |
| CLI settings | A session-specific `env` entry passed as JSON or a file via `--settings` |
| Managed settings | Administrator-deployed environment values; inspect their effects rather than assuming a user override works |

An ordinary persistent value, merged into the chosen settings file:

```json
{
  "env": {
    "API_TIMEOUT_MS": "1200000"
  }
}
```

`env` values are strings, not JSON numbers or booleans. Settings do not
perform shell expansion: `"$HOME/certs/root.pem"` and `"~/certs/root.pem"`
stay literal. Use an absolute path in JSON; expansion works in a shell:

```sh
NODE_EXTRA_CA_CERTS="$HOME/certs/root.pem" claude
```

PowerShell uses process-environment assignment instead of the POSIX
prefix form:

```powershell
$env:API_TIMEOUT_MS = "1200000"
claude
Remove-Item Env:API_TIMEOUT_MS
```

An exported value lasts for that shell and its children. A profile,
service, CI runner, and IDE can launch with different environments;
changing one does not update an already running parent process.
A project `.env` file supplies launch values only if the launcher
loads and exports them.

## Resolve conflicts per variable

There are two separate questions: which `env` entry wins, and how the
resulting variable interacts with a dedicated setting or flag.

- Across settings, precedence for a given `env` entry is managed,
  `--settings`, project local, shared project, then user. In ordinary
  terminal sessions, the resulting entry replaces the inherited shell
  value; a one-command assignment does not automatically beat it.
- Dedicated settings and flags have their own rules.
  `--model` and `/model` beat `ANTHROPIC_MODEL`, which beats the `model`
  setting. Conversely, `CLAUDE_CODE_EFFORT_LEVEL` beats `--effort`,
  `/effort`, and effort settings, subject to a managed effort cap.
- A Desktop or self-hosted runner can preserve its launch environment
  over settings `env`. Check the actual launch path when reproducing.
- Some variables are ignored in project/local settings, including
  `CLAUDE_CONFIG_DIR`, claude.ai OAuth credentials, and telemetry
  activation, destination, and content controls. Some are launch-only
  or host-owned and ignored in every settings file. Check the
  [exceptions](https://code.claude.com/docs/en/settings-reference#variables-claude-code-ignores-in-env)
  before proposing placement.

For example, if a project settings file sets `API_TIMEOUT_MS`, a shell
prefix assignment usually loses. Set the same entry through
`--settings` to try a 20-minute timeout for one launch, subject to
managed settings:

```sh
claude --settings '{"env":{"API_TIMEOUT_MS":"1200000"}}'
```

Safe variables can apply before workspace trust. Other project and
local entries apply after trust in interactive sessions, or at
startup in `-p` mode. See the [`env` reference](https://code.claude.com/docs/en/settings-reference#env).

## Verify and remove overrides

Inspect only the relevant names and non-secret values. To check if a
non-empty key is exported to a child of the current POSIX shell,
run this without printing the value:

```sh
sh -c 'if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  printf "%s\n" "ANTHROPIC_API_KEY is exported and non-empty"
fi'
```

Use `/status` to check active settings sources and authentication,
`/model` to check the selected model, and `/mcp` for MCP connections.
Use `claude --debug` when placement or ignored variables remain unclear.
Inspect logs locally and redact credentials before sharing excerpts.
Make an API request only when verifying inference is part of the task.

To remove a persistent override, delete its exact `env` entry or profile
assignment and unset the shell variable, then start a fresh process.
Settings can assign `""` but cannot unset an inherited variable; an
empty provider selector is treated as unset. Do not generalize that
behavior to numeric limits or credentials.

## Gotchas

- A saved settings edit can update the running process environment,
  but startup-only consumers such as OpenTelemetry need a relaunch.
  Removing an `env` entry does not unset it in the running process.
- Boolean parsing is variable-specific. In particular,
  `DISABLE_TELEMETRY`, `DISABLE_ERROR_REPORTING`, and
  `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` activate for any non-empty
  value, including `"0"` and `"false"`. Remove them to reverse the effect.
- `CLAUDE_ENV_FILE` is sourced for tool shell commands. A hook writing
  exports there, or `export` inside one Bash tool call, does not
  reconfigure the parent Claude process's model or authentication.
- When Claude itself works but a Bash command, hook, or stdio MCP
  server lacks a credential, check `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`.
  At `1` it removes matching credentials from child environments while
  preserving Claude's own credentials. GitHub tokens and proxy variables
  are among the exceptions. See the
  [scrub rules](https://code.claude.com/docs/en/env-vars#what-the-subprocess-environment-scrub-removes).

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
