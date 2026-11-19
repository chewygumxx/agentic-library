---
ctime: 2026-11-20
mtime: 2026-11-20
spdx: GPL-3.0-only
title: authoring-agent-skills evaluation, stage 3
description: >-
  Stage 3 of the authoring-agent-skills evaluation: higher-effort paired
  runs on four models from two vendors, a trigger pilot, and the defects
  in the evaluation harness itself that the stage found and fixed.
tags:
  - skills
  - evaluation
  - report
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/docs/reports/2026-11-20_authoring-agent-skills-stage-3.md
   -
   -->

# authoring-agent-skills evaluation, stage 3

Stage 3 followed [stages 1 and 2](2026-11-19_authoring-agent-skills-evaluation.md),
at higher effort, with the staged method the skill now teaches. Before
spending a model call it reviewed the bundled evaluation harness, and
found that harness weaker than the skill claimed: most of this stage's
changes are fixes to it. Then 16 paired runs on four models, and a
trigger pilot of 16 more.

With the skill, every output passed every assertion: 68 of 68, against
62 of 68 without it. The whole difference is in one case, setting up an
evaluation, where every model given the skill reused its isolated runner
and three of four baselines built launchers that let one run reach
another. The other two cases were at ceiling in both arms.

The data beside this report, in
[`2026-11-20_authoring-agent-skills-stage-3/`](2026-11-20_authoring-agent-skills-stage-3/):
the frozen assertions (`evals-stage-3.json`), the results
(`stage-3-results.json`: totals by arm, model and case, the assertions
whose rate differs, and a row per run with any second-read change), and
the trigger pilot's queries and scores (`triggers-stage-3.json`). Every
run's transcript, workspace and grading, both blind bundles, the runs set
aside, the frozen snapshots, the harness scripts and the agents' reports
are archived whole in the private R2 bucket `agentic-library-evals`, as
`authoring-agent-skills/2026-11-20/evaluation-stage-3.tar.zst`
(SHA-256 `69ec9ad88e92c0d7...`, full sum beside it).

## Method

- **Candidate.** The skill as committed at `8a47e24`, frozen as a
  snapshot under its own name; each with-arm run installed it read-only.
- **Agents.** Claude Opus 5.5 wrote and coordinated; a long-lived Codex
  agent on gpt-6.2-sol (high) gave counsel, reviewed every harness change
  by reproduction before it landed, froze the assertions, and gave the
  disputed grades a second read. They talked through herdr, completions
  also logged to a shared file.
- **Runs.** One pair per model and case, each arm in the bundled jail
  (`run-eval.mjs`): a fresh client profile holding only that client's
  credentials, read-only; the host reduced to its system directories;
  the source skill, the case and every other run out of sight. Arm order
  alternated between pairs.

  | Model                       | Effort | Cases                                         |
  | --------------------------- | ------ | --------------------------------------------- |
  | claude-haiku-5-5            | xhigh  | evaluate-a-skill, upload-refused, large-docs  |
  | gpt-6.1-terra               | xhigh  | evaluate-a-skill, upload-refused, large-docs  |
  | claude-opus-5-5             | high   | evaluate-a-skill                              |
  | gpt-6.1-sol                 | high   | evaluate-a-skill                              |

- **Cases.** Changesets, at ceiling in stage 2, was dropped. Upload
  repair was dropped for Opus and Sol once the first tranche put it at
  ceiling. The large-docs assertions were rewritten so that a compact
  single file earns what well-signposted references do.
- **Admission.** A run counted only if its client reported the run's
  end and, where the client names it, the model asked for. A baseline
  was contaminated only if it read or invoked the skill. All 16 runs were
  admitted; no baseline saw the skill.
- **Grading.** Blind: one Claude Sonnet 5.5 grader per case, every frozen
  assertion graded once with quoted evidence. Two upload assertions were
  settled by script from each run's own artifacts and trace; three of the
  script's four trace verdicts were left to people, and settled from the
  original traces. Disputed calls were read a second time, not blind,
  against the frozen runner and the original traces: 2 of 17 changed,
  both to a pass, each recorded beside the first call.

## Results

| Arm     | Passed       | Tokens per run, mean | Seconds per run, mean |
| ------- | ------------ | -------------------- | --------------------- |
| With    | 68/68 (100%) | 1,415k               | 276                   |
| Without | 62/68 (91%)  | 1,105k               | 276                   |

| Model            | With  | Without |
| ---------------- | ----- | ------- |
| claude-haiku-5-5 | 25/25 | 25/25   |
| gpt-6.1-terra    | 25/25 | 23/25   |
| claude-opus-5-5  | 9/9   | 7/9     |
| gpt-6.1-sol      | 9/9   | 7/9     |

| Case             | With  | Without |
| ---------------- | ----- | ------- |
| evaluate-a-skill | 36/36 | 30/36   |
| large-docs       | 22/22 | 22/22   |
| upload-refused   | 10/10 | 10/10   |

