---
name: authoring-agent-skills
description: >-
  Writes, checks, evaluates, reviews and releases agent skills, the
  SKILL.md directories that Claude Code, Codex, claude.ai and other
  clients load, against the Agent Skills specification and the authoring
  practices of Anthropic and agentskills.io, with a checker script and a
  miner for past sessions' corrections. Use when creating or editing a
  skill, wording its name, description or frontmatter, deciding what
  belongs in SKILL.md, references or scripts, testing whether it
  triggers or helps, reviewing one, drawing one from past sessions,
  packaging or uploading one, finding why a client refuses or ignores
  one, or preparing a skill's release.
compatibility: >-
  Any client of the Agent Skills format. The scripts need Node 18.3 or
  later and nothing else; the miner reads Claude Code and Codex
  transcripts.
license: GPL-3.0-only
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/authoring-agent-skills/SKILL.md
   -
   -->

# Authoring agent skills

A skill earns its place by what an agent would get wrong without it. Its
description is all most sessions ever see, so it decides whether the
skill loads; its body competes for the context window with everything
else once it does. So write from evidence of real mistakes, keep the
body to what the agent lacks, push detail and mechanics into files it
reads or runs only when needed, and measure the result against no skill
at all.

```text
scope -> evidence -> draft -> check -> evaluate -> review -> release
            ^------------ revise on what each step finds ----'
```

Several sources govern a skill, and they disagree in places: the
specification's rules over any guide's, a client's documentation for
that client, and Skill Seekers' rubric last.
[Sources](references/sources.md) lists each, what it settles, and how
the conflicts resolve. Read it before citing any of them.

Most tasks need only part of this:

