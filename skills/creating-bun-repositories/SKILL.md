---
name: creating-bun-repositories
description: >-
  Creates GitHub repositories for Bun projects with
  @chewygumxx/create-repo, whose templates set them up on mise tasks, hk
  hooks and the shared @chewygumxx configurations, and keeps those
  repositories working. Use when creating a repository with create-repo
  or `bun create @chewygumxx/repo`, choosing between its templates and
  flags, fixing a create-repo repository's failing checks, hooks or first
  CI run, bumping @chewygumxx/hk-config, mise-tasks-config or the Biome
  they pin, or moving an existing repository from husky and long
  package.json scripts to the same mise and hk setup.
compatibility: >-
  Needs Bun 1.4 or later, git with a committer identity, mise 2026.9.0 or
  later, and gh logged in to GitHub.
license: GPL-3.0-only
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/creating-bun-repositories/SKILL.md
   -
   -->

# Creating Bun repositories

`@chewygumxx/create-repo` copies a bundled template, installs it,
rewrites its identity and commits once `mise run check --all` passes
locally; only then does it create the GitHub repository, set the metadata
App's variable and secret, and push. A failure before that leaves nothing
on GitHub. It does not wait for CI: the first run is still to be checked.

## Create one

Run it with every answer as a flag. Without a terminal, as an agent runs
it, a missing name or `--description` is an error, topics, scopes and
features default to none, and `--yes` is required:

```sh
bun create @chewygumxx/repo my-tool \
    --template typescript --with '' \
    --description 'Prints the weather for a city.' \
    --topics cli,weather --scopes 'api,cli:Command Line' \
    --private --yes
```

| Template | For |
| --- | --- |
| `standard` (default) | Any repository: commit rules, lint and format, CI, `AGENTS.md` |
| `typescript` | A Bun library or CLI in TypeScript, run without a build |
| `typescript --with publish` | The same, built to `dist/`, published to npm as `@<owner>/<name>` |
| `cloudflare` | A Worker, tested in the Workers runtime, with a deploy workflow |

- **Always pass `--with`** for `typescript`: `--with ''` for a private
  package, `--with publish` for a published one. At a terminal an empty
  reply to its prompt takes `publish`.
- **`--private` unless asked otherwise.** A published package wants a
  public repository: npm's provenance links to its source.
- **Confirm the name, owner and visibility** with the person before a run
  without `--dry-run`, which creates the repository on GitHub.
- **Inputs it refuses,** so check first: a description on more than one
  line or holding an em dash; a `--dir` that exists or whose path holds
  `[`; an `--owner` spelt otherwise than GitHub spells it, case included;
  for `publish`, an owner or name that is not a lowercase npm name; for
  `cloudflare`, a name that is not a lowercase DNS label of 1 to 63
  characters.
- **`--no-metadata`** sets neither the metadata App's variable nor its
  secret, and switches the new CI's metadata sync off. Without it, the
  client ID comes from `chewygumxx/create-repo`'s variable, and the key
  from the first of `--metadata-key-file` (`-` for stdin),
  `METADATA_APP_PRIVATE_KEY`, `METADATA_APP_PRIVATE_KEY_FILE`, or the
  output of `--metadata-key-command` or `CREATE_REPO_METADATA_KEY_COMMAND`,
  which `~/.config/chewygumxx/create-repo.env` may set. Never print or
  store the key. The sync also needs the metadata App installed on the
  new repository.
- **`--dry-run`** does everything locally and prints the GitHub commands.
  It still reads GitHub when gh is logged in.

**After it finishes,** watch the first CI run it links
(`gh run watch --repo <owner>/<name>`): it is the first test of the
metadata sync and of anything the local check cannot see.

**When it stops part-way,** it says what exists and prints the commands
that remain, with the secret as a placeholder. Check what exists on
GitHub, then run the remaining ones with real, quoted arguments, piping
the key to `gh secret set`. Deleting a half-made repository is the
person's decision.

