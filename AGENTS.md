---
title: Repository Agent Instructions
description: Repository agent instructions
---

<!--
   -
   - ~chewygumxx/agent-library.git
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
- `.agents/skills/` and `.claude/skills/*` contain the skills this repository
  sources by symlink. Synced by [`skills`](https://github.com/vercel-labs/skills),
  as specified by `skills-lock.json`.

## Repository Metadata

`.repo-metadata.jsonc` holds the GitHub repository's own description, topics
and licence. CI applies it on every push to `main`, so edit those settings
there and never in the GitHub web interface: Nothing rejects a web edit, and
the next push silently reverts it.

## Data by Function

Keep each kind of data in its own file, beside what it concerns:

- Directives for tools stay inline: licence headers, modelines, schema
  lines and lint suppressions.
- A why tied to one line stays inline, in one line.
- What a unit is for and what it promises goes in a file beside it.
- Pair files by a shared basename, not by "see" pointers. An index, such as
  a task file or a skill table, stays whole in one known place.
- Every split pair has a check that fails when the two disagree.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
