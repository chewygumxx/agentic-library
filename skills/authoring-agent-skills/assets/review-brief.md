<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/authoring-agent-skills/assets/review-brief.md
   -
   -->

<!--
   - A brief for an agent reviewing a skill. Fill each <...>, delete what
   - does not apply, save it where the reviewer can read it, and send the
   - path. Read-only until the findings are agreed.
   -->

# Review `<skill>`

Review the skill at `<path to the skill>`, at commit `<hash>`, as an
agent that will use it and has never seen it. Change nothing: report.

It is meant to `<what it does, in a line>`, for `<clients>`, and covers
`<upstream tool, version>`, documented at `<URLs>`.

Judge it on:

1. **Triggering.** Would its description load it for `<two or three
   realistic requests>`, and not for `<two near-misses>`?
2. **Accuracy.** Check each claim about a tool, flag, limit or version
   against the documentation above, or by running it. Quote what
   disagrees.
3. **Coverage.** What the documentation offers that a user of the skill
   will need and it omits; the typical footguns and common errors an
   agent makes with the tool, and whether the skill forestalls them.
4. **Progressive disclosure.** Does `SKILL.md` hold what every use
   needs, and does each reference say when to read it? Could anything
   move out, or must anything move in, without harm to the outcome?
5. **Scripts over specification.** Where does it ask the agent to
   derive, copy or validate data by rule that a script should do? Where
   does it state a rule without the reason a model needs to apply it?
6. **Self-containment.** Anything that leans on the repository it was
   written in.
7. **Conformity.** Run `node <path to check-skill.mjs> <path to the
   skill>`, and compare against the Agent Skills specification and
   Anthropic's skill authoring best practices.

`<anything else: a past finding to recheck, a section in doubt>`

Report each finding with its file and line, the evidence, why it
matters, its severity (wrong, missing, costly, cosmetic) and a proposed
fix. Say which were checked by running something. Reply `<where>`.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
