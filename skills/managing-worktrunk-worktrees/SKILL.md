---
name: managing-worktrunk-worktrees
description: >-
  Operates and configures Worktrunk, the `wt` CLI for Git worktrees.
  Use when running `wt switch`, inspecting, merging, or removing
  Worktrunk checkouts, or troubleshooting shell integration,
  `.config/wt.toml` hooks and approvals, ignored-file copying, aliases,
  or LLM commits.
compatibility: >-
  Command examples target Worktrunk v0.82.0. Running them requires Git
  and the Worktrunk CLI. The optional headless switch helper uses Python 3.
license: GPL-3.0-only
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/managing-worktrunk-worktrees/SKILL.md
   -
   -->

# Managing Worktrunk worktrees

Use `wt --version` and `wt <command> --help` when the installed CLI's
options matter. Use `git worktree list --porcelain` for a local inventory.
`-C <path>` sets repository and working-directory context. A worktree
selector such as `--branch` identifies the source checkout. A merge's
positional target names the destination branch.

Before merging or removing, check what should happen to uncommitted
changes, commit history, the source branch, and the checkout. The
default `wt merge` can stage untracked files and remove the checkout.
For pending project commands, inspect `wt config approvals list` and
have the user review them with interactive `wt config approvals add`.

## References

- Read [Worktree operations](references/worktrees.md) to switch,
  inspect, merge, or remove a checkout. For headless switching, run
  the [switch helper](scripts/switch-path.py) as shown there.
- Read [Configuration and hooks](references/configuration.md) to
  set scopes, path templates, hook order, or command approvals.
- Read [Automation](references/automation.md) to configure aliases,
  copy ignored files, start services, or generate commit messages.
- Read [Setup](references/setup.md) for installation, shell wrappers,
  and agent plugins.
- Read [Troubleshooting](references/troubleshooting.md) when a command
  fails, a worktree or environment is wrong, or a hook appears stuck.

The references summarize the tagged Worktrunk documentation and link
to its full command and configuration references. [Upstream skill and
references at v0.82.0](https://github.com/max-sixty/worktrunk/tree/v0.82.0/skills/worktrunk)

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
