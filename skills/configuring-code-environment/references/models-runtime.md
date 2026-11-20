<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/configuring-code-environment/references/models-runtime.md
   -
   -->

# Models and runtime

<!-- cspell:words AUTOCOMPACT -->

## Contents

- [Model selection and reasoning](#model-selection-and-reasoning)
- [Context and compaction](#context-and-compaction)
- [Match the timeout to the failing operation](#match-the-timeout-to-the-failing-operation)

Use the current [model guide](https://code.claude.com/docs/en/model-config)
and [variable reference](https://code.claude.com/docs/en/env-vars) to
check model support, defaults, caps, and installed-version behavior.

## Model selection and reasoning

| Variable | Effect and synergy |
| --- | --- |
| `ANTHROPIC_MODEL` | Selects an alias or model ID. Beats `model` in settings; `--model` and `/model` override it |
| `ANTHROPIC_DEFAULT_MODEL` | Starting fallback for new sessions. An explicit selection through `--model`, `ANTHROPIC_MODEL`, the `model` setting, or an organization default takes precedence. Requires v2.1.236 or later |
| `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Map aliases to deployment-specific IDs; selecting an alias and redefining it are different operations. Haiku mapping also affects background functionality |
| `CLAUDE_CODE_SUBAGENT_MODEL` | Default for agents without a model assigned another way. Since v2.1.251, per-invocation and definition models, including `inherit`, take precedence; check the installed version before diagnosing an override |
| `CLAUDE_CODE_EFFORT_LEVEL` | Reasoning effort for supported models. Beats `--effort`, `/effort`, `modelSettings`, and `effortLevel`; a managed `maxEffortLevel` cap still applies. Supported levels depend on the model |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | Output ceiling for most requests, clamped to the model's cap. Does not enlarge the context window |
| `MAX_THINKING_TOKENS` | Fixed thinking budget where supported, capped below the output ceiling. Positive numbers do not constrain adaptive reasoning unless that model supports disabling adaptation |

For a model that supports high effort:

```sh
ANTHROPIC_MODEL=sonnet CLAUDE_CODE_EFFORT_LEVEL=high claude
```

If `/effort` or `--effort` appears ineffective, remove the environment
override to restore those controls. The literal value `unset` tells
Claude Code to omit effort from the request. To verify a starting
model, use a new session because a resumed session can keep its saved
model.

For a gateway that requires a deployment ID, merge this template into
the intended settings file and replace the placeholder first:

```json
{
  "env": {
    "ANTHROPIC_MODEL": "sonnet",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "<gateway-sonnet-deployment-id>"
  }
}
```

This selects `sonnet` and changes what that alias resolves to. Other
aliases and background requests can still need their own mappings.
Do not copy a direct API model ID into a provider that expects an
inference profile, version name, or deployment name.

Prefer effort for adaptive models. `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING`
only enables fixed-budget behavior on models that support it; it is
ineffective on models that always use adaptive reasoning.
`MAX_THINKING_TOKENS=0` also cannot turn off thinking on every model.
Check the model guide before promising either behavior.

## Context and compaction

`CLAUDE_CODE_MAX_CONTEXT_TOKENS` corrects Claude Code's assumed context
size for supported custom/gateway IDs; it cannot increase the server's
actual capacity. Whether it applies depends on how the ID resolves.
`CLAUDE_CODE_AUTO_COMPACT_WINDOW` sets the compaction window in tokens.
A usable value overrides `--autocompact`, `/autocompact`, and
`autoCompactWindow`. Use a full count such as `200000`. The bare value
`200` means 200 tokens in this variable and 200,000 in `/autocompact`.
`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` lowers the trigger percentage in
sessions that compact before the model's context limit.

```sh
CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000 claude
```

This sets the compaction boundary for a deployment with a 200,000 token
limit. Claude Code caps the window at the model's context size. If
automatic compaction was disabled elsewhere, remove that disable first.
`DISABLE_AUTO_COMPACT=1` overrides `autoCompactEnabled` and leaves manual
`/compact` available. `DISABLE_COMPACT=1` disables both forms.

## Match the timeout to the failing operation

| Variable | Unit and operation | Configuration interaction |
| --- | --- | --- |
| `API_TIMEOUT_MS` | Milliseconds per attempt: response headers for streaming; full completion for non-streaming when positive | Not a total streaming-response deadline; increasing it cannot fix a Bash or MCP timeout |
| `BASH_DEFAULT_TIMEOUT_MS` | Milliseconds for a foreground shell tool command | Pairs with `BASH_MAX_TIMEOUT_MS`, the maximum timeout the model can request; effective ceiling is the larger of the two |
| `BASH_MAX_OUTPUT_LENGTH` | Characters of shell output returned to Claude | Ignored when the dedicated `bashOutputMaxChars` setting is set; unrelated to output tokens |
| `MCP_TIMEOUT` | Milliseconds for an MCP server to start | Distinct from tool execution and the blocking-startup batch wait |
| `MCP_TOOL_TIMEOUT` | Milliseconds for MCP tool execution | A per-server `timeout` in `.mcp.json` overrides it; HTTP/SSE request limits and idle limits can also matter |

For a slow foreground build:

```sh
BASH_DEFAULT_TIMEOUT_MS=300000 BASH_MAX_TIMEOUT_MS=600000 claude
```

This gives shell commands a five-minute default and allows a requested
timeout up to ten minutes. For an MCP server that starts slowly instead:

```sh
MCP_TIMEOUT=60000 claude
```

Use plain integer values for compatibility and state the units. Verify
with the same command or server that timed out. Increasing a startup
limit will not repair credentials, a missing executable, or a failed
server handshake; inspect `/mcp` before increasing it again.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
