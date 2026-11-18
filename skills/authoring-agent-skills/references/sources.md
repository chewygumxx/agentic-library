<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/authoring-agent-skills/references/sources.md
   -
   -->

# Sources

Fetch these rather than trusting a summary, this one included: clients
and their limits change faster than any skill that describes them.

## In order of authority

1. **[Agent Skills specification](https://agentskills.io/specification)**
   settles the format: the directory, each frontmatter field and its
   limits, optional directories, progressive disclosure's budgets, and
   one-level file references. Its rules are hard: a client may reject a
   skill that breaks one. `skills-ref validate` is its reference
   validator.
2. **Each client's documentation** settles that client: where it looks
   for skills, the fields it adds, how it lists and invokes them, and its
   own limits. [Claude Code](https://code.claude.com/docs/en/skills),
   [Codex](https://developers.openai.com/codex/skills) and [Anthropic's
   overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview),
   for claude.ai and the Claude API. A client's rule binds only skills
   meant for it.
3. **[Anthropic's skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)**
   settles how to write one: conciseness, degrees of freedom, naming,
   descriptions, progressive disclosure, workflows and feedback loops,
   evaluation first, scripts, and a closing checklist. Its frontmatter
   limits for Anthropic's products are hard rules there.
4. **agentskills.io's guides**, which extend the specification:
   [best practices](https://agentskills.io/skill-creation/best-practices),
   [optimizing descriptions](https://agentskills.io/skill-creation/optimizing-descriptions),
   [evaluating skills](https://agentskills.io/skill-creation/evaluating-skills)
   and [using scripts](https://agentskills.io/skill-creation/using-scripts).
   They settle evaluation's file formats and loops, and scripts'
   interfaces.
5. **[`skill-creator`](https://github.com/anthropics/skills/tree/main/skills/skill-creator)**,
   Anthropic's skill for writing skills, automates the evaluation loops
   of 4: isolated runs, grading, benchmarks, blind comparison and
   description tuning, with a review viewer. Use it where installed; it
   implements the method, it does not add rules.
6. **[Skill Seekers' AI skill standards](https://skillseekersweb.com/docs/reference/ai-skill-standards)**
   offers a weighted grading rubric, a list of common pitfalls, and notes
   for non-Claude platforms. Useful as a second opinion and a scoring
   aid; where it disagrees with 1 to 4, they win.

## Where they disagree

| Question | Resolution |
| --- | --- |
| `version`, `platforms`, `tags` as top-level keys (Skill Seekers) | Under `metadata`, as strings: claude.ai and the Claude API reject other top-level keys |
| A separate `skill.yaml` (Skill Seekers) | Leave it out: no client reads it |
| A "When to use this skill" section in the body (Skill Seekers) | Leave it out: the body loads only after the description has decided |
| Emoji in section headings (Skill Seekers, for Claude) | Plain headings: no other source asks for them, and they cost tokens |
| A fixed section order and 5 to 10 examples (Skill Seekers) | Moderate detail (agentskills.io): examples where the output's quality depends on them |
| Third person, "Processes ..." (Anthropic) or imperative, "Use this skill when ..." (agentskills.io) | Both: what it does in the third person, then a `Use when` sentence |
| Gerund names: "consider" (Anthropic), required (Skill Seekers), unmentioned (specification) | A convention to follow unless a collection already uses another |
| Hard description limit | 1,024 characters everywhere; Claude Code also cuts its listing at 1,536 with `when_to_use` |

## What none of them settles

Whether a skill helps. Only evaluation shows that, on the models that
will run it.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
