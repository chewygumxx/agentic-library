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
- Running a case in isolation
- Grading blind
- Trigger evaluations
- Models
- Staging the evaluation
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
   input, an unusual request. Test the decisions the skill exists to
   change: a case whose answer sits in its input files measures how well
   a model transcribes, and passes as well without the skill.

   ```json
   {
     "skill_name": "<name>",
     "evals": [
       {
         "id": 1,
         "name": "<its case directory>",
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
   it already, and isolated, as below.
3. **Assertions,** written after the first run, once you have seen what
   good looks like: specific and checkable ("the output is valid JSON",
   "the chart labels both axes"), neither vague ("is good") nor brittle
   (an exact phrase). Check mechanical ones with a script.
4. **Grading.** Blind, as below. PASS needs quoted evidence from the
   output; a heading with no substance under it fails. Note assertions
   that always pass or always fail: they measure nothing.
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

## Running a case in isolation

A run that sees more, or less, than intended measures nothing. Asked to
make a skill, an agent may install it where the person's own clients
look, so the next baseline finds it; a baseline may list its way into
the other arm's workspace, or find the skill in its repository, a
backup, or past transcripts. A model asked to build this isolation from
prose gets it wrong, so run it:

```sh
node scripts/run-eval.mjs --client claude --model <model> --effort <effort> \
    --case <case-dir> --arm with --skill <skill-dir> --out <runs>/<model>/<case>-0/with
