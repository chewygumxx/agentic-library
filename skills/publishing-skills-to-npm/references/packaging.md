<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/publishing-skills-to-npm/references/packaging.md
   -
   -->

# Packaging a skill

What a consumer's sync does with a package, and why the package the
script writes looks as it does. The script holds the field-by-field
detail; this is the reasoning behind it, for when a case falls outside.

## Two identities

A skill has two names that are easy to conflate. npm knows the package,
`@<scope>/skill-<skill>`, and treats each name and version as permanent.
A consumer's agent knows the skill by its frontmatter `name`, which
`skills experimental_sync` installs it under, sanitised, as
`.agents/skills/<name>`. Keeping the directory, the frontmatter name and
the package's suffix the same makes the two impossible to mix up, which
is why `check` insists on it. The `skill-` prefix is a local choice: it
keeps a scope's skills apart from its other packages.

## What sync does with it

The sync reads the dependencies the project declares, in all four
fields. In each installed package it takes a root `SKILL.md`, failing
that every `skills/<name>/SKILL.md` and `dist/skills/<name>/SKILL.md`;
a package per skill with `SKILL.md` at its root is the simplest that
fits. It links the package's whole directory, records each skill's
version and a hash of its files in `skills-lock.json`, and leaves alone
any link it did not create and any skill installed by `skills add`. When
a migration seems not to take, one of those is usually in the way:
remove it, then sync again. Two packages at the same depth shipping one
name install neither.

In CI the sync runs frozen unless told otherwise: it fails when a
skill's version or hash differs from `skills-lock.json`. Commit the lock
with every change that moves it, including a version bump, and pass
`--no-frozen-lockfile` where CI's job is to update it.

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

Where a production install omits devDependencies, guard `prepare`, as
with `test ! -d node_modules/skills || skills experimental_sync ...`.

## Why the package looks as it does

- **Every entry beside `SKILL.md` ships.** A skill's references,
  scripts and assets are part of it; a file left out of `files` breaks
  the skill silently, wherever it is installed. `check --pack` asks npm
  what it would really pack, which also catches an `.npmignore` or a
  symlink npm skips.
- **The licence is copied in to pack.** npm ships a `LICENSE` only from
  the package's own directory, so a skill sharing the repository's has
  `prepack` copy it in and `postpack` remove it, with
  `skills/*/LICENSE` ignored by git. A skill with its own `LICENSE`
  keeps it and gets no copy: the copy would overwrite it, then delete
  it.
- **Access is public, explicitly.** npm 11 publishes a new scoped
  package publicly by default, but saying so keeps an older npm or a
  changed default from hiding the package.
- **The repository syncs its own skills.** Each package as a root
  devDependency means agents working in the repository use the skills
  as written, through the same path consumers do. Bun, pnpm and Yarn
  link a workspace by `workspace:*`; npm refuses that protocol and links
  by any range the workspace satisfies, so the script writes `*` where
  `package-lock.json` is the lockfile.

## A manifest the script cannot read

The script reads the frontmatter's plain, quoted and block scalars, and
skips a nested mapping such as `metadata`. Anything else, such as a flow
sequence, it refuses rather than guess at, naming the line. Rewrite that
value as a plain or block scalar, or check that field by hand.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
