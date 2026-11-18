<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/publishing-skills-to-npm/references/packaging.md
   -
   -->

# Packaging a skill

What a consumer's sync looks for, the manifest that meets it, and the
guards that keep the manifest true to the skill.

## What sync finds

`skills experimental_sync` reads the dependencies a project declares, in
`dependencies`, `devDependencies`, `optionalDependencies` and
`peerDependencies`. In each installed package it takes a `SKILL.md` at
the package's root; failing that, every `skills/<name>/SKILL.md` and
`dist/skills/<name>/SKILL.md`. A package per skill, `SKILL.md` at its
root, is the simplest that fits.

- The skill is installed under its frontmatter `name`, not the package's
  name: `@<scope>/skill-mapping-tests` links as
  `.agents/skills/mapping-tests`, then `.claude/skills/mapping-tests` and
  any other agent's directory chosen with `--agent`.
- The link is to the package's whole directory, so `package.json` and
  `LICENSE` sit beside `SKILL.md` there. Agents read neither.
- Two packages at the same depth shipping one name install neither; a
  direct dependency beats a transitive one.

A consumer's `package.json`:

```json
{
  "scripts": {
    "prepare": "skills experimental_sync --agent claude-code codex --yes"
  },
  "devDependencies": {
    "@<scope>/skill-<skill>": "^0.1.0",
    "skills": "^1.7.6"
  }
}
```

## Names first

Every rename is cheap until the first publish and permanent after it, so
settle these together:

- The directory, the frontmatter `name` and the package suffix match:
  `skills/mapping-tests`, `name: mapping-tests`,
  `@<scope>/skill-mapping-tests`. The `skill-` prefix keeps a scope's
  skills apart from its other packages.
- A gerund names the activity, `mapping-tests`, not a bare noun,
  `worktrees`, which says nothing of what the skill does.
- The `description` says what the skill does, then when to use it:
  `<Does this>. Use when <...>.` The package repeats it.
- A skill's runtime names, such as a state directory, unit prefix or
  environment variable, follow a rename too, or later readers chase the
  old name.

## The manifest

Copy [`assets/skill-package.json`](../assets/skill-package.json) to
`skills/<skill>/package.json` and replace each `<...>`:

- `version` starts at `0.0.1`. Stay below `1.0.0` until the skill is
  proven; release-please then bumps the minor for a breaking change and
  the patch for anything else.
- `description` and `license` repeat the frontmatter's.
- `repository.directory` is `skills/<skill>`, and `homepage` the skill's
  `SKILL.md` on GitHub, as the package has no README.
- `files` lists every entry beside the manifest, `SKILL.md`,
  `references`, `scripts` and `assets` as present. npm adds
  `package.json` and `LICENSE` itself.
- npm ships a `LICENSE` only from the package's own directory, so
  `prepack` copies the repository's in and `postpack` removes it; ignore
  `skills/*/LICENSE` in git.
- `publishConfig` is `{"access": "public", "provenance": true}`: a
  scoped package is private by default, and provenance is asked for on
  every publish.
- A skill not yet to publish is `"private": true`, with no
  `publishConfig`, and stays out of release-please's files.

npm keeps each file's executable bit, so a skill's scripts stay runnable.
`npm pack --workspace skills/<skill> --dry-run` lists what would ship.

## The repository

- The root `package.json` declares `"workspaces": ["skills/*"]`.
- List each skill's package in the root's `devDependencies` as
  `workspace:*`, and the repository's own `prepare` sync links them as a
  consumer's would, so agents working there use them as written.
- `skills-lock.json` records each synced skill's version and a hash that
  covers its `package.json`, so a version bump changes it: commit it with
  the bump.
- knip, with workspaces, wants the root's entries under
  `workspaces["."]`.

## Guards

- publint packs each skill as npm would and warns of what a consumer
  would trip on: `publint --level warning skills/<skill>/` for each.
- sort-package-json keeps every manifest in one key order.
- A test, per skill, that its package is named `@<scope>/skill-<skill>`;
  repeats its frontmatter's `description` and `license`; points
  `repository.directory` at itself; lists every entry beside it in
  `files`; copies in its licence to pack; is public with provenance
  unless private; is a `workspace:*` devDependency of the root; and,
  unless private, is a release-please package at its own version. The
  frontmatter and the manifest drift apart silently otherwise.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
