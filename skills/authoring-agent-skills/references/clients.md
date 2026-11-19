<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/authoring-agent-skills/references/clients.md
   -
   -->

# Clients

What each client adds to the specification. Read the part for each
client a skill must run in; check its documentation for anything that
matters, as these move.

## Contents

- Claude Code
- claude.ai and the Claude API
- Codex
- Installing across clients

## Claude Code

- **Where:** `~/.claude/skills/<name>/` for a person, `.claude/skills/`
  in a project (and in its parents up to the repository root, and in
  subdirectories once a file there is touched), and `<plugin>/skills/`.
  A name clash goes to the personal skill over the project's.
- **Its own fields,** beside the specification's: `when_to_use`,
  `argument-hint`, `arguments`, `disable-model-invocation` (only `/name`
  runs it, and its description leaves the listing),
  `user-invocable: false` (only the model runs it), `allowed-tools`,
  `disallowed-tools`, `model`, `effort`, `context: fork` with `agent`
  and `background` (runs it in a subagent, without the conversation),
  `hooks`, `paths` (globs limiting when it loads) and `shell`. Unknown
  keys are ignored without error.
- **Substitutions in the body:** `$ARGUMENTS`, `$0`, `$name`,
  `${CLAUDE_SKILL_DIR}` (the skill's directory, for script paths that
  work wherever it is installed), `${CLAUDE_SESSION_ID}`,
  `${CLAUDE_PROJECT_DIR}`. A line `` !`command` `` runs before the model
  sees the skill and is replaced by its output; a failing command aborts
  the skill.
- **Edits:** files under a skills directory are picked up without a
  restart, though a new top-level skills directory needs
  `/reload-skills`. A skill already invoked stays in the conversation as
  rendered, and is not re-read: invoke it again to load an edit.
- **Limits:** the listing's budget is about 1% of the context window,
  and descriptions of the least used skills drop first when it
  overflows; `description` with `when_to_use` is cut at 1,536
  characters. After compaction, each re-attached skill keeps its first
  5,000 tokens, within 25,000 for all.
- **Debugging:** `claude plugin validate <dir>` finds frontmatter that
  does not parse; `--debug` shows the parse error and listing
  overflow; `/doctor` estimates the listing's cost. A rule that must
  hold every time belongs in a hook, not in prose.

## claude.ai and the Claude API

Uploads accept only `name`, `description`, `license`, `compatibility`,
`metadata` and `allowed-tools`: any other key is an error, so a skill
for these cannot carry Claude Code's fields. Names cannot hold
`anthropic` or `claude`, and neither field may hold an XML tag;
`check-skill.mjs --target portable` refuses all of these. The Claude
API runs skills without network access or package installs, so a
script there may use only what the execution environment provides.

An upload fails on its packaging as often as on its frontmatter:

- **claude.ai** takes a ZIP whose root is the skill's folder, named as
  the skill is, not the files loose at the root. Code execution must be
  on; the skill is then enabled under Customize > Skills, or provisioned
  for a Team or Enterprise organisation. Its help on custom skills gives
  200 characters as the description's limit, against the 1,024 the
  specification and the API give: if an upload refuses a longer one,
  shorten it.
- **The Claude API** takes a ZIP or the files themselves, `SKILL.md` at
  the upload's root or in one enclosing folder, under 30 MB
  uncompressed. `POST /v1/skills` creates a skill; a new version, by
  `POST /v1/skills/<id>/versions`, is a whole snapshot with the same
  `name`, and files left out are gone. A request pins a version or asks
  for `latest`, and takes at most 20 skills. A skill is visible to every
  key in its workspace.

```sh
zip -r <name>.zip <name>/   # from the skill's parent directory
unzip -l <name>.zip         # every path should start <name>/
```

## Codex

- **Where:** `.agents/skills/` in every directory from the working
  directory up to the repository root, `~/.agents/skills/`,
  `/etc/codex/skills/`, and the system skills it bundles. It follows
  symlinks, and lists both skills when two share a name.
- **Its own metadata,** in `agents/openai.yaml` beside `SKILL.md`:
  `interface` (display name, short description, icons, default prompt),
  `policy.allow_implicit_invocation` (false keeps it to explicit use),
  and `dependencies.tools`, such as an MCP server. Other clients ignore
  the file.
- **Invocation:** `$name` or `/skills` explicitly; implicitly when a task
  matches the description.
- **Distribution:** a plugin bundles skills for others to install,
  beside a repository's `.agents/skills/`.
- **Limits:** the initial listing takes at most 2% of the context window,
  or 8,000 characters when the window is unknown; descriptions shorten
  first, then skills drop, with a warning.
- **Edits:** it detects changed skill files on its own; restart if an
  edit does not appear.
- **Disabling:** `[[skills.config]]` entries in `~/.codex/config.toml`
  with `enabled = false`, by `path` or `name`. Restart after changing
  configuration.

## Installing across clients

The [`skills`](https://github.com/vercel-labs/skills) CLI installs a
skill from a repository or package into each client's directory, as
copies or symlinks, and pins what it installed in `skills-lock.json`. A
skill installed this way arrives as its directory alone, which is why a
skill must not lean on anything outside it.

For a skill several clients load, keep one editable source directory
and expose it to each by a symlink or the client's own installer. A
copy a client or a deployment format requires is fine; copies kept by
hand drift apart, the first edit landing in one and not the others.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
