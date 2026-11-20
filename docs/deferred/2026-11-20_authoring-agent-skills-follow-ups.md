---
ctime: 2026-11-20
mtime: 2026-11-20
spdx: GPL-3.0-only
title: authoring-agent-skills follow-ups after 0.1.0
description: >-
  Every item left open when authoring-agent-skills 0.1.0 was released:
  in the skill's guidance, its bundled evaluation harness, the design of
  its next evaluation, the evaluation's own scripts, the agents'
  coordination tooling, and this repository. A handoff for whoever picks
  the work up next.
tags:
  - skills
  - evaluation
  - deferred
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/docs/deferred/2026-11-20_authoring-agent-skills-follow-ups.md
   -
   -->

# authoring-agent-skills follow-ups after 0.1.0

`@chewygumxx/skill-authoring-agent-skills@0.1.0` was released on
2026-11-20 from pull request #24, after the third stage of its
evaluation, reported in
[`2026-11-20_authoring-agent-skills-stage-3.md`](../reports/2026-11-20_authoring-agent-skills-stage-3.md).
This lists everything that stage and its release left open, from the
report, the reviews of the Codex counsel (archived with the evaluation,
as `reports/counsel-next-*.md`), the run records, and the session that
did the work. Each item says what is open, the evidence, why it matters,
and a next step. None blocks use of 0.1.0.

## Where things are

- **Evaluation archive.** Private R2 bucket `agentic-library-evals`:
  `authoring-agent-skills/2026-11-19/evaluation-stages-1-2.tar.zst` and
  `authoring-agent-skills/2026-11-20/evaluation-stage-3.tar.zst`, each
  with its `.sha256` beside it. Stage 3's holds every retained run, the
  runs set aside, both blind bundles, the frozen snapshots, the
  evaluation's own scripts (section 4) and the agents' reports.
- **Local copies.** Both archives also sit in
  `~/.local/state/coordinating-agents/`, with the unpacked working tree
  under `authoring/` there.
- **Frozen candidate.** Stage 3 evaluated the skill at `8a47e24`. The
  harness fixes after it (`43177fd` to `09faf12`) were checked by tests
  and review, not by those runs.

## 1. The skill's guidance

