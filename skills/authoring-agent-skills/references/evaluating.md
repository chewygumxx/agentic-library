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
   it already, and isolated, as below. Record each run's tokens and
   duration as it ends; some clients report them only then.
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

A run that sees more, or less, than intended measures nothing. For each:

1. **A scratch workspace:** a new directory holding the case's input
   files, with `git init` and a first commit, so `git status` shows
   afterwards what the run changed.
2. **The candidate in one arm only:** copy it to where each client
   finds a project skill, `.claude/skills/<name>/` and
   `.agents/skills/<name>/` in the with-skill workspace. The baseline's
   workspace has neither.
3. **A candidate-free baseline:** check that no directory a client loads
   skills from holds a copy or link of it, the user's included
   (`~/.claude/skills`, `$CLAUDE_CONFIG_DIR/skills`, `~/.agents/skills`,
   `$CODEX_HOME/skills`), following links to their targets. Mark a
   baseline whose transcript names the candidate as contaminated.
4. **A jail.** A run sees and changes more than its workspace. Asked to
   make a skill, an agent may install it where the person's own clients
   look, so the next baseline finds it; a baseline may list its way up
   to the other arm's workspace, or find the skill in its repository,
   a backup, or past transcripts. So run each client in an empty home,
   binding back only what it needs: its binaries and configuration
   read-only, its state and the caches writable, the person's own
   skills read-only (a baseline keeps what a person has), and the run's
   own directory. Hide the clients' past transcripts too. With
   bubblewrap, binding each skills directory by its real path, as it
   cannot mount onto a link:

   ```sh
   codex_home=${CODEX_HOME:-$HOME/.codex}
   claude_home=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
   codex_skills=$(realpath "$codex_home/skills")
   claude_skills=$(realpath "$claude_home/skills")
   bwrap --dev-bind / / --tmpfs "$HOME" \
       --ro-bind "$HOME/.local/bin" "$HOME/.local/bin" \
       --ro-bind "$HOME/.config" "$HOME/.config" \
       --bind "$codex_home" "$codex_home" \
       --bind "$claude_home" "$claude_home" \
       --bind "$HOME/.cache" "$HOME/.cache" \
       --tmpfs "$codex_home/sessions" --tmpfs "$claude_home/projects" \
       --ro-bind "$codex_skills" "$codex_skills" \
       --ro-bind "$claude_skills" "$claude_skills" \
       --bind "$run" "$run" \
       --chdir "$run/workspace" -- <client command>
   ```

   Bind back whatever else the clients run from or write, such as a
   version manager's installs or `~/.claude.json`, and each other skills
   directory that exists. Keep each run's directory away from the other
   arm's, or bind only its own. Where bubblewrap is missing, a
   throwaway user or container does the same.
5. **Launch it unattended,** its events as JSON, with any terminal
   multiplexer's variables unset so the client's hooks do not report
   into your own session. Skipping approvals is safe only in the jail.
   - Claude Code: `claude -p "$prompt" --model <model> --effort <effort>
     --output-format stream-json --verbose --dangerously-skip-permissions`.
     The last `result` event holds `usage`, `total_cost_usd`,
     `num_turns` and the final text; a `Skill` tool call naming the
     candidate shows it loaded.
   - Codex: `codex exec --json -m <model> -c model_reasoning_effort=<effort>
     --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check
     --ephemeral -C "$run/workspace" "$prompt"`. `turn.completed` events
     hold `usage`; a command reading `<name>/SKILL.md` shows it loaded.
     `--ephemeral` keeps the run out of the person's session history.
     Give it `< /dev/null`: with stdin open and no terminal, it waits on
     stdin and never starts.

   A usage limit ends a run early, and Claude Code reports it as an
   error result whose text is the notice (`api_error`
   `usage_limit_reached`), not as a missing answer: mark such a run
   `limited`, and rerun it after the reset.
6. **A record per run,** `result.json` beside its transcript and
   `git status`: client, model, effort, case, arm, a status (`ok`,
   `failed`, `limited` by a usage limit, `contaminated`), duration,
   tokens, whether it loaded the candidate, and each skill it wrote with
   the checker's verdict. Rerun what a limit stopped; keep invalid runs
   apart, with the reason.

## Grading blind

A grader who knows which arm an output came from grades the arm. Copy
each run's output to a directory named by a random id, and keep the map
from ids to runs away from the graders. Keep each skill's own directory
name in the copy, as a renamed one fails the name check, and replace
the run's path in its final message, as clients link to files by their
absolute path, which names the arm. Take
mechanical assertions, such as the checker's, from each run's own
workspace. One grader per case, given the case's input files and
assertions, writes for each output:

```json
{
  "assertion_results": [
    { "text": "<assertion>", "passed": true, "evidence": "<file: quoted text>" }
  ],
  "summary": { "passed": 0, "failed": 0, "total": 0, "pass_rate": 0.0 }
}
```

Unblind only to aggregate: by model and arm, and by case and assertion,
as an overall rate hides which assertion carries the difference.

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
