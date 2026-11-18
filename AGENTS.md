---
title: Repository Agent Instructions
description: Repository agent instructions
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/AGENTS.md
   -
   -->

# Repository Agent Instructions

## Continuous Granular Commits

Continuously granularly commit as you work. Compose single-line commit messages
whenever appropriate. If the granular commit does indeed warrant further
context, include such within the commit message body.

## Repository Layout

- `skills/` contain the skills this repository provides, one directory each.
  Each is also a workspace package, `@chewygumxx/skill-<skill>`; see
  [Publishing a Skill](#publishing-a-skill).
- `tests/` holds the tests, each file with a mise task that maps it to
  what it covers. Read [`tests/AGENTS.md`](tests/AGENTS.md) before adding
  or changing one.
- `.agents/skills/` and `.claude/skills/*` contain the skills this repository
  sources by symlink. Synced by [`skills`](https://github.com/vercel-labs/skills)
  on `bun install`, as declared by the `skills` field of `package.json` and
  pinned by `skills-lock.json`. Declare a skill there, then `bun run skills`;
  never `skills add`, which sync skips. This repository's own skills are
  sourced the same way, as `workspace:*` devDependencies: a new skill's
  package goes there too.

## Publishing a Skill

A skill's `package.json` repeats its frontmatter's `description` and
`license`; change both together, as `tests/packages.test.mts` fails them
apart. A new skill needs its own `package.json`, copied from a sibling,
and a `workspace:*` devDependency in the root `package.json`.

### Commit Types Release Skills

[release-please](https://github.com/googleapis/release-please) reads the
conventional commits touching each `skills/<skill>/`. Type a change to a
skill by what it does for the skill's users, never by the file it edits:
a `SKILL.md` is the skill's code, not its documentation.

| Commit                          | Below 1.0.0 | For                                    |
| ------------------------------- | ----------- | -------------------------------------- |
| `feat(skill):`                  | Patch       | New guidance, scripts or behaviour     |
| `fix(skill):`                   | Patch       | Wrong or misleading guidance corrected |
| `feat(skill)!:`, `fix(skill)!:` | Minor       | Removes or changes what users rely on  |
| `docs`, `refactor`, other       | No release  | Changes users of the skill never see   |

A commit touching several skills releases each. Keep one skill's change
to one commit where you can: its message becomes that skill's release
notes. A `Release-As: <version>` footer forces a version, as for the
first `0.1.0`.

### Releasing

`.github/workflows/release-please.yaml` keeps one pull request open on
`main` that bumps each changed skill's `version`, and
`.config/release-please-manifest.json`. Merging publishes a GitHub
release per skill, tagged `skill-<skill>@<version>`, which starts
`.github/workflows/publish.yaml` to publish it on npm with provenance:
merging the release pull request is the approval. Both act as the
`release-please-agentic-library` GitHub App, whose events start other
workflows where `GITHUB_TOKEN`'s would not.

A new public skill needs an entry under `packages` in
`.config/release-please.json`, and its version in the manifest. Its
first version is published by hand, before its trusted publisher can be
set, with `npm publish --workspace skills/<skill> --provenance=false`:
its `publishConfig` asks for provenance, which only CI can attest. A
`private` package is in neither file, and never published.

## Git Hooks

[hk](https://hk.jdx.dev) runs the git hooks declared in `.config/hk.pkl`:
`check --staged` before a commit, `lint:commit` on its message, and
`lint:headers` before a push. Each step only runs its mise task, so change
what a hook checks in the task, never in `hk.pkl`. `mise install` installs
the hooks, by the `postinstall` hook in `.config/mise/config.toml`, into the
git config every worktree shares. Never pass `--no-verify`, nor set `HK=0`,
to get past a failing hook: fix what it reports.

## Repository Metadata

`.repo-metadata.jsonc` holds the GitHub repository's own description, topics
and licence. CI applies it on every push to `main`, so edit those settings
there and never in the GitHub web interface: Nothing rejects a web edit, and
the next push silently reverts it.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
