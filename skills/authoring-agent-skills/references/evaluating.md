<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/authoring-agent-skills/references/evaluating.md
   -
   -->

# Evaluating a skill

Two questions, tested apart: does the skill load when it should, and
does the work improve when it does? Both compare against a baseline,
both run in fresh contexts, and both are repeated on each model the
skill will meet. Where Anthropic's `skill-creator` is installed, it runs
these loops for you; this is the method it implements.

## Contents

- Where the files live
- Output evaluations
- Trigger evaluations
- Models
- When to stop

## Where the files live

Keep evaluations beside the skill, not in it, when anything packages or
installs the skill's directory whole:

```text
<skill>/                 the skill, as shipped
<skill>-workspace/
  evals.json             the cases, authored by hand
  trigger-queries.json   the trigger set, split train and validation
  iteration-<n>/
    <case>/with_skill/   outputs/, timing.json, grading.json
    <case>/without_skill/
    benchmark.json
    feedback.json
```

agentskills.io keeps `evals/evals.json` inside the skill; that suits a
skill nobody packages. Either way, snapshot the previous version before
editing (`cp -r <skill> <workspace>/skill-snapshot/`) to compare
against.

## Output evaluations

1. **Cases.** Start with 2 or 3 realistic prompts, written as a person
   would type them, with paths, names and some mess, plus the input
   files and a sentence on what success looks like. Vary phrasing and
   detail, and include an edge: ambiguous instructions, malformed
   input, an unusual request.

   ```json
   {
     "skill_name": "<name>",
     "evals": [
       {
         "id": 1,
         "prompt": "<what a person would type>",
         "expected_output": "<what success looks like>",
         "files": ["<input file>"],
         "assertions": []
       }
     ]
   }
   ```

2. **Runs.** Each case twice: with the skill, and without it (or with
   the snapshot). Each run starts clean: a subagent, `claude -p`, or
   `codex exec`, never the session that wrote the skill, which has read
   it already. Record each run's tokens and duration as it ends; some
   clients report them only then.
3. **Assertions,** written after the first run, once you have seen what
   good looks like: specific and checkable ("the output is valid JSON",
   "the chart labels both axes"), neither vague ("is good") nor brittle
   (an exact phrase). Check mechanical ones with a script.
4. **Grading.** PASS needs quoted evidence from the output; a heading
   with no substance under it fails. Note assertions that always pass or
   always fail: they measure nothing.
5. **Benchmark.** Pass rate, time and tokens for each configuration, and
   the difference: what the skill buys, and what it costs.
6. **Read the transcripts.** Steps the agent wasted point at vague
   instructions, ones that did not apply, or options without a default.
   The same helper written in every run belongs in `scripts/`.
7. **Human review.** A person reads the outputs beside their grades and
   writes specific, actionable feedback per case; empty means fine.
8. **Revise,** from failed assertions, feedback and transcripts
   together: generalise rather than patch each case, cut instructions
   that cost more than they return, and explain why rather than adding
   another MUST. Rerun everything as the next iteration.

## Trigger evaluations

1. **Queries.** About 20: 8 to 10 that should load the skill, varied in
   phrasing, explicitness, detail and complexity, the best being those
   whose link to the skill is not obvious; and 8 to 10 near-misses that
   share its words but need something else. Easy negatives such as
   "write a fibonacci function" test nothing.
2. **Split** them, shuffled, about 60% to tune on and 40% to judge by,
   with positives and negatives in both, fixed across iterations.
3. **Run** each query 3 times, as triggering varies, and count a run as
   a trigger when the agent loaded the skill: a `Skill` tool call
   naming it, or a read of its `SKILL.md`, in the run's JSON output. A
   should-trigger query passes above a rate of 0.5, a should-not below.
4. **Revise** the description from the tuning set's failures alone:
   broaden it for misses, sharpen its boundary for false triggers, and
   name the category behind failed queries rather than their words.
   After several stalled rounds, try a different structure. Stay under
   1,024 characters.
5. **Choose** the iteration with the best judging-set rate, which may
   not be the last; about five iterations is usually enough. Confirm
   with 5 to 10 fresh queries.

## Models

Run both evaluations on each model the skill will meet. A small model
shows what the skill leaves out; a large one, what it over-explains;
another vendor's, what only one model family understood. A skill for
several clients runs in each, as each lists and loads skills
differently.

## When to stop

When feedback comes back empty, the benchmark stops moving, or the
skill's remaining failures are ones the model makes without it too.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
