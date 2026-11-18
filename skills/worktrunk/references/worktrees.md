<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/worktrunk/references/worktrees.md
   -
   -->

# Worktree operations

## Create or switch

- `wt switch feature/auth` enters its worktree or creates a worktree
  for the existing branch. A matching remote-only branch can become a
  local tracking branch.
- `wt switch --create feature/auth --base develop` creates a branch
  from `develop`. The repository's default branch is the usual base.
  Use `--base=@` to branch from the current checkout's HEAD.
- `wt switch -` opens the previous worktree, `wt switch ^` the default
  branch, and `wt switch` the interactive picker. `pr:123`, `mr:123`,
  and supported pull or merge request URLs identify forge branches.
  Fork checkouts can fetch refs and set a push remote.
- `--path <path>` overrides the template for a new worktree in v0.82.0
  and is experimental. `-x <program> -- <args>` runs a program inside
  the selected worktree. For pipelines or redirection, invoke a shell
  explicitly and pass template values as separate arguments if needed.
- `--no-cd` leaves the invoking shell in place. Worktrunk still runs
  its hooks and starts any `-x` command in the selected worktree.
  `--format=json` writes a structured result to stdout when available.
  Diagnostics and `-x` output go to stderr. Read the result even on
  failure to discover whether the worktree was created before the
  failure. Background hooks can still be running after the result.

[Full switch reference](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/switch.md)

## Inspect

- `wt list` shows worktree status and divergence from the default and
  tracking branches. Use `--branches` or `--remotes` to widen the
  listing, or `--format=json` for automation. `--full` can query forge
  CI status and generate branch summaries through the configured LLM.
- `wt step diff --branch feature/auth` reports the net diff since the
  branch diverged, including committed, staged, unstaged, and untracked
  changes. Use `git -C <path> status --short` for individual index and
  working tree states.
- `wt list statusline` emits a one-line view. CI refreshes can make it
  slow for a synchronous shell prompt.

[List reference and JSON schema](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/list.md)
[Machine-readable list v2 schema](https://github.com/max-sixty/worktrunk/blob/v0.82.0/docs/public/schema/list-v2.json)

## Merge and retain history

`wt merge [TARGET]` integrates into a local branch. The source defaults
to the current worktree. Use `--branch <source>` to select a different
source worktree while staying in the invoking checkout. Work happens
in the selected source checkout, including its hooks and any rebase
conflict. The target defaults to the repository's default branch.
Fetching and publishing are separate Git operations.

By default, Worktrunk can stage and squash working changes and branch
commits, rebase onto the target, run pre-merge checks, fast-forward the
target, and remove the source worktree and branch. Inspect the source
and target before running the pipeline.

- Keep the source's separate commits with `--no-squash`. A new commit
  can still be made and a rebase can still change earlier commit IDs.
- Keep the exact commits on a clean source and retain its worktree
  with `wt merge develop --no-commit --no-rebase --no-remove`.
  In v0.82.0, `--no-rebase` requires `develop` to be an ancestor of
  the source, including when `--no-ff` requests a merge commit. A
  divergent target stops the command without moving either branch.
  If both histories must be preserved, perform a regular Git merge
  from the target checkout after reviewing any required project checks.
- `--stage=all` includes untracked files, `--stage=tracked` stages
  tracked changes, and `--stage=none` uses the existing index.
- A rebase conflict leaves the source worktree in a rebase. Inspect it
  there and resolve with Git or abort the rebase.
- Use `wt step commit`, `wt step squash`, `wt step rebase`, and
  `wt step push` for individual operations. `wt step push` fast-forwards
  a local target and updates its checkout when present.

[Merge pipeline and flags](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/merge.md)
[Step command reference](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/step.md)

## Remove and recover

- `wt remove [BRANCHES...]` defaults to the current worktree. Use the
  checkout path for a detached worktree. By default branch cleanup
  checks whether the content is integrated, which can recognize
  squash-merged branches even when ancestry alone does not.
- `--no-delete-branch` retains the branch. `--force` permits removal
  of a dirty worktree and `-D` permits deletion of an unmerged branch.
  These flags address different data. Before forcing, inspect changes,
  including ignored files and submodules, and confirm the intended loss.
- On force removal, Worktrunk saves staged, unstaged, and untracked
  changes to `refs/wt-backup/<branch>` and prints a recovery command.
  The backup excludes ignored files and changes inside submodules.
- `--foreground` waits for removal. With `--format=json`, check
  `branch_outcome` when the distinction between deleting and retaining
  a branch matters. Background cleanup can report `deferred`.
- `wt step prune --dry-run` previews bulk cleanup candidates. The
  experimental `wt step relocate`, `wt step promote`, and `wt remove
  --reap` move checkouts or manage processes. Read the matching command
  reference before using them.

[Removal and recovery reference](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/remove.md)

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
