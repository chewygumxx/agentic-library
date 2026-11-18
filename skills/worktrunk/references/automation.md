<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/worktrunk/references/automation.md
   -
   -->

<!-- cspell:words direnv endraw reflink -->

# Automation

## Extend the CLI

- Use a hook for a lifecycle event, an alias for a named workflow, and
  a `wt-<name>` executable on `PATH` for a standalone custom subcommand.
  Use `wt config alias show` to inspect templates and `wt config alias
  dry-run <name> -- <args>` to preview expansion.
- Aliases live in `[aliases]` in user or project config. Project aliases
  use command approvals. Templates can use `{{ branch }}`,
  `{{ worktree_path }}`, or positional values. Prefer `{{ args }}` when
  forwarding all arguments. Check the rendered command before use.
- `wt step for-each -- <program> <args>` runs the program sequentially
  in each worktree and continues past failures, then reports a summary.
  It passes template context as JSON on stdin. Invoke a shell explicitly
  for shell syntax. When nesting Worktrunk templates, use
  `{% raw %}...{% endraw %}` to reserve expansion for the inner command.
- `wt step eval '<template>'` helps test expansion. Store lightweight
  per-branch values with `wt config state vars set key=value` and read
  them in templates with `{{ vars.key }}`. Use `wt config state
  default-branch` to inspect or manage default-branch detection.

[Aliases, nested templates, and custom subcommands](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/extending.md)

## Set up worktree dependencies and services

`wt step copy-ignored` defaults to copying ignored files from the primary
worktree into the current worktree. Use `--from` and `--to` to specify
existing branch checkouts. Existing destination files are kept unless
`--force` is supplied. Supported filesystems can reflink files and
Worktrunk otherwise makes ordinary copies.

Use `.worktreeinclude` to select which ignored files to copy. Selection
requires both Git ignore and an inclusion match. For a shared hook that
should only copy explicitly selected files, use `wt step copy-ignored
--require-include`. Without an inclusion file the flag makes copying a
no-op. Exclude per-checkout settings and private files as appropriate.
Use `pre-start` when commands need the files immediately and
`post-start` when copying can continue in the background.

For a separate local service per branch, use `{{ branch | hash_port }}`
as a stable port in both `post-start` and the project `[dev-server]`
URL. Treat it as a deterministic choice and check for collisions when
a port is busy. The experimental `wt step tether -- <program>` ties a
service's lifetime to its worktree. For databases, `sanitize_db` creates
a branch-derived database name. Tools such as direnv or mise can apply
directory-specific environment settings when the shell changes checkout.

[Recipes for dependencies, services, and parallel work](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/tips-patterns.md)
[Copy and tether command details](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/step.md)

## Generate commit messages

In user config, set `[commit.generation]` `command` to a trusted program
that reads the rendered prompt on stdin and returns a commit message on
stdout. Use the upstream examples for the installed agent CLI and choose
the model and tool settings appropriate for that installation. The
prompt can include diffs. Check which provider receives them before use.

Worktrunk calls the configured program during commit and squash, which
can also happen inside `wt merge`. `wt step commit --dry-run` previews the
prompt and generated message without staging, running commit hooks, or
committing. It still runs the configured program. The same applies to
`wt step squash --dry-run` for squash messages. A user can configure
custom prompts in user config and a team can append guidance in project
config. Treat project-provided prompt fragments as project input subject
to approval.

For branch summaries, set `summary = true` under `[list]`, configure the
generator, and use `wt list --full`. For errors, check the command's exit
status and stdout in the relevant checkout, then inspect configured
paths, authentication, and prompt templates.

[LLM setup, prompts, and provider examples](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/llm-commits.md)
[Upstream troubleshooting](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/troubleshooting.md)

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
