<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/worktrunk/references/troubleshooting.md
   -
   -->

<!-- cspell:words endraw -->

# Troubleshooting

## Wrong checkout, base, or destination path

- **Unexpected base.** Run `git worktree list --porcelain` and `wt
  config state default-branch get`. Creation starts from the default
  branch unless `--base` is supplied. Use `--base=@` for current HEAD.
  Prefer branch or path selectors for a checkout in the same repository.
- **Branch already exists following creation.** Inspect the registry
  and the branch tip. Use `wt switch <branch>` if the existing branch is
  the intended one. If setup failed after creation, recover that setup
  before running tools that depend on it.
- **Directory already exists.** Check the registry and inspect the
  real directory. If it is a registered worktree on the intended branch,
  switch by branch or path. If the location is occupied by other files,
  select a free location with supported `--path` or the path template.
  `--clobber` moves an existing directory aside when possible. Inspect
  it before deciding whether to use that flag.
- **Switch succeeds but `pwd` stays the same.** Run `wt config shell`
  and `type wt` in the affected shell. Bash and Zsh need the shell
  function available there. In PowerShell use `Get-Command wt -All`.
  A subprocess cannot change the parent directory, so pass the switch
  result as the next process's working directory.

## Approval, hooks, and missing files

- **`Cannot prompt for approval in non-interactive environment`.**
  Check the project configuration from the checkout used by the
  operation. Run `wt config approvals list --format=json` for the exact
  entries that need review. Have the user run `wt config approvals add`
  interactively. An edited template can require review again.
- **Setup failed after the branch or checkout was created.** Inspect
  the switch result or worktree registry before retrying. From the new
  checkout, run `wt config show`, then `wt hook pre-start --dry-run`
  to see the expanded setup steps. A repeat switch to an existing
  worktree skips creation hooks. Review what completed and rerun the
  failed step or, if safe to repeat, the full hook with
  `wt hook pre-start --foreground`. Resume the dependent task after
  setup succeeds.
- **Missing dependencies, ignored files, or server readiness.** Check
  whether setup runs in `post-start`, which can outlive the switch.
  Run `wt config state logs` to find output. For `copy-ignored`, check
  the source and destination, Git ignore rules, `.worktreeinclude`,
  and exclusions. Use `git check-ignore -v -- <path>` in the source to
  see the ignore match. Put prerequisites for `-x` in `pre-start`.
- **A nested alias reports the same branch in every checkout.** Run
  `wt config alias dry-run <name>` and check whether the outer alias
  expanded a template early. Use `{% raw %}...{% endraw %}` to defer
  its expansion to the nested Worktrunk command.

## Merge and removal

- **`Branch not rebased onto` the target.** Use
  `git merge-base --is-ancestor <target> <source>` to check topology.
  If the target diverged, `--no-ff` with `--no-rebase` still fails in
  v0.82.0. Pick rebase or a regular Git merge based on which history
  the user needs to preserve.
- **Merge stopped on a conflict or during cleanup.** Inspect
  `git -C <source-path> status` and check the target ref before retrying.
  A rebase conflict stays in the source checkout. If a removal hook
  failed after integration, recover cleanup separately from merging.
- **Worktree is dirty, locked, or still checked out elsewhere.** Use
  `git status --short` in that checkout and `git worktree list
  --porcelain` to identify the blocker. Preserve changes before
  removal. `--force` and `-D` act on different things. Stale metadata
  can require `git worktree repair`, and background removal may take
  time to complete. Check `wt remove --help` before acting.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