The six assertions the baselines failed are two of evaluate-a-skill's:
that a baseline cannot find the skill (A4), and that no run can write
where a later run or the person's own clients would find a skill (A5),
4/4 with the skill against 1/4 without.

## What the runs found

- **The skill changes how isolation is built.** Given the skill, all
  four models launched the bundled runner and, on three, recorded its
  no-model probe. Without it, Terra reused one Codex home across every
  trial and placed the skill's copies beside the baselines; Opus left the
  shell unrestricted and checked for the skill only after a run; Sol gave
  each job its own home but left the suite readable and a shared `/tmp`
  writable. Haiku's baseline passed by another route: single-turn API
  calls with no tools, which nothing can escape.
- **Upload repair and large docs measure the model.** Every output in
  both arms rebuilt the archive correctly and verified it, or wrote a
  skill meeting all eleven large-docs assertions. The large-docs grader
  found real differences in quality, a distilled reference with
  checklists against thin prose, that the frozen assertions do not
  capture. Both cases need redesigning before they can inform a release.
- **Cost:** about 1.28 times the baseline's recorded tokens, most of them
  cached input, with the same mean runtime.

## Trigger pilot

Eight frozen queries, four that should load the skill and four close
near-misses, each run once per client, with the skill installed. A hit
was a named invocation or a successful read of the skill's own
`SKILL.md`, nothing else.

| Query                                  | Should | Haiku xhigh | Terra xhigh |
| -------------------------------------- | ------ | ----------- | ----------- |
| T01 review a drafted SKILL.md          | yes    | miss        | hit         |
| T02 repair a CLI's flag precedence     | no     | none        | none        |
| T03 turn corrections into instructions | yes    | hit         | hit         |
| T04 an ordinary package's changeset    | no     | none        | none        |
| T05 tune a skill's triggering          | yes    | hit         | hit         |
| T06 a help-centre article              | no     | none        | none        |
| T07 compare a skill against a baseline | yes    | miss        | hit         |
| T08 assess finished reports            | no     | none        | none        |

No false triggers. Haiku never used Claude Code's Skill tool; both its
misses reached the skill's material through the filesystem instead, T01
running its checker and T07 reading its evaluation reference directly,
without loading its instructions. That is substantive use outside the
trigger count. Separately, a negative (T04) printed the skill's package
metadata while exploring the workspace, which the runner's broader access
label counted and the strict rule did not. The pilot did not vary the
description, so it cannot say whether the description caused either
route.

## The harness, and what it got wrong

The bundled runner and blinder, shipped in 0.0.2 and used by readers of
the skill, had defects of their own. Counsel found most by reproduction
before any model ran; the runs found the rest. Each is fixed, with a
test:

1. **The jail began from the whole host, writable** (`54812e1`). Only
   the home was emptied: a run could read and change the skill's source,
   the case and other runs anywhere else, such as `/tmp`, and reach the
   session bus, through which it could start a process outside the jail.
   It also saw the person's settings, hooks, MCP servers and memory
   files, which may name the skill. Now the jail holds the system
   directories and `PATH` read-only, an empty `/tmp`, runtime directory
   and home, a fresh client profile with only that client's credentials,
   read-only, and the run's own output.
2. **`/` passed the path checks** (`04effe1`), including the one
   guarding the emptying of `--out`. A test of this reached the
   runner's removal of `/` before the fix, and was stopped by its first
   permission error, deleting nothing; no test passes `--out /` now.
3. **Admission and grading took too much on trust** (`a3f39fe`,
   `2eb17c6`, `43177fd`, `bfb963e`). A run counted without its client
   reporting its end; a mention of the skill's name counted as
   contamination, and an attempted read, or a command merely printing a
   path, as access; blinding scrubbed only summaries, followed links out
   of the copy, and a grading could escape the frozen rubric.
4. **A snapshot was installed under its directory's name** (`8a47e24`,
   `ec5f992`, `09faf12`), not its frontmatter's, as this stage's own
   first runs showed; the probe, the access checks and blinding then
   looked for the wrong name. The two misnamed runs were set aside, and
   the stage reran them.

The evaluator's own scripts, outside the skill, needed the same care: the
first checks of an archive's layout and of its inspection in a trace each
passed cases counsel built to fail them.

## Limitations

- One pair per model and case: the per-model rates are observations,
  not estimates.
- No matched previous-version arm: the comparison is the candidate
  against no skill.
- The second read was not blind: an output that launches the bundled
  runner names the with arm. Blinding strips the installed skill, so the
  blind graders could not see the runner the with-arm outputs relied on.
- The `<redacted>` marks blinding leaves can hint at the arm.
- The trigger pilot ran each query once, on two models, with one
  description.

## What next

- Redesign upload repair and large docs to separate the arms, or drop
  them.
- When the behaviour graded lives in the skill's own scripts, give the
  graders the frozen scripts too.
- A matched previous-version study, or a repeated fresh trigger holdout,
  only when a release decision needs that evidence.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