```

A case directory holds `prompt.md`, the request as a person would type
it, and `files/`, copied into a fresh workspace with a first commit, so
`git status` shows what the run changed. `--arm with` installs the
skill as a project skill, where Claude Code and Codex both find it;
`--arm without` leaves it out. Run each case in both arms, on each model.

The script runs the client in bubblewrap. Of the host it sees only the
system directories and the tools on `PATH`, read-only; `/tmp`, the
runtime directory and the home are empty; and its own output directory.
So the skill's source, the case and the other runs are out of sight
wherever they lie, and so is the session bus, through which a run could
start a process outside the jail. The network is shared, as the client
needs its API.

Each run gets a fresh profile: a client home empty but for that
client's credentials, read-only, so the person's settings, hooks, MCP
servers, memory files and skills, which differ between machines and may
name the skill, stay out of both arms. The client, and whatever it
runs, can read those credentials, and cannot keep a token it refreshes:
for a long batch, give it a long-lived token in the environment, such
as one from `claude setup-token`, or an API key. `--profile person`
keeps the person's own setup instead, past sessions hidden and skills
read-only, to measure the skill against what they already have. The
skill as installed in the with arm is read-only, so a run cannot change
what it is measured with.

Before running it probes the jail, and refuses (exit 3) if the client
does not start or is not signed in, a skills directory or the installed
skill is writable, the skill's or the case's source or what lies beside
the output is in sight, or, in the without arm, the skill is readable
anywhere a client looks: `--ro` what the client lacks, `--hide` what
the probe names.

Each run's `result.json` records its status: `ok`; `failed`, also when
the client never reported the run's end; `limited` by a usage limit;
`mismatched` if the client reports another model than asked;
`contaminated` if a baseline read or invoked the skill, which a bare
mention of its name is not; or `leaked` if a run installed a skill where
another could find it. It also records the client's version, the model
asked for and the one reported, where the client reports one, tokens,
duration, whether the run read the skill, and each skill it wrote with
the checker's verdict. Only `ok` runs count; rerun `limited` ones after
the reset. `--help` has the rest, and `--probe` checks a jail without
spending a model.

Where bubblewrap is missing, such as on macOS, give each run a
throwaway user or container with the same properties: an empty home
and client profile, the skill's and the case's sources and the other
runs out of reach, and no way to the person's session. Launch Claude
Code as `claude -p --output-format stream-json --verbose`, and Codex as
`codex exec --json --ephemeral < /dev/null`, as the script does.

## Grading blind

A grader who knows which arm an output came from grades the arm:

```sh
node scripts/blind-grades.mjs blind <runs> <blind-dir> --evals evals.json
```

It copies each `ok` run that reported its end to
`<blind-dir>/<case>/<random id>/`, with the run's paths and the skill's
name redacted from every text file, and links leading out of the copy
withheld; lists the runs it left out, and why, in
`<runs>/blind-excluded.json`; and keeps the map from ids to runs out of
the graders' reach. `--evals` freezes each case's assertions, with ids,
in `<blind-dir>/<case>/assertions.json`. An assertion a script can
settle is better settled by it: written as
`{ "text": "...", "check": "check-skill" }`, it takes the checker's
verdict from the run's own record. Give one grader per case the case's
files, its `assertions.json`, and its outputs; for each output it writes
`grading.json`, every assertion once:

```json
{
  "assertion_results": [
    { "id": "A1", "passed": true, "evidence": "<file: quoted text>" }
  ]
}
```

Then `blind-grades.mjs unblind <runs> <blind-dir>` checks each grading,
leaving out and listing any that misses, repeats or adds an id, or lacks
a boolean or evidence; puts each grade back beside its run; and totals
them by arm, by model, by case, and by assertion, as an overall rate
hides which assertion carries the difference.

## Trigger evaluations

1. **Queries.** About 20: 8 to 10 that should load the skill, varied in
   phrasing, explicitness, detail and complexity, the best being those
   whose link to the skill is not obvious; and 8 to 10 near-misses that
   share its words but need something else. Easy negatives such as
   "write a fibonacci function" test nothing.
2. **Split** them, shuffled, about 60% to tune on and 40% to judge by,
   with positives and negatives in both, fixed across iterations.
3. **Run** each query 3 times, isolated as output runs are, as
   triggering varies, and count a run as
   a trigger when the agent loaded the skill: a `Skill` tool call
   naming it, or a read of its `SKILL.md`, in the run's JSON output. A
   should-trigger query passes above a rate of 0.5, a should-not below.
4. **Revise** the description from the tuning set's failures alone:
   broaden it for misses, sharpen its boundary for false triggers, and
   name the category behind failed queries rather than their words.
   After several stalled rounds, try a different structure. Stay under
   1,024 characters.
5. **Choose** the iteration by the tuning set; about five iterations is
   usually enough. Then freeze the description and judge it once on the
   judging set: choosing among iterations by their judging rate spends
   it on tuning. Confirm with 5 to 10 fresh queries.

## Models

Run both evaluations on each model the skill will meet. A small model
shows what the skill leaves out; a large one, what it over-explains;
another vendor's, what only one model family understood. A skill for
several clients runs in each, as each lists and loads skills
differently.

## Staging the evaluation

Spend as confidence grows: cheap, broad runs while the skill still
changes, expensive ones once it holds still. Each stage should be able
to turn up a finding that changes the skill or the decision to ship it;
one that cannot is not worth its runs. Between stages, agree each fix
with a reviewer of another model family, who catches what the author's
family shares.

1. **Rough observation.** After the draft, a review and its fixes: a
   few paired runs on the cheaper models of each client the skill
   targets, to find the obvious defects.
2. **Amendments.** After those are fixed: more runs and more model
   tiers, small, medium and large, of each family.
3. **Data processing.** No runs: cheap models sift the transcripts and
   grades for wasted steps, misreadings and assertions that measure
   nothing; a large model at high effort confirms whatever they flag
   against the original evidence, before anyone changes the skill.
4. **Higher effort.** Agree first what adequate means, then fix, and
   run the decisions still open at higher effort.
5. **Repeat** until adequate, or until progress stalls below it.

For example, for a skill both vendors' clients will load: stage 1, 3
runs each on two smaller models per vendor; stage 2, 7 small, 5 medium
and 3 large; stage 4, as stage 2, small models at their highest effort
and others high. A short or low-stakes skill can merge stages.

- **Scale runs** to how much the results vary and what a wrong call
  costs: repeat a case whose result is mixed and would change the
  decision, not one that is settled.
- **Change cases between stages,** keeping a small common set to
  measure change on. Drop one both arms pass every time: it measures the
  model, not the skill. Add ones testing the decisions the last stage
  found weak. When a change needs attributing, run the previous
  snapshot against the new one on the common set, at the same effort;
  otherwise compare arms within a stage, never one stage's rate with
  another's, as cases, effort, graders and harness all moved.
- **Estimate before starting,** by client, model and effort: the last
  comparable stage's tokens per run, from each `result.json`, times the
  runs planned, grading included, or a short pilot when the effort
  changes. When it does not fit, drop redundant work first, and keep
  both arms on the cases and clients that could change the decision.
- **Keep a trigger holdout.** Tune the description on the tuning
  queries alone; judge it on the judging set once, when it is frozen.
  Picking among revisions by the judging rate spends the holdout.
- **Unfit, not unfinished.** If the remaining failures are steps a
  model keeps getting wrong however the prose puts them, or need live
  access, move those steps into a script, or the whole skill into what
  fits better: an MCP server, an executable, an SDK or a service.

To close, commit a report beside sample data, where a permalink can
cite it: the method; the commit evaluated, the case, assertion and
harness versions, and each client's version, model and effort; results
by stage, arm, model and case; exclusions; each finding and the fix it
led to; the harness's own defects; and the limitations. The sample data
is each stage's assertions and per-run results, cleared for sharing.
Archive the rest whole, every transcript, workspace, grade and excluded
run, in private storage, as transcripts can hold private data, and
record in the report where it is and its checksum.

## When to stop

When feedback comes back empty, the benchmark stops moving, or the
skill's remaining failures are ones the model makes without it too.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
