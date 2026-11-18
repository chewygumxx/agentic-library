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
  22.14 and npm 11.5.1 or later publish; release-please acts as a
  GitHub App. The script needs Node alone.
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
Publishing one is a chain where each link guards the next: a `feat` or
`fix` touching the skill makes release-please propose a version; merging
that pull request publishes a GitHub release; the release starts a
workflow that publishes to npm by OIDC, so no token exists to leak, and
the version carries provenance tying it to the run that built it.

```text
feat/fix on main -> release-please.yaml, as a GitHub App
  -> release pull request: versions bumped, lockfiles resynced
merge -> GitHub release skill-<skill>@<version>
  -> publish.yaml -> npm publish by OIDC, with provenance
```

## Let the script carry the data

Most of a skill's package is derived: its name from the directory, its
description and licence from the frontmatter, its file list from what
sits beside `SKILL.md`, and its release-please entries from all of
those. Copied by hand, these drift, and the name, once published, cannot
be taken back. [`scripts/skill-packages.mjs`](scripts/skill-packages.mjs)
derives them instead, needing Node alone:

- `write` builds each package, release-please entry and root
  devDependency from the frontmatter, keeping versions; `--dry-run`
  previews it.
- `check` fails on whatever disagrees, and on names npm or Anthropic
  would refuse; `--online` asks npm whether a name is free or already
  the repository's, `--pack` compares what npm would ship with what git
  tracks.
- `next <skill>` reads the skill's state, the registry's included, and
  prints the exact commands for its next step.

Wire `check` into the repository's checks from
[`assets/tasks/skill-packages.task.toml`](assets/tasks/skill-packages.task.toml),
[`assets/hk.pkl`](assets/hk.pkl) and
[`assets/workflows/skill-packages.yaml`](assets/workflows/skill-packages.yaml):
offline in the commit hook, so it never waits on npm, online in CI, so a
name someone else holds fails the pull request before anyone publishes.
[Packaging](references/packaging.md) explains what it derives and why.

## Setting up a repository

The order matters because npm starts a clock. A new trusted publisher
must publish once within 2 days or it expires, so everything that first
publish runs through should exist before the publisher does.

1. **Settle the names.** A published name and version are permanent:
   npm restricts unpublishing, and a rename means a new package and a
   deprecated old one. `check` refuses what the Agent Skills
   specification and Anthropic refuse, and warns of a name that is no
   gerund; the choice is yours, but only until the first publish.
2. **Build the release path.** Copy
   [`release-please.yaml`](assets/workflows/release-please.yaml) and
   [`publish.yaml`](assets/workflows/publish.yaml), and the config
   [`release-please.json`](assets/release-please.json); install a GitHub
   App on the repository and set its client ID and key; turn on
   immutable releases, so a published release's tag cannot move. Merge
   it all to `main`. [Release-please](references/release-please.md)
   explains each choice, the App above all.
3. **Write the packages** with `write`, reinstall so the lockfiles record
   them, and commit each skill as a `feat`. Mark a skill to hold back
   `private` first: it then stays out of release-please entirely.
4. **Publish each first version by hand**, give it a trusted publisher,
   then merge the release pull request release-please has opened, which
   publishes from CI and validates the publisher. `next` prints these
   commands filled in; [trusted publishing](references/trusted-publishing.md)
   explains the hand publish's one flag, and what a publisher allows.

## Releasing a skill

Once set up, a release is a commit and a merge. Type a change to a skill
by what it does for the skill's users: a `SKILL.md` is the skill's code,
so a corrected instruction is a `fix`, and new guidance a `feat`. A
`docs` or `refactor` commit releases nothing, which is right for what
users never see and wrong for anything they would. Below `1.0.0`, as
configured, a breaking change bumps the minor and anything else the
patch; `Release-As: <version>` in a commit's body, the commit touching
the skill's directory, sets the version outright.

Merging the release pull request publishes. Then verify the exact
version, not just that the run passed:

```sh
pkg='@<scope>/skill-<skill>' version='<version>'
npm view "$pkg@$version" --json |
    jq '{version, provenance: .dist.attestations.provenance.predicateType}'
```

npm takes a few minutes to show a new version, so an empty answer just
after a green run is the registry catching up; the run's log already
says `+ <package>@<version>` once npm took it. A provenance predicate of
`https://slsa.dev/provenance/v1` means the statement exists;
`npm audit signatures`, in a project that installs the version, verifies
it. If the publish itself failed, nothing reached npm and the release
still points at the right commit: re-run the job.

## Decisions worth making on purpose

- **Publish or stage.** `npm publish` makes a version live as the
  release pull request merges; `npm stage publish` holds it for a second
  approval on npmjs.com with 2FA. A publisher always allows staging, and
  allows direct publishing only if asked.
- **Insist on provenance, or take the default.** npm attests every OIDC
  publish of a public package from a public repository anyway.
  `publishConfig.provenance: true` makes its absence an error instead,
  which is also why a hand publish needs `--provenance=false`.
- **The first version.** `0.0.1` promises nothing, but a caret range
  below `0.1.0` pins one version: consumers then move by hand until the
  skill reaches `0.1.0`, which a `Release-As` can set when it is ready.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
