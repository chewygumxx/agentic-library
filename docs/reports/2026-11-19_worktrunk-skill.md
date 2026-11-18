---
ctime: 2026-11-19
mtime: 2026-11-19
spdx: GPL-3.0-only
title: Worktrunk skill evaluation
description: >-
  Source coverage, paired prompt evaluation, and runtime verification of
  the Worktrunk skill against Worktrunk v0.82.0.
tags:
  - skills
  - worktrunk
  - report
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/docs/reports/2026-11-19_worktrunk-skill.md
   -
   -->

# Worktrunk skill evaluation

## Source coverage

Skill Seekers saved all 15 pages listed by the Worktrunk sitemap. It
skipped the linked JSON schema and its optional enhancement did not
complete. The generated draft grouped the pages into one reference and
joined lines in some command examples. The repository skill summarizes
the documentation in four topic references. A link check against the
v0.82.0 checkout verified all 16 upstream skill reference files and the
separate machine-readable schema. The full reference text is available
through the versioned links in the skill.
[Tagged Worktrunk sources](https://github.com/max-sixty/worktrunk/tree/v0.82.0/skills/worktrunk)

## Prompt evaluation

Each task ran in a fresh agent session with the new skill or with
model knowledge alone. Agents supplied instructions without executing
them. The review scored explicit checks against the answers and the
v0.82.0 CLI. The merge answer was rerun after its reference changed.
The other answers and the baseline were carried forward. This is one
answer per variant per task and measures guided task performance.
Automatic skill activation, timing, and token use were outside the eval.

| Task | Draft skill | Reviewed skill | Without skill |
| ---- | ----------- | -------------- | ------------- |
| Merge a clean feature into local `develop`, retain the worktree and exact commits | 2/3 | 3/3 | 2/3 |
| Run npm setup in order on creation before `wt switch -x`, then resolve project approval | 4/4 | 4/4 | 1/4 |
| Create a headless checkout from `develop`, resolve its actual path, and handle failed setup | 4/4 | 4/4 | 3/4 |
| Total assertions | 10/11 | 11/11 | 6/11 |

- The draft merge answer suggested adding `--no-ff` to integrate a
  divergent destination while retaining `--no-rebase`. The released
  binary rejected that combination with `Branch not rebased onto
  develop`. The reviewed reference states the ancestry requirement
  and the rerun gives a regular Git merge as the way to retain both
  histories when the branches diverge. The baseline correctly
  predicted the failed fast-forward but did not explicitly skip the
  commit step.
- The skill answer used two ordered `[[pre-start]]` blocks and gave
  both the approval inspection and interactive approval commands.
  The baseline identified the project file but proposed a
  `post-create` event that Worktrunk does not support.
- The headless skill answer read `path` from `wt switch --format=json`
  output even when the command failed, and gated CI on setup success.
  The baseline's Git registry lookup is a workable fallback. It missed
  the version-specific output interface.

## Runtime and package verification

An upstream Linux binary with a verified release checksum ran in
disposable repositories with isolated Worktrunk configuration. Four
probes passed.

- Merging a clean feature with `--branch`, `--no-commit`,
  `--no-rebase`, and `--no-remove` fast-forwarded `develop` to the
  original feature tip and retained the feature checkout and history.
- A diverged target stayed unchanged with and without `--no-ff`
  under `--no-rebase`. A regular Git merge from the target checkout
  preserved both branch tips as parents.
- Unapproved project commands failed in a non-interactive run. After
  storing approval for the fixture commands, `pre-start` ran two
  commands in order before `-x`. Switching back did not rerun setup.
- A failing `pre-start` returned a nonzero exit status and a JSON
  `path` pointing to the registered checkout at the requested base.

The repository checks passed all 235 tests. `bun run skills` synced
the workspace skill and `mise run skill-packages:check --pack worktrunk`
verified that the npm package includes the bundled references. The
package kept the upstream tool's name, `worktrunk`, as its skill
identifier. The package check reports the non-gerund name as advisory.

## Authoring review

The entry point was already below Claude's 500-line guidance and
linked directly to every local reference. The revision shortened it
from 66 to 54 lines, moved headless instructions to the worktree guide,
gave error recovery its own route, and added a table of contents to the
worktree reference, which exceeds 100 lines. The description keeps
Worktrunk-specific triggers and describes the skill in third person.
The identifier `worktrunk` matches its directory and satisfies the
format requirements. A gerund such as `using-worktrunk` would better
match the collection's style and distinguish it from the upstream
skill. The initial review retained the existing identifiers.
[Claude authoring guide](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices#naming-conventions)
[Agent Skills specification](https://agentskills.io/specification)

The troubleshooting guide now connects symptoms to native commands
for inspecting the actual checkout, config, approvals, and hook logs.
It distinguishes a branch or directory collision, an inactive shell
wrapper, failed setup that leaves a worktree behind, and a merge that
has already integrated before cleanup fails. The automation guide
corrects the dev-server URL to `url` under `[list]`. The worktree guide
documents the default list JSON envelope and the inline override for
configurations that still select the legacy array.

The optional Python helper delegates switching and hooks to Worktrunk.
It captures native JSON, emits a usable path on success, and surfaces
the surviving checkout on stderr if setup failed. This replaces the
repeated shell parsing from the earlier headless answer. Other tasks
use native preview and inspection commands, including `wt config
show`, `wt config approvals list`, and `wt hook <type> --dry-run`.

Both `/spec/` and `/spec.md` returned HTTP 404. The live sitemap and
the upstream GitHub documentation tree have no `spec` page. When the
Skill Seekers GitHub scrape timed out, the review used a direct clone
to inspect the documentation tree. It verified that the skill links
to all 16 tagged upstream references and the list JSON schema. It
checked behavior against the tagged Markdown, integration tests, and
released CLI. The package delivers workflow guides and links to the
full upstream material.
[Live sitemap](https://worktrunk.dev/sitemap.xml)
[Upstream documentation tree](https://github.com/max-sixty/worktrunk/tree/af88969/docs/src/content/docs)

The four original CLI probes still passed. Five additional checks
exercised the helper with a checkout path containing spaces, an early
failure without a path, and a post-creation failure that retains the
path and exit status. The other checks verified selecting schema 2
over a legacy configuration and matching the rendered dev-server
port against the URL in `wt list` output. The prompt evaluation above
used guided skill access in Codex. This review measured CLI behavior
and checked the package structure against the Claude authoring guide.

## Naming and executable examples

The skill is now `managing-worktrunk-worktrees`, with the same name in
the directory, frontmatter, and npm package suffix. The gerund names
the activity and the Worktrunk qualifier makes the tool scope explicit.
The description names concrete Worktrunk commands and config tasks for
discovery alongside the collection's general Git worktree skill. The
workspace, Bun lockfile, skill lockfile, release mapping, and both
agent links use the new name. The former package name was absent from
the public npm registry at the time of the rename.
[Skill Seekers naming and metadata guidance](https://skillseekersweb.com/docs/reference/ai-skill-standards#1-naming-conventions)

The entry point now starts with the most common commands and routes
to individual task references. The frontmatter declares the Git minimum,
the tested Worktrunk version, and the optional helper's Python
dependency. The package uses standard frontmatter and relative links
to bundled resources. The npm manifest and release tooling carry the
skill's own version.
[Agent Skills specification](https://agentskills.io/specification)

Three shell examples check observable outcomes using native commands.
The headless switch example verifies the branch from inside the
returned path. The merge checks ancestry, asks for a fast-forward
even if the user configured merge commits, and prints the final branch
tips. The removal reports the surviving branch tip and can be followed
by a registry check for the removed checkout.
[Claude guidance on verifiable outcomes](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices#create-verifiable-intermediate-outputs)

The six fenced shell and TOML examples were exercised on Worktrunk
v0.82.0 in disposable repositories. The cases included a path with
spaces, preservation of exact commit IDs under a merge-commit default,
removal with either a merged or an unmerged branch, sanitizing a slash
in a branch name, ordering real npm installation before generation and
`-x`, and matching the generated service port. The previous nine CLI
probes also passed.
Both `skills-ref validate` and the skill-creator validator accepted
the skill. The package check verified the bundled references and helper.
Local sync verified the new links for Codex and Claude Code.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
