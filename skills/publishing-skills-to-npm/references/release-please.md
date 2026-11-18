<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/publishing-skills-to-npm/references/release-please.md
   -
   -->

# Releasing with release-please

release-please reads the conventional commits touching each skill's
directory since its last release, keeps one pull request open that bumps
their versions, and once it merges, publishes a GitHub release per
bumped skill.

## The configuration

Copy [`assets/release-please.json`](../assets/release-please.json) to
`.config/release-please.json`, and write the manifest beside it,
`.config/release-please-manifest.json`, mapping each public skill's path
to its `package.json` version:

```json
{
    "skills/<skill>": "0.0.1"
}
```

- Each public skill is a package, `skills/<skill>`, with `component`
  `skill-<skill>`. A private skill is in neither file.
- `include-component-in-tag`, `include-v-in-tag: false` and
  `tag-separator: "@"` make the tag `skill-<skill>@<version>`, which
  `publish.yaml` reads the package and version back out of.
- `bump-minor-pre-major` and `bump-patch-for-minor-pre-major` keep a
  skill below `1.0.0`: a breaking change bumps the minor, a feature or
  fix the patch. That suits `^0.y.z`, which takes patches and refuses
  minors, once `y` is 1 or more.
- `skip-changelog` writes no `CHANGELOG.md` into the skill, where it
  would be linted with the repository's Markdown, shipped in the package
  and linked into every agent's skill directory. The release notes stay
  in the pull request and the GitHub release.
- `bootstrap-sha` is where release-please stops looking while a skill
  has no release: see [bootstrapping](#bootstrapping).
- The JSON indentation of each file it bumps is kept.

Check the file against release-please's schema before committing it:
`https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json`.

## Commit types

| Commit                          | Below 1.0.0 | For                                |
| ------------------------------- | ----------- | ---------------------------------- |
| `feat(skill):`                  | Patch       | New guidance, scripts or behaviour |
| `fix(skill):`                   | Patch       | Wrong guidance corrected           |
| `feat(skill)!:`, `fix(skill)!:` | Minor       | What users rely on, changed        |
| `docs`, `refactor`, others      | None        | What users never see               |

- Type a change by what it does for the skill's users, never by the file
  it edits: a `SKILL.md` is the skill's code, not its documentation.
- A commit is the release note of every skill it touches; keep one
  skill's change to one commit where you can.
- `Release-As: <version>` in a commit's body sets the version, such as a
  first `0.1.0`, but only for a skill the commit's `feat` or `fix`
  already releases. Nothing forces a release without one.

## The workflows

[`release-please.yaml`](../assets/workflows/release-please.yaml) runs on
each push to `main`; [`publish.yaml`](../assets/workflows/publish.yaml)
on each published release.

- **The token.** Both of release-please's jobs act as a GitHub App:
  what `GITHUB_TOKEN` creates starts no other workflow, so its releases
  would never start `publish.yaml`, nor CI its pull request. The App
  needs read and write on contents, pull requests and issues, which
  holds the labels release-please tracks its pull requests by. Keep its
  private key as a secret and its client ID as a variable;
  `actions/create-github-app-token@v3` takes `client-id`, as `app-id` is
  deprecated. With the App, the repository need not let Actions create
  or approve pull requests.
- **The lockfiles.** release-please bumps `package.json` alone. A
  lockfile that records workspace versions, such as `bun.lock` or
  `skills-lock.json`, would then fail CI's frozen install on the release
  pull request, so a second job installs on the release branch and
  pushes what changed, as the App so that CI runs on it.
- **The pull request's title** is its commit's message: `chore: release
  main`, by default, for one pull request across the packages. A
  commit-message linter must accept it.
- **The action's inputs.** With a config file, the tag format and the
  rest come from it; inputs such as `include-component-in-tag` apply
  only with `release-type`, and a log listing it as `false` is harmless.
- **The publish.** `publish.yaml` resolves `skills/<skill>` from the
  tag, refuses a version or name that does not match its manifest or a
  private package, skips a release whose tag is not a skill's, and runs
  `npm publish`, the command its trusted publisher allows.

actionlint, to 1.7.12 at least, predates `client-id`, and reports it as
unknown and `app-id` as missing. Ignore those two messages, scoped to
that action; a `paths:` glob of `**/.github/workflows/**` also matches
the `./`-prefixed paths a file-listing wrapper may pass.

## Bootstrapping

To find a skill's last release, release-please lists GitHub releases,
then looks for its tag. With either missing for any skill, it walks
`main`'s history back to `bootstrap-sha`, or `last-release-sha`, or else
500 commits, and treats each `feat` and `fix` on the way as unreleased.

- Set `bootstrap-sha` to `main`'s tip before the change that adds
  release-please. It is in `main`'s history however that change merges;
  a commit of its branch is not, after a squash.
- Before merging, check that no commit since is a `feat` or `fix`
  touching a skill, or the first run proposes it.
- After the first releases, release-please counts from them and the
  bootstrap no longer applies; a new skill uses it again until its own
  first release.

A run's log says which applied: `Needed bootstrapping, found configured
bootstrapSha <sha>`, then, once releases exist, `Found release for path
skills/<skill>, skill-<skill>@<version>`. `No user facing commits found`
means a skill had nothing to release.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
