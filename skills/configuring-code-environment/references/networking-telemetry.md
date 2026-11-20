<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/configuring-code-environment/references/networking-telemetry.md
   -
   -->

# Networking and telemetry

<!-- cspell:words AUTOUPDATER -->

## Contents

- [Proxy and TLS](#proxy-and-tls)
- [Optional traffic and updates](#optional-traffic-and-updates)
- [OpenTelemetry export](#opentelemetry-export)

These variables control different connections: an API gateway changes
the destination, a forward proxy changes the network route, and an
OpenTelemetry exporter sends monitoring data to a collector.

## Proxy and TLS

| Variable | Effect and synergy |
| --- | --- |
| `HTTPS_PROXY`, `HTTP_PROXY` | Forward proxy for requests; independent of `ANTHROPIC_BASE_URL`. Lowercase forms also work; the documented lookup order is `https_proxy`, `HTTPS_PROXY`, `http_proxy`, `HTTP_PROXY` |
| `NO_PROXY` | Hosts/IPs that bypass the proxy; use a comma-separated list such as `localhost,127.0.0.1,.example.internal` |
| `NODE_EXTRA_CA_CERTS` | Path to a PEM CA bundle that adds trust for a private CA; does not supply a client identity |
| `CLAUDE_CODE_CLIENT_CERT`, `CLAUDE_CODE_CLIENT_KEY` | Certificate and private-key paths for mTLS; pair them. `CLAUDE_CODE_CLIENT_KEY_PASSPHRASE` supplies the passphrase when required |

For an HTTPS-inspecting corporate proxy:

```sh
HTTPS_PROXY='http://proxy.example.com:8080' \
  NO_PROXY='localhost,127.0.0.1,.example.internal' \
  NODE_EXTRA_CA_CERTS='/absolute/path/corporate-ca.pem' \
  claude
```

Replace the host and path with existing values. Check lowercase proxy
variables when an uppercase change appears ignored. Keep certificate
verification enabled; install the correct CA rather than disabling TLS
checks. Claude Code does not support SOCKS proxies. Verify against the
[network guide](https://code.claude.com/docs/en/network-config), including
whether a service or IDE inherited the same environment.

## Optional traffic and updates

| Variable | Effect and interaction |
| --- | --- |
| `DISABLE_TELEMETRY` | Any non-empty value opts out of telemetry and feature-flag fetching; `0` still opts out |
| `DISABLE_ERROR_REPORTING` | Any non-empty value opts out of error reporting; independent of the telemetry variable |
| `DO_NOT_TRACK` | Standard boolean opt-out with the telemetry and feature-flag effects above; unlike `DISABLE_TELEMETRY`, `0` does not opt out |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | Any non-empty value disables a broader collection, including telemetry, error reporting, automatic updates, feedback, and feature-flag fetching. Not an offline mode or a comprehensive network block |
| `DISABLE_AUTOUPDATER` | `1` disables automatic background updates; manual `claude update` remains available |
| `DISABLE_UPDATES` | `1` also blocks manual `claude update` and `claude install`; stricter than `DISABLE_AUTOUPDATER` |

For a user who wants only error reporting disabled:

```sh
DISABLE_ERROR_REPORTING=1 claude
```

Prefer that specific variable over the broad traffic switch. For
telemetry opt-out use `DISABLE_TELEMETRY=1`, and explain its feature-flag
effect. Stopping feature-flag fetching can remove features; the broad
traffic switch also makes Remote Control unavailable. Consult the
[feature-flag dependencies](https://code.claude.com/docs/en/env-vars#features-that-need-feature-flag-fetching)
before attributing missing functionality to authentication or model
selection. Unset presence-based variables rather than changing them to
`0` to reverse their effect.

## OpenTelemetry export

`CLAUDE_CODE_ENABLE_TELEMETRY=1` enables OpenTelemetry collection.
`OTEL_METRICS_EXPORTER` and `OTEL_LOGS_EXPORTER` choose exporters;
`OTEL_EXPORTER_OTLP_PROTOCOL` and `OTEL_EXPORTER_OTLP_ENDPOINT` choose
the transport and destination. Per-signal settings can override the
generic endpoint or protocol. An endpoint alone does not enable export.

For an existing local OTLP HTTP collector, these launch variables export
metrics without enabling a log exporter:

```sh
CLAUDE_CODE_ENABLE_TELEMETRY=1 \
  OTEL_METRICS_EXPORTER=otlp \
  OTEL_LOGS_EXPORTER=none \
  OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf \
  OTEL_EXPORTER_OTLP_ENDPOINT='http://localhost:4318' \
  claude
```

Confirm receipt at the collector; adapt the endpoint and protocol to
its actual listener. Check for existing per-signal overrides. For
persistence, use user or managed settings, the launch environment, or
`--settings`; current versions ignore activation, destination, and
content-capture variables in project/local settings. Certain off values
still apply there, with special precedence; see the
[`env` exceptions](https://code.claude.com/docs/en/settings-reference#variables-claude-code-ignores-in-env).

`OTEL_LOG_USER_PROMPTS` enables prompt content. Unless explicitly set,
`OTEL_LOG_ASSISTANT_RESPONSES` follows that prompt setting. Keep content
capture out of ordinary exporter examples; explain what is sent when
the user requests it. For rotating collector headers, the
`otelHeadersHelper` setting complements exporter variables without
embedding a long-lived bearer token in JSON.

OpenTelemetry initializes at process startup: restart after editing.
Use the [monitoring guide](https://code.claude.com/docs/en/monitoring-usage)
for exporter support, opt-out interactions, managed destination rules,
and the variables for the requested signal.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