## What the repository holds

- `.config/mise/config.toml` pins Bun, hk and the linters that are not
  npm packages; its `postinstall` hook runs `bun ci && hk install --mise`
  outside CI. The task files in `.config/mise/tasks/` extend the `cgxx:`
  templates of `@chewygumxx/mise-tasks-config`, linked as
  `.config/mise/conf.d/50-cgxx.toml`.
- `.config/hk.pkl` runs the steps of `@chewygumxx/hk-config`: `mise run
  lint` and `mise run format` are its `check` and `fix` hooks, and its git
  hooks run `mise run check --staged` and commitlint by
  `.commitlintrc.mts`.
- The repository's own spellings go in `.config/cspell.json`'s `words`.
- `package.json` holds no script but `check`, which is
  `mise run check --all`, and lifecycle scripts such as `prepack`.

Work in it with `mise install` once, then `mise run check`, `format`,
`test` and `commit`. With no flag, lint and format select the changed
files, `--staged` the staged and `--all` every file; `check` passes the
flag to lint and runs every test. A change to a path in `CGXX_WIDEN_ON`
(the lockfile, `.config/`, the linters' configurations) widens lint to
every file, or with `--staged` to the whole index. Fix what the hooks
report; never skip them.

## Keep it working

- **Exact pins move together.** `@chewygumxx/hk-config` and
  `@chewygumxx/mise-tasks-config` are below 1.0.0, so every functional
  change is breaking: they and `@biomejs/biome`, which hk-config names
  exactly as a peer, are pinned exactly. The other shared configurations
  take caret ranges.
- **hk's version is named three times** and all must agree: the `hk` pin
  in `.config/mise/config.toml`, the `amends` line of `.config/hk.pkl`,
  and the import inside hk-config's `steps.pkl`. Bump hk only to the
  version the installed hk-config names.
- **A peer major waits for shared-config.** Before taking a Dependabot
  major of a tool hk-config or a shared configuration peers on (Biome,
  secretlint, markdownlint-cli2), read the peer range in
  `node_modules/@chewygumxx/*/package.json`; if it excludes the major,
  ignore the major until a shared-config release widens it.
- **After a tooling change,** run `mise run check --all` twice: the
  second should report each step "passed before, unchanged". Then check
  a fresh clone installed from the lock (`bun install
  --frozen-lockfile`), as CI is.
- **cloudflare:** after changing `wrangler.jsonc`'s bindings or vars, or
  bumping Wrangler, run `mise run types`. `compatibility_date` can be no
  later than the workerd inside `@cloudflare/vitest-plugin` supports, so
  bump them together. Deploys are skipped until both the variable
  `CLOUDFLARE_ACCOUNT_ID` and the secret `CLOUDFLARE_API_TOKEN` are set.
- **typescript with publish** stages a version on a pushed `v<version>`
  tag that matches `package.json`, by npm trusted publishing; the
  maintainer approves it on npmjs.com. A new package's first version is
  published by hand with the maintainer's 2FA and `--provenance=false`;
  only then can its trusted publisher, naming the repository and
  `publish.yaml`, be added.

## Gotchas

- **The first `mise install` warns** that a `cgxx:` template was not
  found: the conf.d link dangles until `bun ci` installs its target,
  which the same `mise install` then does. In CI the hook skips the
  install, and the workflow installs.
- **Pin each linter in `[tools]`, never `lazy`.** hk runs its steps in
  parallel, and a tool installed lazily from inside one has failed CI.
- **A new checkout needs `mise trust`** before mise reads its
  configuration. create-repo trusts the directory it creates; for any
  other, ask the person to run it, as it vouches for the code.
- **A private package has no `packages` step** (publint fails without a
  `version`); a published one builds before it, as its exports are in
  `dist/`.

Read [Troubleshooting](references/troubleshooting.md) when a header
check, hook or CI step fails in a way this does not explain, and
[Adopting the setup](references/adopting.md) to bring an existing
repository to it.
