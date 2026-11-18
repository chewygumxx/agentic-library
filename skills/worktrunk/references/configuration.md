<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/worktrunk/references/configuration.md
   -
   -->

# Configuration and hooks

## Find the effective configuration

- `wt config show` reports the active files, misplaced settings,
  deprecated keys, invalid syntax, and outstanding project approvals.
  `wt config show --full` can invoke an LLM or query a network service.
- The user file is normally `~/.config/worktrunk/config.toml`. Put
  personal paths, command defaults, per-project overrides, LLM commands,
  and user hooks there. Run `wt config create` for a starter file.
- The versioned project file is `.config/wt.toml`. Put shared lifecycle
  hooks, aliases, dev-server URLs, forge settings, and exclusions there.
  When a checkout has changed the file, inspect that checkout's copy.
- For user keys such as `worktree-path`, an inline `--config-set`, then
  the relevant `WORKTRUNK_` environment variable, takes priority over
  saved settings. Within a config file a `[projects."host/owner/repo"]`
  value outranks a global value. Hooks, aliases, and copy exclusions
  can accumulate across sources. `--config <path>` selects a user file
  and `WORKTRUNK_PROJECT_CONFIG_PATH` selects a project file.

The default template places a new worktree beside the primary checkout
with a sanitized branch suffix. To place new worktrees under the repo,
set this in user config and ignore `.worktrees/` in Git.

```toml
worktree-path = "{{ repo_path }}/.worktrees/{{ branch | sanitize }}"
```

`repo_path` is the primary repository path. The `sanitize` filter
allows names such as `feature/auth` to be used in a single path segment.
Changing the template affects new worktrees. Check `wt step relocate`
before moving existing checkouts to their expected paths.

[Full configuration and precedence](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/config.md)

## Choose when hooks run

| Phase | Blocking hook | Background hook |
| ----- | ------------- | --------------- |
| Every switch, including to an existing worktree | `pre-switch` | `post-switch` |
| New worktree only | `pre-start` | `post-start` |
| Worktrunk commit | `pre-commit` | `post-commit` |
| Merge | `pre-merge` | `post-merge` |
| Worktree removal | `pre-remove` | `post-remove` |

`pre-switch` runs in the source checkout. `pre-start` runs in the new
checkout before `--execute` and background hooks. Use it for setup that
must finish before work starts. A blocking hook failure stops the
operation at that phase. `pre-merge` runs after rebase, and `pre-remove`
runs while the worktree still exists. Separate Git hooks may also apply.

Use a string for one command. Multiple keys in a single hook table run
concurrently. Use consecutive array-of-table blocks when one command
depends on another. For example, put installation before code generation
in a project whose package scripts support these commands.

```toml
[[pre-start]]
install = "npm ci"

[[pre-start]]
generate = "npm run generate"
```

User `pre-*` hooks run before project `pre-*` hooks. User and project
`post-*` hooks can run alongside one another. Keep dependent commands in
the same ordered pipeline and use separate keys in a block for parallel
commands. Validate the commands with the repository's own task runner.

## Preview, approve, and debug

- `wt hook pre-start --dry-run` previews expanded commands. Use
  `wt hook <type> --foreground` to run a hook inline during debugging.
  `wt config state logs` locates background output. `-v` shows context
  including hook template variables, and `-vv` adds diagnostic logging.
- Project hooks and aliases prompt before execution. `wt config
  approvals list --format=json` reports the state without changing it.
  User hooks come from personal config and follow its trust model.
- Run `wt config approvals add` in an interactive terminal to review
  pending project commands. A template edit or project move can require
  renewed approval. In a headless run, report the commands and let the
  user make the trust decision. `--yes` on the operation bypasses the
  prompt once, while `wt config approvals add --yes` records approval
  for later invocations. Use the interactive review for user projects.
- `--no-hooks` is available on lifecycle commands such as `wt switch`.
  Use it only when the requested operation can intentionally skip the
  setup, checks, and other effects those hooks provide.

[Hook reference and template variables](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/hook.md)

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
