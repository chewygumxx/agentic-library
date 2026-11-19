---
ctime: 2026-11-19
mtime: 2026-11-19
spdx: GPL-3.0-only
title: Skill check findings on the other skills
description: >-
  Warnings check-skill.mjs raised on this repository's other skills when
  authoring-agent-skills was written, left for later: long references
  without contents, and a Claude Code-only frontmatter key.
tags:
  - skills
  - deferred
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/docs/deferred/2026-11-19_skill-check-findings.md
   -
   -->

# Skill check findings on the other skills

Found by running the new skill's checker over every skill here; none is
an error, and none was in scope of the work that found it. Reproduce
with:

```sh
node skills/authoring-agent-skills/scripts/check-skill.mjs skills
```

## Long references without contents

Anthropic's best practices ask for a table of contents atop a reference
past 100 lines, as an agent previewing it with `head` otherwise sees only
its start. Each of these runs past 100 lines with no `Contents` heading:

- `coordinating-agents`: `recovery.md`.
- `managing-dotfiles-with-chezmoi`: `configuration.md`, `externals.md`,
  `scripts-and-hooks.md`, `secrets.md`, `source-state.md`,
  `templates.md`.
- `publishing-skills-to-npm`: `packaging.md`, `release-please.md`,
  `trusted-publishing.md`.
- `writing-usage-specs`: `arguments-and-flags.md`, `commands.md`,
  `completion.md`, `structure.md`.

Each fix is a `fix(skill):` for its skill: a short `## Contents` list
under the title.

## A Claude Code-only key

`compacting-context` sets `argument-hint`, which Claude Code reads and
claude.ai and the Claude API reject on upload. The skill is private and
meant for Claude Code, so this matters only if it is ever uploaded or
published: then drop the key, or say in `compatibility` that the skill is
for Claude Code alone.
