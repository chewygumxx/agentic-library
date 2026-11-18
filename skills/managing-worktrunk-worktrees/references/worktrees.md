<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/managing-worktrunk-worktrees/references/worktrees.md
   -
   -->

# Worktree operations

## Contents

- [Create or switch](#create-or-switch)
- [Switch from a script](#switch-from-a-script)
- [Inspect](#inspect)
- [Merge and retain history](#merge-and-retain-history)
- [Remove and recover](#remove-and-recover)

## Create or switch

- `-C <path>` sets the working directory and Git repository. Relative
  worktree selectors resolve from that directory. Use a checkout path
  to identify a detached worktree or a second checkout of one branch.
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
  and is experimental. Put the switch target before `--`, which
  Worktrunk uses to pass arguments to the program named by `-x`.
  For pipelines or redirection, invoke a shell explicitly and pass
  template values as separate arguments if needed.

[Full switch reference](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/switch.md)

## Switch from a script

Run the [switch helper](../scripts/switch-path.py) from the skill
directory. This example creates `docs/review` from the local `develop`
branch in `/src/service` and checks Git status in the returned checkout.

```sh
checkout=$(python3 scripts/switch-path.py /src/service docs/review \
  --create --base develop) &&
  git -C "$checkout" status --short --branch
```

The helper runs `wt switch` with hooks enabled. On success, the Git
status starts with `## docs/review`. On failure, the helper retains the
exit status and reports any surviving checkout to stderr. Pass
`--wt git-wt` on Windows if needed. Omit `--create` and `--base` to
switch to an existing branch.

For native JSON, `-x`, or an environment without Python, run
`wt switch --no-cd --format=json` with the branch and relevant options.
The `path` field can be present on failure. `-x` runs in the selected
checkout with output on stderr. Only blocking hooks gate completion,
so check background setup before using its outputs.

## Inspect

- `wt list` shows worktree status and divergence from the default and
  tracking branches. Use `--branches` or `--remotes` to widen the
  listing. In v0.82.0, `wt list --format=json` defaults to schema 2.
  Read `items[].worktree.path` on rows with a worktree. Use
  `--config-set list.json-schema=2` to override a configured legacy
  bare array. Depending on configuration, `--full` or chosen columns
  can query forge CI and use an LLM to summarize diffs.
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
- `--stage=all` includes untracked files, `--stage=tracked` stages
  tracked changes, and `--stage=none` uses the existing index.
- A rebase conflict leaves the source worktree in a rebase. Inspect it
  there and resolve with Git or abort the rebase.
- Use `wt step commit`, `wt step squash`, `wt step rebase`, and
  `wt step push` for individual operations. `wt step push` fast-forwards
  a local target and updates its checkout when present.

### Keep the exact source commits

From another checkout in the same repository, fast-forward `develop`
to a clean `feature/auth` while keeping the source worktree. The
ancestry check gates the merge, and the final command prints two
matching commit IDs when the expected fast-forward succeeds.

```sh
git merge-base --is-ancestor develop feature/auth &&
  wt merge develop --branch feature/auth --no-commit --no-rebase --no-remove &&
  git rev-parse develop feature/auth
```

In v0.82.0, `--no-rebase` requires the ancestry relation even when
`--no-ff` requests a merge commit. A divergent target stops the command
without moving either branch. If both histories must be preserved,
perform a regular Git merge from the target checkout after reviewing
any required project checks.

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

After inspecting a clean feature checkout, remove it and verify its
branch when the user wants to keep the branch.

```sh
wt remove --foreground --no-delete-branch feature/auth &&
  git rev-parse --verify refs/heads/feature/auth
```

Use `git worktree list --porcelain` to confirm that the checkout path
is gone. This also works when the branch has unmerged commits.

[Removal and recovery reference](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/remove.md)

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
