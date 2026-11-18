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

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
