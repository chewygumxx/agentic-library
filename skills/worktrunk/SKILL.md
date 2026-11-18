---
name: worktrunk
description: >-
  Operates and configures Worktrunk, the `wt` CLI for Git worktrees.
  Use when a user mentions Worktrunk, `wt switch`, `wt list`, `wt merge`,
  `wt remove`, `wt step`, `wt hook`, `wt config`, or `.config/wt.toml`,
  including worktree targeting, shell integration, hook approvals,
  ignored-file copying, aliases, and generated commit messages.
compatibility: >-
  Command examples target Worktrunk v0.82.0. Running them requires Git
  and the Worktrunk CLI. Shell navigation uses Worktrunk shell integration.
license: GPL-3.0-only
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/worktrunk/SKILL.md
   -
   -->

# Worktrunk

1. Check `wt --version`, the current directory, and `wt list` when
   acting on a repository. Use `wt <command> --help` to check the
   installed version's options. On Windows, `git-wt` may be the
   Worktrunk executable if `wt` resolves to Windows Terminal.
2. Identify the source worktree and any destination branch separately.
   `-C <path>` sets the command's working directory and repository
   context. A branch or worktree-path selector such as `--branch` on
   `wt merge` and `wt step diff` selects the worktree inside that
   repository. The positional target on `wt merge develop` is the
   destination branch. Relative worktree paths resolve from `-C` when
   supplied. Use a path to disambiguate detached or duplicate checkouts.
3. Before merging or removing, inspect worktree changes and determine
   whether to keep the commit graph, worktree, or branch. Default
   `wt merge` can include untracked files, squash, rebase, and remove
   the source worktree and branch. `wt remove --no-delete-branch` keeps
   the branch while removing its worktree.
4. In a headless shell, select the worktree explicitly and use
   `wt switch --no-cd --format=json` with the applicable branch and
   creation flags. Run later commands with the returned worktree as
   their working directory using the result's `path` field. Check the
   exit status and the result before continuing. A failure after
   creation can leave a worktree in place.
5. Check `wt config approvals list` when a project hook or alias needs
   approval. Have the user review the actual commands interactively
   with `wt config approvals add`. In an unattended session, report
   the pending commands instead of adding `--yes` to bypass review.

## References

- [Worktree operations](references/worktrees.md) covers creation,
  switching, filtering, local merges, staging, cleanup, and recovery.
- [Configuration and hooks](references/configuration.md) covers config
  scopes, path templates, hook timing, sequencing, and approval.
- [Automation](references/automation.md) covers aliases, nested
  templates, ignored files, branch state, services, and LLM commits.
- [Setup and troubleshooting](references/setup.md) covers installation,
  shell integration, agent plugins, diagnostics, FAQ, and signing.

The references summarize the tagged Worktrunk documentation and link
to its full command and configuration references. [Upstream skill and
references at v0.82.0](https://github.com/max-sixty/worktrunk/tree/v0.82.0/skills/worktrunk)

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
