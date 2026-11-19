<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/managing-worktrunk-worktrees/references/setup.md
   -
   -->

<!-- cspell:words winget -->

# Setup

## Install and enable shell navigation

Worktrunk v0.82.0 requires Git 2.43 or newer. It is distributed through
Homebrew (`brew install worktrunk`),
Cargo (`cargo install worktrunk`), Windows Package Manager (`winget
install max-sixty.worktrunk`), and other channels listed upstream. On
Windows use `git-wt` if `wt` resolves to Windows Terminal.

`wt config shell install` sets up the shell wrapper. Restart the shell
or reload its startup file, then check `type wt` in Bash or Zsh, or
`Get-Command wt -All` in PowerShell. The wrapper interprets directory
changes the CLI requests. A call to the executable from a subprocess
cannot change its parent's directory. In automation use `--no-cd`,
then set the working directory for each subsequent tool call.

`wt config shell` reports available integration and setup status.
`wt config shell init <shell>` prints integration for manual setup.
Inspect the shell-specific startup file and wrapper ordering when `wt`
resolves to only a binary or a shim. See the upstream shell guide for
supported shells, fallback behavior, and debugging steps.

[Installation and overview](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/worktrunk.md)
[Shell integration reference](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/shell-integration.md)

## Integrate an agent CLI

For supported hosts, consult the plugin matrix before installing.
Examples from v0.82.0 include `wt config plugins claude install` and
`wt config plugins codex install`. Configuration skills, session
markers, and automatic worktree creation depend on the host. Claude
Code and OpenCode support lifecycle integration in the documented
versions. Codex sessions can create and remove worktrees directly with
`wt switch --create` and `wt remove`.

If an agent exits abruptly, `wt config state marker clear` removes a
stale marker for the current branch. Use `--branch <name>` to target a
named branch. Markers display activity in `wt list` and a detached
checkout has no branch marker. Use the plugin documentation when
installing, updating, or removing integrations.

[Plugin matrix and host-specific setup](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/claude-code.md)

For bare repositories or stacked branches, check how Worktrunk detects
the default branch and lays out worktrees. For a stack, `--base <branch>`
and an explicit merge target can identify the parent. For Windows
release integrity, consult the signing policy for the signed artifacts
and release approvals.

[FAQ and operational effects](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/faq.md)
[Windows code-signing policy](https://github.com/max-sixty/worktrunk/blob/v0.82.0/skills/worktrunk/reference/code-signing.md)

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
