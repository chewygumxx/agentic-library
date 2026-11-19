---
ctime: 2026-11-19
mtime: 2026-11-19
spdx: GPL-3.0-only
title: authoring-agent-skills evaluation, stages 1 and 2
description: >-
  How the authoring-agent-skills skill was reviewed across model families
  and evaluated against a no-skill baseline on six models, what the runs
  found, what changed because of them, and what the harness got wrong.
tags:
  - skills
  - evaluation
  - report
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/docs/reports/2026-11-19_authoring-agent-skills-evaluation.md
   -
   -->

# authoring-agent-skills evaluation, stages 1 and 2

The skill was written, reviewed by Codex, then run against a baseline
without it, twice, with fixes between. Its own method was the method:
cases first, both arms in fresh isolated contexts, blind grading, and
reasons agreed with a reviewer of another model family before changing
anything. Stage 3, at higher effort, is left for the next version.

The data beside this report, in
[`2026-11-19_authoring-agent-skills-evaluation/`](2026-11-19_authoring-agent-skills-evaluation/):
each stage's assertions (`evals-stage-*.json`) and results
(`stage-*-results.json`: totals by arm, model and case, the assertions
whose rate differs between arms, and a row per run). Every run's
transcript, workspace and grading, with the cases' input files, the
briefs and the agents' reports, is archived whole in the private R2
bucket `agentic-library-evals`, as
`authoring-agent-skills/2026-11-19/evaluation-stages-1-2.tar.zst`
(SHA-256 `2c6367a9cdd9a6f5...`, full sum beside it).

## Method

- **Agents.** Claude Opus 5.5 wrote and coordinated; a long-lived Codex
  agent on gpt-6.2-sol (high) gave counsel; an ephemeral Codex reviewer
  on gpt-6.1-sol (high) reviewed and verified. They talked through herdr,
  with completions also logged to a shared file.
- **Reviews.** Review 1 found 10 problems, four of them reproduced
  defects in the scripts. Its verification of the fixes found five more,
  three of them regressions the fixes had introduced. All 15 were fixed.
- **Cases.** Realistic requests with input files, a person's wording.
  Stage 1: write a skill from a CLI's docs, repair a broken skill, turn
  a person's corrections into a skill. Stage 2 added four meant to test
  the skill's decisions rather than transcription: a 1,900-line
  reference, a ZIP claude.ai refuses, a release in a Changesets
  repository, and designing an evaluation of a skill.
- **Runs.** Each case with the skill installed as a project skill and
  without it, per model, in a scratch git workspace. From stage 2 every
  run was jailed by bubblewrap in an empty home (see Harness, below).
- **Grading.** Blind: outputs copied under random ids, with run paths
  and the skill's name redacted. Graders: Claude Haiku 5.5 and Codex
  gpt-6.1-terra, one per case, each assertion PASS or FAIL with quoted
  evidence; the checker's verdict taken from each run's own workspace.
  Where both graded the same case, they agreed on 167 of 180 assertions.
- **Follow-ups.** Where the skill underperformed, Opus 5.5 and
  gpt-6.2-sol read the runs' transcripts to find out why.

## Results

| Stage | Runs | With skill      | Without         | Tokens, with/without |
| ----- | ---- | --------------- | --------------- | -------------------- |
| 1     | 24   | 141/144 (97.9%) | 130/144 (90.3%) | 300k / 193k          |
| 2     | 60   | 270/284 (95.1%) | 253/284 (89.1%) | 393k / 253k          |

Stage 1 ran claude-haiku-5.5 (high), claude-sonnet-5.5 (medium),
gpt-6.1-terra (high) and gpt-6.2-astra (high); stage 2 added
claude-opus-5.5 (medium) and gpt-6.1-sol (medium). Every with-skill run
loaded the skill; no valid baseline saw it.

Stage 2 by case:

| Case                    | With skill | Without |
| ----------------------- | ---------- | ------- |
| evaluate-a-skill        | 88.9%      | 75.0%   |
| new-skill-from-docs     | 95.5%      | 81.8%   |
| large-docs              | 94.4%      | 88.9%   |
| fix-broken-skill        | 100%       | 96.2%   |
| skill-from-corrections  | 100%       | 96.4%   |
| release-with-changesets | 100%       | 100%    |
| upload-refused          | 90.0%      | 93.3%   |

## What the runs found, and what changed

- **Stage 1 measured format.** Most of its gain was one assertion, a
  description saying what the skill does then when to use it, failed by
  10 of 12 baselines; content assertions passed in both arms. Stage 2's
  harder cases moved the gain to design decisions.
- **Sorting mined turns overcorrected.** With the skill, Sonnet dropped
  "every package stays on 0.x until the API review", given in an
  answer's notes, as a one-off. Notes often state the standing rule
  behind a choice (`8a51132`).
- **Repairs cut a real gotcha,** applying "cut what the agent knows" to
  an existing skill. Repairs now keep what is not wrong (`52441c5`).
- **Copies per client.** An agent copied a skill into both clients'
  directories. One source, linked or installed (`0c7e544`).
- **Isolation was half applied:** two Claude models, having read the
  skill's evaluation recipe, built jails that left a writable client home
  and the filesystem in view, as the recipe's own example did. The
  isolated runner is now bundled as a script (`3b4ea0e`).
- **Upload fixes went unverified:** runs trusted the checker or a ZIP
  integrity test for the rebuilt archive's layout, which neither reads.
  Packaging now ends by listing the rebuilt archive (`713968b`).
- **Splitting by habit.** On the 1,900-line reference, single-file
  skills were right, as the docs repeat one template; some splits hid
  exit codes behind a second read. A test for when to split replaced
  the mechanism alone (`99a0973`).
- **Changesets is at ceiling:** every model, both arms, added a correct
  changeset unaided. The skill adds tokens and nothing else there.
- **Cost:** about 1.3 to 1.6 times the baseline's tokens, Haiku more.

## The harness, and what it got wrong

Each defect was found by a run, and each is now handled by the bundled
`scripts/run-eval.mjs` and `scripts/blind-grades.mjs`, or the reference:

1. **A run installed its skill into the person's real Codex skills**,
   where the next two baselines found it. Runs are now jailed, every
   skills directory read-only.
2. **A baseline listed its way into the other arm's workspace**, and a
   probe later found the skill in Claude Code's file history. The jail
   now gives an empty home, past sessions and backups hidden, and probes
   before running, refusing a baseline that could read the skill.
3. **Claude Code reports a usage limit as an answer**, the notice as its
   text, so nine runs counted as failures. Limits are now detected.
4. **Blinding broke a name check, and leaked the arm:** renamed
   directories, and final messages linking files by paths naming the arm
   and citing the skill by name. Blinding keeps names and redacts both.
5. **`codex exec` waits on an open stdin**, so graders hung for an hour.
6. **Inside a worktree's pre-commit hook**, the new tests' scratch
   repositories committed into the real repository and ran its hook
   again, recursively, until memory ran out, twice. Scratch git now drops
   `GIT_*` and runs no hooks.

Two fixture errors were also caught by runs: pypdf raises on an
encrypted file rather than returning empty pages, and a time zone
example in the CLI docs was wrong.

## Limitations

- Small samples: 3 to 7 runs per model per stage, one per case at most
  for some models; per-model rates are indicative only.
- Graders are models. Their agreement was 92.8% where measured, and two
  assertions proved badly worded after grading (A4, A6), and were
  reworded for later stages.
- Trigger evaluations were not run: these stages measured outputs once
  the skill was loaded, which it always was.
- Stage 3 (higher effort, Opus and Sol at high) is not yet run.
