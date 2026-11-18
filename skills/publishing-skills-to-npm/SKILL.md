---
name: publishing-skills-to-npm
description: >-
  Packages a repository's agent skills as one npm package each and
  releases them per skill, with release-please and npm trusted
  publishing from GitHub Actions. Use when adding or renaming a skill
  package, wiring skills up for `skills experimental_sync`, setting up
  or debugging npm trusted publishing or provenance for skills, or
  cutting, bootstrapping or verifying a skill's release.
compatibility: >-
  GitHub Actions on GitHub-hosted runners and the npm registry. Node
  22.14 and npm 11.5.1 or later publish; npm 11.15 or later configures a
  trusted publisher; release-please acts as a GitHub App. The script
  needs Node alone.
license: GPL-3.0-only
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/publishing-skills-to-npm/SKILL.md
   -
   -->

# Publishing skills to npm

A project depends on `@<scope>/skill-<skill>` and links it with `skills
experimental_sync` on `prepare`, so a skill updates like any dependency.
Publishing one is a chain where each link guards the next: a commit
touching the skill that produces release notes makes release-please
propose a version; merging that pull request publishes a GitHub
release; the release starts a workflow that publishes to npm by OIDC, so
no long-lived token exists to leak, and the version carries provenance
tying it to the run that built it.

```text
releasable commit on main -> release-please.yaml, as a GitHub App
  -> release pull request: versions bumped, lockfiles resynced
merge -> GitHub release skill-<skill>@<version>
  -> publish.yaml: checked read-only, then npm publish by OIDC
```

## Let the script carry the data

Most of a skill's package is derived: its name from the directory, its
description and licence from the frontmatter, its file list from what
sits beside `SKILL.md`, its release-please entries from all of those.
Copied by hand these drift, and a published name cannot be taken back.
[`scripts/skill-packages.mjs`](scripts/skill-packages.mjs), Node alone,
derives them: `write` builds them, all or nothing; `check` fails on
whatever disagrees or could not publish safely; `next <skill>` reads the
skill's state, the registry's included, and prints its next commands.
`--help` has the rest. [Packaging](references/packaging.md) explains
what it derives, and why.

## Setting up a repository

The order matters because npm starts a clock: a new trusted publisher
must publish once within 2 days or it expires. So everything that first
publish runs through goes in first, as one pull request.

1. **Settle the names.** A published name and version are permanent: npm
   restricts unpublishing, so a rename means a new package and a
   deprecated old one. `check` refuses names the Agent Skills
   specification and Anthropic refuse, and suggests a gerund; the choice
   is yours, until the first publish.
2. **Make the first pull request.** Copy
   [`release-please.json`](assets/release-please.json) to
   `.config/release-please.json`, with `bootstrap-sha` set to `main`'s
   tip, beside a manifest holding `{}`; the workflows
   [`release-please.yaml`](assets/workflows/release-please.yaml) and
   [`publish.yaml`](assets/workflows/publish.yaml); and the check's
   wiring, [`skill-packages.task.toml`](assets/tasks/skill-packages.task.toml),
   [`hk.pkl`](assets/hk.pkl) and
   [`skill-packages.yaml`](assets/workflows/skill-packages.yaml). Fill each
   `<...>`. Then run `write --scope @<scope>`, reinstall so the lockfiles
   record the packages, and `check --online --pack`. Commit each skill
   as a `feat`; one held back is marked `"private": true` first, and
   stays out of release-please. [Release-please](references/release-please.md)
   explains each choice.
3. **Before merging,** install a GitHub App on the repository, with
   read and write on contents, pull requests and issues, and set its
   client ID as the variable `RELEASE_APP_CLIENT_ID` and its key as the
   secret `RELEASE_APP_PRIVATE_KEY`; turn on immutable releases. Merge:
   release-please opens a release pull request for the `feat` commits.
   Check that CI passes on it, its lockfiles refreshed.
4. **Publish each first version by hand, then the publisher.** `next`
   prints both commands filled in. Then merge the release pull request:
   it publishes from CI, which validates each publisher.
   [Trusted publishing](references/trusted-publishing.md) explains the
   hand publish's one flag, and what a publisher allows.

## Releasing a skill

Once set up, a release is a commit and a merge. Type a change to a skill
by what it does for its users: a `SKILL.md` is the skill's code, so a
corrected instruction is a `fix`, and new guidance a `feat`. Under the
configuration here, an ordinary `docs` or `refactor` commit produces no
release notes, and so no release: right for what users never see, wrong
for anything they would. Below `1.0.0` a breaking change bumps the minor
and anything else the patch; `Release-As: <version>` in a commit's
body, the commit touching the skill's directory, sets the version.

Merging the release pull request publishes. Then check the exact
version, not just that the run passed:

```sh
pkg='@<scope>/skill-<skill>' version='<version>'
npm view "$pkg@$version" --json |
    jq '{version, provenance: .dist.attestations.provenance.predicateType}'
```

npm takes a few minutes to show a new version, so an empty answer just
after a green run is likely the registry catching up: poll a while
before concluding. A provenance predicate of
`https://slsa.dev/provenance/v1` shows a statement exists; `npm audit
signatures`, in a project that installs the version, verifies it. If
the publish failed, first see whether the version reached npm anyway,
as an upload can succeed before a job fails; if it did not, re-run the
job, which publishes from the release's own commit.

## Decisions worth making on purpose

- **Publish or stage.** `npm publish` makes a version live as the
  release pull request merges; `npm stage publish` holds it for approval
  on npmjs.com or by `npm stage approve`, with 2FA. A publisher always
  allows staging, and allows direct publishing only if asked.
- **Insist on provenance, or take the default.** npm attests an OIDC
  publish of a public package from a public repository anyway.
  `publishConfig.provenance: true`, which `write` gives a new package,
  makes its absence an error instead, and is why a hand publish needs
  `--provenance=false`. Removing it is a valid choice the script keeps.
- **The first version.** `0.0.1` promises nothing, but a caret range
  below `0.1.0` pins one version: consumers then move by hand until the
  skill reaches `0.1.0`, which a `Release-As` can set when it is ready.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