| Task | Start at |
| --- | --- |
| Write a new skill | [1. Scope it](#1-scope-it), then onward |
| Draw one from past sessions | [2. Gather evidence](#2-gather-evidence), [mining](references/mining-transcripts.md) |
| Fix or review an existing skill | [4. Check it](#4-check-it), [6. Review it](#6-review-it) |
| A client refuses or ignores a skill | [4. Check it](#4-check-it) for that target, then [clients](references/clients.md) |
| Make it trigger, or stop over-triggering | [Evaluating](references/evaluating.md), trigger evaluations |
| Release, publish or upload it | [7. Release it](#7-release-it), [releasing](references/releasing.md) |

## 1. Scope it

- **One coherent unit of work,** as a function is: too narrow and a task
  loads several skills that may conflict; too broad and the description
  cannot say precisely when to load it. Search what is installed, and
  any registry the person uses, before writing one that exists.
- **Ask before commencing** what the request, the code and a sensible
  default cannot settle: the name, which clients it must run in,
  whether it is published, and how general it must be. Offer a
  recommended option with each question, and read the notes a person
  adds to an answer: they often widen it.
- **Name it for the activity, in plain words:** a gerund phrase such as
  `processing-pdfs`, lowercase letters, digits and single hyphens, at
  most 64 characters, matching its directory, without `anthropic` or
  `claude`. Prefer the words a person would say over grand ones. A name
  is installed under, linked by and, once published, permanent: settle
  it first.
- **Decide its scope: one project, or any.** A skill for one project's
  deploy runbook is made of that project's hosts, scripts and
  conventions: keep them, as they are what the agent lacks. A skill for
  any project parameterises them instead, with `<placeholders>` and the
  question to ask. Either way, everything it bundles travels with its
  directory, as installers copy that alone: no links out of it, and no
  secrets in it.

## 2. Gather evidence

The model already knows what a PDF or a migration is. What it lacks is
specific: an upstream tool's real behaviour, a project's conventions,
and the corrections a person had to make last time. Collect those before
drafting, and the draft writes itself from them.

- **The person's corrections.** Past sessions hold every time someone
  steered an agent. [`scripts/extract-user-turns.mjs`](scripts/extract-user-turns.mjs)
  pulls just those turns from Claude Code and Codex transcripts, with
  the agent's words before each; [Mining
  transcripts](references/mining-transcripts.md) says what to look for.
- **Upstream documentation and source,** fetched rather than recalled,
  as tools change faster than training data. A documentation scraper,
  such as Skill Seekers, can turn a site or repository into reference
  files to distil from.
- **A baseline.** Run two or three realistic tasks with no skill and
  note what goes wrong. These are the evaluation's first cases, and
  what the skill must fix.

## 3. Draft it

**Frontmatter.** `name` and `description`, `license`, `compatibility`
only for real requirements (a runtime, network, a client), and anything
else under `metadata` as strings. A client's own fields, such as Claude
Code's `disable-model-invocation`, make claude.ai and the Claude API
reject the skill: use them only in a skill for that client.
[Clients](references/clients.md) has each client's fields, paths and
limits.

**Description.** What it does, in the third person, then `Use when`
with the intents that should load it, including ones that never name
its domain. Put the main use first: clients shorten descriptions when
many skills share the listing's budget. At most 1,024 characters.

**Body.** Ask of each line: would the agent get this wrong without it?
That question is for new writing. Repairing or restructuring a skill,
keep every instruction that is not wrong or superseded, moving it where
it belongs; remove one only if it is, or if the person asks.

- Explain why, so the agent can judge cases the text never names. Keep
  exact, do-not-vary commands for the fragile steps, such as a
  migration or a publish.
- Give a default and its escape hatch, not a menu of equals; teach the
  procedure for a class of task, not the answer to one.
- Keep a gotchas section in `SKILL.md`, where it is read before the
  mistake: each a fact that defies a reasonable assumption.
- Put what matters most first: after compaction, Claude Code keeps only
  a skill's first 5,000 tokens.
- One term per concept, forward slashes in paths, `Server:tool` for MCP
  tools, and no dates that will go stale.

**Progressive disclosure.** `SKILL.md` stays under 500 lines and about
5,000 tokens. Detail moves to `references/`, each file linked from
`SKILL.md` itself with when to read it ("read X if the build fails"),
never only from another reference, and given a contents list past 100
lines. Templates and data go in `assets/`.

**Scripts over specification.** When the agent would derive, copy or
validate structured data by hand, or rewrite the same code each run,
write a script and let the text say when to run it. A rule a script
checks is one the agent need not hold in mind. Make it safe for an
agent to drive: no prompts, `--help` with examples, data on stdout and
diagnostics on stderr, errors that say what to try, distinct exit
codes, `--dry-run` for anything it changes, bounded output, and no
dependency the skill does not state. A script that ends by printing the
next command saves the agent recalling it.

## 4. Check it

```sh
node scripts/check-skill.mjs --target portable <skill-dir>
```

It checks everything above that a machine can, reading the frontmatter
as YAML: the specification's fields, types and limits, the description's
person and trigger, body size, links that break or leave the skill,
nested or unlinked references, and scripts an agent cannot run. The
target sets what is an error: `portable` refuses whatever claude.ai or
the Claude API would, for a skill meant for every client;
`claude-code` allows that client's own keys, for a skill meant for it
alone; `any`, the default, suits a mixed collection. Fix every error;
weigh each warning, as a skill may break a practice on purpose.
`--run-help` also runs each script's `--help`, `--json` suits other
tools, and the repository's own linters and tests still apply.

## 5. Evaluate it

Measure the skill against its baseline, in fresh contexts, on every
model that will run it: a small model shows what is missing, a large
one what is over-explained, and another vendor's what only one model
family understood.

- **Output:** realistic prompts, each run with the skill and without
  it (or with its previous version); assertions written after the first
  run, graded with quoted evidence.
- **Triggering:** about 20 queries, half that should load the skill and
  half near-misses that should not, each run 3 times, tuned on 60% and
  judged on the rest.
- **Transcripts, not just outputs:** wasted steps point at vague,
  irrelevant or menu-like instructions.

[Evaluating](references/evaluating.md) has the file formats, the loop
and when to stop. Keep evaluation files out of the published skill.

## 6. Review it

Have a different agent review it, ideally another vendor's model, from
a written brief: [`assets/review-brief.md`](assets/review-brief.md).
Validate each finding by reproducing it before acting, discuss the
reasoning behind a disagreement with the reviewer before changing
anything, and record what was decided. [Reviewing](references/reviewing.md)
has the checklist and the protocol between agents.

## 7. Release it

Version by what changes for the skill's users. A corrected instruction
is a fix, new guidance a feature, removed or changed behaviour a
breaking change: a `SKILL.md` is code, not documentation. Stay below
`1.0.0` until evaluations show the skill is stable, publish from CI
rather than by hand, and check the exact version that landed.
[Releasing](references/releasing.md) covers commits, versions,
lockfiles and the first publish.

## Gotchas

- Frontmatter must open on the file's first line. Claude Code loads a
  skill whose frontmatter does not parse with empty metadata: it still
  runs as `/name`, but never loads on its own.
- In `metadata`, `version: 1.0` is a number, which the specification
  rejects; quote it.
- `<` and `>` in a description show as `&lt;` and `&gt;` in Claude
  Code; write `[placeholder]`.
- An edit can be live and still not in effect: clients pick up changed
  skill files, but a skill already invoked stays in the conversation as
  it was rendered until invoked again. Evaluate in a fresh session
  anyway, as the one that wrote the skill has read it.
- A one-step task may trigger no skill however apt the description, as
  the agent can do it alone. Trigger tests need tasks that need the
  skill.
- Editing a description until it matches each failed query overfits it:
  name the category those queries share instead.
- One skill, one editable directory: for several clients, link it into
  each or use their installers, never hand-kept copies, which drift.
- Packaging that ships the skill's directory ships everything in it,
  evaluation workspaces included.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
