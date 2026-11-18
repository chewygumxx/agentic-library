<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/publishing-skills-to-npm/references/release-please.md
   -
   -->

# Releasing with release-please

release-please reads the conventional commits touching each skill's
directory since that skill's last release, keeps one pull request open
that bumps their versions, and once it merges, publishes a GitHub
release per bumped skill. Here is why the configuration and the two
workflows are as they are.

Contents: [the configuration](#the-configuration),
[what releases a skill](#what-releases-a-skill),
[the workflows](#the-workflows), [bootstrapping](#bootstrapping).

## The configuration

[`assets/release-please.json`](../assets/release-please.json) goes to
`.config/release-please.json`, beside a manifest mapping each public
skill's path to its version, which `write` maintains with the packages.

- **The tag** is `skill-<skill>@<version>`, from
  `include-component-in-tag`, `include-v-in-tag: false` and
  `tag-separator: "@"`, because `publish.yaml` reads the package and
  version back out of it. `check` refuses a config that would tag
  otherwise.
- **Below 1.0.0**, `bump-minor-pre-major` and
  `bump-patch-for-minor-pre-major` make a breaking change bump the minor
  and anything else the patch. That matches what a caret range
  promises below `1.0.0`, once the minor is 1 or more: patches flow to
  consumers, breaking changes wait for them to move.
- **No changelog file.** `skip-changelog` keeps a generated
  `CHANGELOG.md` out of the skill, where it would be linted with the
  repository's Markdown, shipped in the package and linked into every
  agent's skill directory. The notes stay in the pull request and the
  GitHub release.
- **The schema** to check the file against is the release-please
  version the action runs, which its log prints, such as `Running
  release-please version: 17.6.0`; an option newer than that is
  silently ignored.

## What releases a skill

Commits are assigned to skills by the paths they touch, and a skill is
released when its commits produce release notes: a `feat`, a `fix`, a
breaking change, or a commit whose body says `Release-As: <version>`,
which also sets the version, even on a `chore`. A `docs` or `refactor`
commit releases nothing. So type a skill's change by what its users
see, and keep one skill's change to one commit where you can: its
message becomes that skill's release notes. The `release-as` option in
the config, unlike the footer, only picks the version of a release that
something else causes.

## The workflows

[`release-please.yaml`](../assets/workflows/release-please.yaml) runs on
each push to `main`;
[`publish.yaml`](../assets/workflows/publish.yaml) on each published
release.

- **A GitHub App's token.** Events made with `GITHUB_TOKEN` start no
  further workflows, apart from dispatches: release-please's releases
  would never start `publish.yaml`, nor its pull request's commits CI. An
  App's installation token, or a suitably scoped personal token, starts
  both. The App needs read and write on
  contents, pull requests and issues, which hold the labels
  release-please tracks its pull requests by. Keep its private key a
  secret and its client ID a variable. With an App, the repository need
  not let Actions create or approve pull requests.
- **The lockfiles job.** release-please bumps `package.json` alone, but
  a lockfile can record workspace versions too, as `bun.lock` and
  `skills-lock.json` do; CI's frozen install then fails on the release
  pull request. A second job installs on the release branch, scripts
  off, runs the sync with `--no-frozen-lockfile`, and pushes the result
  as the App, so CI runs on it. Frozen is the sync's default in CI, so
  an install whose `prepare` syncs would refuse the very change the job
  exists to make. A dispatch of the workflow re-runs the job, for a
  refresh that failed. The node strategy does update a package's own
  `package-lock.json`, but skill packages have none.
- **The pull request's title** is its commit's message, `chore: release
  main` by default for one pull request across the packages; a
  commit-message linter must accept it.
- **The action's inputs** such as `include-component-in-tag` apply only
  with `release-type`; with a config file the config decides, and a log
  showing the input as `false` is harmless.
- **Publishing in two jobs.** `publish.yaml` checks the package and
  reads the tag back in a job with no write permission, then publishes
  in one that holds the OIDC token and runs nothing but npm: it installs
  no dependencies, as `npm publish` needs none, restores no cache, and
  names the registry. The check refuses a package whose scripts would
  run during the publish, other than the licence copy, or whose
  `publishConfig` would redirect it, so the job runs none of the
  package's own code.

The workflow templates' comments carry what applies to them alone, such
as the actionlint messages to ignore for `create-github-app-token`.

## Bootstrapping

To find a skill's last release, release-please lists GitHub releases,
then looks for the tag its manifest version implies. While any skill
has neither, it walks `main` back to `bootstrap-sha`, or by default 500
commits, and counts each releasable commit on the way as unreleased.
`last-release-sha` is a different, global stop for every skill, meant
for a single run: leave it unset.

- Set `bootstrap-sha` to `main`'s tip before the change adding
  release-please. It stays in `main`'s history however that change
  merges, where a commit of its branch would not survive a squash.
- Before merging, check that no commit since touches a skill with
  release notes to give, or the first run proposes it; on a squash, the
  pull request's title is that commit.
- Once each skill has a release, release-please counts from those. A new
  skill uses the bootstrap again until its own first.

A run's log says which applied: `Needed bootstrapping, found configured
bootstrapSha`, then, once releases exist, `Found release for path
skills/<skill>`. `No user facing commits found` means a skill had
nothing to release.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
