---
name: configuring-code-environment
description: >-
  Configures environment variables for Claude Code's `claude` CLI,
  explaining their effects, examples, and interactions with settings,
  flags, and credentials. Use when setting, persisting, or diagnosing
  Claude Code environment variables for authentication, providers,
  models, runtime limits, proxies, or telemetry. Excludes general
  Claude Code configuration and application SDK environment setup.
license: GPL-3.0-only
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/configuring-code-environment/SKILL.md
   -
   -->

# Configuring the Claude Code environment

Configure the environment consumed by the `claude` process. Explain
settings, flags, hooks, or provider credentials only where they change
what an environment variable does. This is not a general setup guide.

## Establish the effective environment

1. Establish the desired behavior, installed version (`claude --version`),
   launch shell, and scope: one invocation, one project, or every launch.
   Inspect the existing launcher and relevant settings before editing.
2. Look up the variable in the official
   [environment reference](https://code.claude.com/docs/en/env-vars).
   Verify supported values, units, defaults, version requirements, and
   any dedicated setting or flag. Treat undocumented names as unsupported;
   do not infer a variable from a similarly named settings key.
3. Choose the narrowest persistent scope the request needs. Keep
   credentials in the launch environment or a credential helper, rather
   than a tracked settings file. Merge into an existing `env` object.
4. Explain each proposed variable through its effect, a runnable example
   with placeholders for private values, and its interactions with other
   configuration. Say how to remove the override and verify the result.
5. Relaunch through the actual launcher and check the affected behavior.
   Reporting a shell value alone does not prove Claude Code used it.

Read only the reference needed:

- [Authentication and routing](references/authentication-routing.md)
  for keys, tokens, provider selectors, gateways, and separate accounts.
- [Models and runtime](references/models-runtime.md) for model aliases,
  effort, token budgets, compaction, Bash, and MCP timeouts.
- [Networking and telemetry](references/networking-telemetry.md) for
  proxy/TLS variables, optional traffic, updates, and OpenTelemetry.

For variables outside those examples, use the same procedure against
the upstream reference. Keep the delivered change limited to the
requested environment behavior.

## Place the variables

| Location | Scope and example |
| --- | --- |
| Launch environment | One invocation, CI job, service, or wrapper: `API_TIMEOUT_MS=1200000 claude` in Bash/Zsh |
| Shell profile | Future launches from shells that read that file: `export API_TIMEOUT_MS=1200000`; use the actual shell's startup file |
| User settings | Every local project: `~/.claude/settings.json`, under `env` |
| Shared project settings | Team defaults: `.claude/settings.json`, under `env`; commit only non-secret values |
| Local project settings | Personal project override: `.claude/settings.local.json`, under `env`; ensure it is ignored if creating it by hand |
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

The [`env` reference](https://code.claude.com/docs/en/settings-reference#env)
also explains workspace trust and when settings are applied. Safe
variables can apply before trust; other project/local values apply
after trust in interactive sessions, or at startup in `-p` mode.

## Verify and remove overrides

Inspect only the relevant variable names and non-secret values. Never
dump the whole environment, settings, or credential files. For a key,
check presence without printing it:

```sh
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  printf '%s\n' 'ANTHROPIC_API_KEY is non-empty'
fi
```

Use `/status` for authentication and settings status, `/model` for the
selected model, and `/mcp` for MCP connections. Use `claude doctor` or
`claude --debug` when placement or ignored variables remain unclear;
inspect logs locally and redact credentials before sharing excerpts.
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
- Environment values can reach child processes. Do not promise secret
  isolation merely because a value lives outside a tracked file.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
