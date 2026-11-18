---
ctime: 2026-11-02
mtime: 2026-11-18
spdx: GPL-3.0-only
title: agentic-library
description: >-
  Curated agent asset catalogue prioritising harness and model compatibility.
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/README.md
   -
   -->

# agentic-library

Deployable agent assets for provision of terse context that is both model aware
and harness invariant. Models with greater reasoning capacity are not burdened
with the context catered to and available for lower reasoning models. Assets are
crafted to not depend, nor even consider the feature difference between
harnesses.

## Skills

| Skill                            | For                                                  |
| -------------------------------- | ---------------------------------------------------- |
| `coordinating-agents`            | Running agents within their context and usage limits |
| `compacting-context`             | Writing and rating a compaction's instructions       |
| `configuring-mise-tasks`         | Writing and naming a repository's mise tasks alike   |
| `mapping-tests`                  | Splitting long tests, mapped by mise tasks           |
| `managing-dotfiles-with-chezmoi` | Changing and applying dotfiles managed by chezmoi    |
| `writing-usage-specs`            | Writing CLI specs in KDL and generating from them    |
| `worktrees`                      | Making git worktrees that come out whole             |

Install all of them, or one, into a project, or with `--global` for every
project:

```sh
bunx skills add chewygumxx/agentic-library
bunx skills add chewygumxx/agentic-library --skill worktrees --global
```

`coordinating-agents` is configured by a roster in your agent instructions
and states what each of its parts needs. See its
[`SKILL.md`](./skills/coordinating-agents/SKILL.md).

A skill here must stand alone once copied out of this repository:
`tests/skills.test.mts` fails one that links outside itself, or that still
names the project it was imported from.

## Development

- `mise install` installs the pinned tools, then the git hooks, which
  [hk](https://hk.jdx.dev) runs from `.config/hk.pkl`. Run it once after
  cloning, before your first commit.
- `mise run skills` fetches the third-party skills listed under `skills`
  in `package.json`, at the commits pinned there, into `.agents/skills/`
  and `.claude/skills/`. Run it once after cloning: both directories are
  gitignored, and `bun install` only relinks skills already fetched.
- `mise run test` runs the tests; `mise run check` runs them and every
  other check CI runs, linting the staged files alone, or every file
  with `--all`; `mise run commit` composes a commit. `mise tasks` lists
  the rest. `bun run check` runs `mise run check --all`, for CI.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
