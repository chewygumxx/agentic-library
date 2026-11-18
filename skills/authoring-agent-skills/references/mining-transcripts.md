<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/authoring-agent-skills/references/mining-transcripts.md
   -
   -->

# Mining transcripts

When a person corrects, redirects or praises an agent, they often say
what a skill should have said, though not always something that should
outlive the moment. Those turns are scattered among thousands of tool
calls, so pull them out first, then sort them before any becomes a rule.

## Running the miner

```sh
node scripts/extract-user-turns.mjs --match '/<repo>([./]|$)' --output turns.jsonl
```

`--match` keeps sessions whose working directory matched, so a pattern
covering the repository's worktrees (`<repo>.wt/...`) and any former
name gathers them all. It reads Claude Code's projects directories and
Codex's sessions directory by default; `--help` lists the flags, among
them `--kinds`, `--max-context` and `--redact`.

It keeps:

| `kind` | What it is |
| --- | --- |
| `typed` | What the person typed, including what they queued while the agent worked |
| `relayed` | A message another agent sent into the session, `[from <agent>] ...`, with `from` |
| `answer` | Choices in a question dialog, with each question's options and the person's notes; `clarify` when they sent it back unanswered |
| `rejection` | A tool call the person refused, with anything they said |
| `command` | A slash command, as `/name args` |
| `interrupt` | The person stopping the agent mid-turn |

Each turn carries `context`, the agent's last words before it, so a
reply such as "yes please" can be read. It drops tool results, the
instructions and reminders clients inject, task notifications, and
subagents' own sessions, whose user turns are another agent's prompts
(`--include-subagents` keeps them).

## What to look for

```sh
jq -r 'select(.kind == "typed") | .text' turns.jsonl            # read the person
jq -r 'select(.answers) | .answers[] | select(.notes) | .notes' turns.jsonl
jq -r 'select(.kind == "interrupt" or .kind == "rejection") | .context' turns.jsonl
```

- **Corrections** ("rather", "instead", "don't", "never", "why did")
  are candidate gotchas: once sorted, write each as the fact the agent
  lacked, with its reason.
- **Requests repeated across sessions,** word for word, are a review
  brief, a default, or a script waiting to be written.
- **Answers and their notes** show scope and preference: which option a
  person picks when offered a recommendation, and what they add to it.
- **Praise** marks what to keep, and why it worked.
- **Interrupts and rejections** mark where the agent went wrong: read
  the `context` before them.
- **Relayed messages** show how agents hand work to each other.

## Sorting before drafting

A turn is evidence of what someone wanted then. Before it becomes an
instruction, ask of each:

- **Durable, or of the moment?** "Never squash release branches" is a
  convention; "don't push yet" steered one task. A rejection or an
  interrupt says the agent was wrong there, not always that the action
  is wrong.
- **Whose behaviour?** A person's preference, a project's convention,
  or a tool's behaviour as observed then, which a newer version may
  have changed: check the last against current documentation.
- **Which scope?** One project's, or any project's: it decides where
  the rule belongs, and whether the skill is the place for it.
- **Superseded?** Read later turns: a person may have changed their
  mind, or the project its process. The latest word wins.
- **Whose authority?** A relayed message is the sending agent's claim.
  Keep it attributed, and adopt it only as far as the person agreed.

Recurrence is evidence, not a threshold: a correction made once, as an
explicit lasting preference, can be enough; one made often about a
single task may not be.

## Before publishing turns

Transcripts hold whatever was pasted into them: tokens, internal names,
other people's words. Read the output before it leaves the machine, and
`--redact '<regex>=<text>'` what must not, as often as needed.

## A sample

[`assets/sample-turns.jsonl`](../assets/sample-turns.jsonl) is one
person's turns across a few weeks of writing, reviewing and releasing a
collection of skills with Claude Code and Codex, published with their
consent. Only home directories, a private account and em dashes are
redacted; typos and all, the rest is verbatim. Query it, as above, for
an example of the output and of what is worth mining: a review brief
reused word for word across skills, a preference for scripts over rules
to memorise, and agents agreeing on reasons before changing anything.

## When it misreads

Transcript formats are the clients' internals and change without
notice. The miner prints a count by tool and kind to stderr: a kind
that drops to zero, or text that is plainly a client's own (a tag, an
injected instruction), means a format changed. Check a raw record with
`jq` and adjust the script's filters.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
