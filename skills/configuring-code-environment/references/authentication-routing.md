<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/configuring-code-environment/references/authentication-routing.md
   -
   -->

# Authentication and routing

## Contents

- [Direct API, subscription, or gateway](#direct-api-subscription-or-gateway)
- [Credentials for scripts](#credentials-for-scripts)
- [Select one provider deliberately](#select-one-provider-deliberately)
- [Separate configuration directories](#separate-configuration-directories)

Endpoint, credential, and provider selection are separate choices.
Inspect all three before changing one. Confirm variable behavior in the
[environment reference](https://code.claude.com/docs/en/env-vars) and
[authentication guide](https://code.claude.com/docs/en/authentication).

## Direct API, subscription, or gateway

| Variable | Effect and interaction |
| --- | --- |
| `ANTHROPIC_API_KEY` | Sends an `X-Api-Key` credential. It takes precedence over the saved subscription login in print mode (`-p`). In an interactive session Claude Code remembers your approval choice. Change it through **Use custom API key** in `/config` while the variable is set |
| `ANTHROPIC_AUTH_TOKEN` | Supplies a bearer credential; Claude Code adds the `Bearer` prefix and a space, so provide only the token. Use when the chosen gateway requires bearer authentication; it is not interchangeable with an API key |
| `ANTHROPIC_BASE_URL` | Routes API requests to another endpoint. Use a model ID and credential accepted by that endpoint |
| `ANTHROPIC_CUSTOM_HEADERS` | Adds headers, one `Name: Value` pair per line. Use only headers required by the endpoint; credentials and routing headers can affect authentication and settings approval |
| `CLAUDE_CODE_API_KEY_HELPER_TTL_MS` | Refresh interval in milliseconds for the credential supplied by the `apiKeyHelper` setting; it does nothing useful without that helper |

For an existing bearer-authenticated gateway, with `GATEWAY_TOKEN`
already supplied by the user's secret source:

```sh
ANTHROPIC_BASE_URL='https://gateway.example.com' \
  ANTHROPIC_AUTH_TOKEN="$GATEWAY_TOKEN" \
  claude
```

Replace the URL with the endpoint's documented base URL. Check for
stale API keys and provider selectors before assuming this is the only
active configuration. Keep rotating credentials in the launch secret
source or use `apiKeyHelper`, rather than duplicating a token in JSON.
See [LLM gateways](https://code.claude.com/docs/en/llm-gateway) for the
endpoint's authentication and model-ID requirements. An endpoint on a
host other than `api.anthropic.com` also disables Remote Control.

For an already signed-in subscription user whose API key is unwanted:

```sh
unset ANTHROPIC_API_KEY
claude
```

This works only after removing any settings or launcher assignment that
would restore the key. Check `/status` in the new session.

When the direct API or an LLM gateway is selected, check credentials
in this order: `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`,
`apiKeyHelper`, `CLAUDE_CODE_OAUTH_TOKEN`, a profile selected with
`ANTHROPIC_PROFILE` or federation credentials, then saved subscription
login. An implicit profile can rank below the saved login. A cloud
provider selection uses its own credentials. A signed-in Claude apps
gateway takes precedence over cloud provider selectors and direct API
credentials. Check managed login requirements if a configured
credential is rejected at startup.

## Credentials for scripts

To use a subscription in CI, inject a token from `claude setup-token`
as the job secret `CLAUDE_CODE_OAUTH_TOKEN`. A regular print-mode run
can use it, for example:

```sh
claude -p 'Reply with OK.'
```

Check for higher-priority credentials before running. Project and
local settings cannot set this token. Bare mode, selected by either
`--bare` or `CLAUDE_CODE_SIMPLE=1`, skips OAuth credentials. For direct
API access in bare mode, inject `ANTHROPIC_API_KEY` or pass an
`apiKeyHelper` through `--settings`. This uses API billing. See
[bare mode](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode).

## Select one provider deliberately

Keep only the selector for the intended backend and use its credential
chain. If authentication fails, verify the selected provider and its
credentials first.

| Backend | Environment and configuration synergy |
| --- | --- |
| Amazon Bedrock | `CLAUDE_CODE_USE_BEDROCK=1`; `AWS_PROFILE` chooses an existing AWS profile, `AWS_REGION` can override its region. Uses AWS credentials; `ANTHROPIC_BEDROCK_BASE_URL` overrides its endpoint |
| Google Vertex AI / Agent Platform | `CLAUDE_CODE_USE_VERTEX=1`; `ANTHROPIC_VERTEX_PROJECT_ID` chooses the request project, `CLOUD_ML_REGION` chooses the endpoint location. Uses Google application default credentials, not a direct Anthropic API key |
| Microsoft Foundry | `CLAUDE_CODE_USE_FOUNDRY=1`; `ANTHROPIC_FOUNDRY_RESOURCE` is a resource name, or use `ANTHROPIC_FOUNDRY_BASE_URL` for the full endpoint. Uses `ANTHROPIC_FOUNDRY_API_KEY`, a Foundry bearer token, or Azure's default credential chain |

For an existing authenticated AWS profile:

```sh
CLAUDE_CODE_USE_BEDROCK=1 AWS_PROFILE=work AWS_REGION=us-east-1 claude
```

Verify the region and model access for that profile before persisting
these values. Provider model IDs differ from direct API IDs; combine
provider selection with alias mappings in the models reference when
the deployment requires pinned models. Look up other backends, such as
Claude Platform on AWS, separately; they have distinct selectors and
workspace requirements.

Use the provider's current guide for the exact variables and credentials:
[Bedrock](https://code.claude.com/docs/en/amazon-bedrock),
[Google](https://code.claude.com/docs/en/google-vertex-ai), or
[Foundry](https://code.claude.com/docs/en/microsoft-foundry).

## Separate configuration directories

`CLAUDE_CONFIG_DIR` changes the directory containing user settings,
history, and plugins. For predictable account selection, set it before
launching, with an absolute path:

```sh
CLAUDE_CONFIG_DIR="$HOME/.claude-work" claude
```

The first run can require login. Project settings and inherited
credentials still apply. Claude Code ignores this variable in
project and local settings. Credential storage depends on the
authentication method: separate directories do not isolate two Console
sign-ins without an API key. Check the authentication guide before
claiming complete account separation.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