1. **The description runs past claude.ai's limit.** `check-skill.mjs
   --target portable` warns that the description is 643 characters,
   where claude.ai's help on custom skills gives 200 (the specification
   and the Claude API allow 1,024). Next: test an upload to claude.ai;
   if refused, write a shorter description for that client, and run the
   trigger evaluation (item 3.6) on it before shipping.
2. **Haiku on Claude Code never invoked the skill.** In the trigger
   pilot, claude-haiku-5-5 used Claude Code's Skill tool in no run; its
   two misses (T01, T07) reached the skill's files by exploring the
   workspace, running its checker and reading its evaluation reference,
   without reading its `SKILL.md`. Terra hit all four. Whether the
   description, `claude -p`, or the model causes this is unknown: the
   pilot varied none of them. Next: repeat the queries several times on
   Haiku and Sonnet, with and without `claude -p`, before touching the
   description.
3. **Trigger evaluations have no bundled tooling.** The reference
   describes them, but the scripts support only output evaluations.
   Stage 3 needed its own runner and a strict scorer: a hit is a named
   invocation or a successful read of the skill's own `SKILL.md`, as
   `run-eval.mjs`'s broader `loaded_skill` disagreed with that rule on
   three of sixteen runs. Next: bundle a trigger runner and scorer, or
   a `--trigger` mode in `run-eval.mjs`, with that rule and a time cap.
4. **Multi-tranche grading is manual.** `blind-grades.mjs` keeps one map
   per runs directory, so stage 3 graded its second tranche by
   re-blinding the whole stage and carrying the first tranche's settled
   grades in afterwards, by a script of its own. Second-read overrides
   were edited into `grading.json` by hand, the first call kept under
   `first_read`. Next: support adding runs to a blinded batch, and a
   recorded second read, in the bundled blinder; or describe both in
   `references/evaluating.md`.

## 2. The bundled evaluation harness

1. **A matching line still counts as a read.** `run-eval.mjs` counts a
   successful command as access when its output holds a line of 20 or
   more characters from any of the skill's files, after stripping
   `grep -n` and `cat -n` prefixes. Counsel showed a command that only
   prints such a literal line, naming the skill's path, is counted. Stage
   3 had a person check every unclear access and every baseline flagged
   by a line alone. Next: tie the matched line to the file the command
   names, and report the evidence kind (invocation, structured read,
   shell output) in `result.json`.
2. **Graders cannot see the scripts an output delegates to.** Blinding
   leaves the installed skill out of each copy, so an output built on
   `run-eval.mjs` lost the very runner its containment rests on; two
   first grades were overturned on a second read. `55f000c` added the
   guidance; the blinder has no option for it. Next: an option to put
   the frozen snapshot's scripts beside each bundle, the report saying
   it discloses the arm.
3. **`<redacted>` marks hint at the arm.** Outputs that named the skill,
   nearly always with-arm ones, carry the mark. Next: a neutral
   placeholder in both arms, or redaction of other likely tells.
4. **Credentials are read-only, so a refreshed token is lost.** Each run
   gets only its client's credentials, read-only. A run whose token
   expires mid-run refreshes it in memory; where the provider rotates
   refresh tokens, that may invalidate the person's own copy. Next: a
   preflight that refuses, or warns, when the token expires within the
   run's timeout; the reference already recommends a long-lived token in
   the environment for long batches.
5. **The network is shared.** Runs reach their APIs, and could reach the
   host's network services, such as anything on `localhost`. This is
   stated in `--help` and the reference. Next: only if a skill under
   test talks to local services, a network namespace with an allowlist.
6. **Codex's model and effort are unobserved.** `codex exec --json`
   names no model, so `model_check` stays `unobserved` for every Codex
   run; a silent fallback would go unnoticed. Next: read the effective
   model from another source at preflight, if Codex exposes one.
7. **No isolation without bubblewrap.** On macOS, and wherever `bwrap`
   is missing, the reference gives only the properties a throwaway user
   or container must have. Next: a container recipe, or a `--sandbox`
   backend for macOS's `sandbox-exec`, tested.
8. **The probe searches named places only.** It looks for a copy of the
   skill in the skills directories, the client profiles and the
   workspace; tool directories bound in read-only, such as a version
   manager's whole data directory, are visible to a run and not
   searched. Next: search every bound path, or bind less (item 2.9).
9. **The tool binds are a heuristic.** For a `PATH` entry under the
   home's data directory or a dot-directory, the jail binds that tool's
   whole directory and its configuration directory. That may expose more
   than the client needs, or miss what a run's own commands need; the
   preflight checks only that the client starts. Next: preflight the
   commands a case relies on, or list binds per case.
10. **Test files near the size limit.** `check-skill.test.mts` is 19.5
    KiB of the 20 KiB a test file may hold; `blind-grades.test.mts` is
    16.6 KiB. Next: split `check-skill.test.mts` by subject before its
    next addition, as `run-eval`'s were.

## 3. The next evaluation

1. **Upload repair is at ceiling.** Every output in both arms passed
   all five assertions on Haiku and Terra (10/10 against 10/10); it was
   dropped for Opus and Sol. Next: harder variants (a wrongly named
   root folder, extra files a client rejects, a symlink), or drop it.
2. **Large docs is at ceiling.** 22/22 in both arms, yet its grader saw
   real differences in quality, a distilled reference with checklists
   against thin prose, that the assertions miss. Next: assertions for
   the qualities seen, or pairwise preference grading between arms.
3. **The evaluation-setup fixture lacks scripts its skill names.**
   Every output noted that `report-writer`'s `scripts/export.mjs` and
   `scripts/build.mjs` do not exist and wrote stand-ins. Next: add them
   to the fixture, so a with arm can run the skill's steps.
4. **No previous-version arm.** Stage 3 compared the candidate with no
   skill. Next: if a release decision needs attribution, run 0.0.2
   against the candidate on a small common set, at the same effort.
5. **Small samples.** One pair per model and case; Sonnet and Astra
   were deferred; the Changesets case, at ceiling in stage 2, was
   dropped. Next: more repetitions only where a result is mixed and would
   change a decision.
6. **The trigger pilot was single-shot.** Eight queries, once per
   client, on two models, with one description. Next: repeat on fresh
   queries as a holdout, before any change to the description is judged
   by it.
7. **Grader briefs.** One grader reported it could not find the case's
   `assertions.json`, though the brief named it; it graded from the
   brief's list. Next: give the absolute path, and say the list and the
   file are the same.

## 4. The evaluation's own scripts

These live only in the archive and in
`~/.local/state/coordinating-agents/authoring/evals/`, not in this
repository: `run-stage3.mjs` (pairs as units), `run-triggers.mjs`
(trigger pilot), `checks-stage-3.mjs` (upload checks), `replay-stage-3.mjs`
(relabels kept runs), `briefs-stage-3.mjs`, `carry-grades.mjs` and
`sample-stage-3.mjs`.

1. **The upload trace check has known gaps.** Counsel's synthetic cases
   show it should match the listing's own target operand, not the
   whole command; exclude `adding:` build output; and keep extraction
   followed by a listing of the tree manual. Stage 3's verdicts were
   adjudicated by hand where it was unsure.
2. **Arm order alternates per client queue only.** With concurrency,
   and the runs replaced, some pairs ran in the same order.
3. **Reuse.** If a later stage needs them, move them into the skill
   (items 1.3, 1.4) or into this repository, with tests.

## 5. The agents' coordination tooling

1. **A sandboxed Codex cannot send through herdr.** The counsel ran with
   `workspace-write`, network on, and the authoring directory writable;
   `send-prompt.sh` needs `$XDG_RUNTIME_DIR/coordinating-agents/`
   writable for its pane lock, so its messages failed, and it reported
   through files and a completion log instead. Next: document, in
   `coordinating-agents`, adding that directory with `--add-dir`, or the
   file fallback.
2. **Full-access Codex is refused in auto mode.** Claude Code's auto-mode
   classifier refused to launch Codex with
   `--dangerously-bypass-approvals-and-sandbox`. Next: record the
   sandboxed launch that worked in `coordinating-agents`' Codex
   reference.
3. **Claude's budget was unreadable.** The statusline's file
   (`$XDG_RUNTIME_DIR/claude-usage-<account>.json`) was absent all
   session, so no wake-up could be armed from `resets_at`; a five-hour
   limit stopped two jobs, which `job.sh` units recorded and which were
   rerun after the reset. Next: check `statusline.sh` is configured for
   the account in `CLAUDE_CONFIG_DIR`.

## 6. This repository

1. **The uncommitted `distilly` entry.** The person keeps an entry for
   `titanwings/distilly` in their working `skills-lock.json`, never
   committed. A lockfile change on `main` then blocks switching or
   fast-forwarding, and `lint:spell` fails locally on its words. Next:
   decide whether to commit it, or keep it out of tree.
2. **Merge commits add a release-note line.** With merges, not squashes,
   a pull request's conventional title becomes one more `feat` line in
   the skill's notes, as in 0.0.2 and 0.1.0. Next: decide on titles that
   are not conventional commits, if the line is unwanted.
3. **The `feat/agentic-scholar` worktree.** Fully merged, its checkout
   still at `6e689d0`, before the release commits. Next: remove it, or
   fast-forward it, once the `distilly` entry is set aside.
4. **A stale `.git/config.lock`.** Left by the crash of 2026-11-19, it
   blocked every write to the shared git config until removed on
   2026-11-20, with no git process running. Next: after a crash, check
   for `*.lock` under `.git` before anything else.
5. **A near miss in a test.** A test passing `--out /` reached the
   runner's removal of `/` before `04effe1` fixed the check, and stopped
   at its first permission error, deleting nothing. No test passes it
   now. Next: never pass a destructive path to a script under test, even
   to see it refused.
6. **The earlier deferred findings.**
   [`2026-11-19_skill-check-findings.md`](2026-11-19_skill-check-findings.md)
   is still open.
7. **The commit helper is outside the repository.** Skill commits went
   through a local script that resyncs `skills-lock.json` without the
   `distilly` entry, under an 8 GB memory cap. Next: if item 6.1 keeps
   the entry out of tree, consider a supported way to do the same.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
