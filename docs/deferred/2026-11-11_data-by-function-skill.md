---
ctime: 2026-11-11
mtime: 2026-11-11
spdx: GPL-3.0-only
title: Data by function, as a skill
description: >-
  A skill for separating data by function waits on evidence from applying
  the doctrine to a larger repository; only its settled rules are in
  AGENTS.md.
tags:
  - skills
  - deferred
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/docs/deferred/2026-11-11_data-by-function-skill.md
   -
   -->

# Data by function, as a skill

The doctrine: docs, source, tests, build and CI each in their own files,
stored beside what they concern, and linked by a standard convention. Its
settled rules are in the root `AGENTS.md`, under "Data by Function",
which every agent reads. A skill waits.

## Why it waits

It has been tried once, on mise's task file. A skill spreads its mistakes
to every repository that adopts it, and this one would touch every file.
The open questions need a real repository to answer:

- Documentation in a `.d.ts` beside its `.ts`: TypeScript resolves imports
  to the `.ts` and ignores the `.d.ts`, so nothing checks they agree, and
  editor hovers show neither. Alternatives are a generated API report kept
  in the repository, after Microsoft's API Extractor, or a `.md` beside
  the source with a test that every export has an entry.
- Which level documents a thing: a file beside it, a directory of them,
  or one file for the directory, with nothing documented at two levels.

## What the skill would cover

Not the rules every edit needs, which are in `AGENTS.md`, but the
occasional jobs a skill's description can match:

- auditing a repository: classifying every comment as a directive, a
  label, a one-line why, a contract or narrative, and counting each;
- moving documentation out of code;
- choosing the level a piece of documentation belongs at;
- writing the check that keeps a split pair in agreement.

It may absorb the planned `documenting-configuration` skill and the wiki
skill, as one account of where text goes.

## When to take it up

Once the doctrine has been applied to Dorothy, starting with the comment
audit, and what held and what did not is recorded. Write the skill from
that record.
