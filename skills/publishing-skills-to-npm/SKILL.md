---
name: publishing-skills-to-npm
description: >-
  Publishes a repository's agent skills to an npm scope, one package per
  skill, released by release-please and published from CI by npm trusted
  publishing with provenance, and lists the mistakes that cost a failed
  run on the way. Use when packaging skills for npm or for `skills
  experimental_sync`, setting up, validating or debugging an npm trusted
  publisher or provenance, configuring release-please or its GitHub App
  for per-skill releases, or cutting, bootstrapping or verifying a
  skill's release.
compatibility: >-
  GitHub Actions and the npm registry. Publishing needs the npm CLI,
  11.5.1 or later; release-please needs a GitHub App.
license: GPL-3.0-only
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/publishing-skills-to-npm/SKILL.md
   -
   -->

# Publishing skills to npm

Each skill becomes its own npm package, `@<scope>/skill-<skill>`, which a
project lists as a dependency and links with `skills experimental_sync`
on `prepare`. A `feat` or `fix` touching a skill makes release-please
propose its next version; merging that pull request publishes a GitHub
release, and the release publishes the package from CI, with provenance.
Here is the order to set it up in, and what went wrong the first time.

```text
feat/fix on main -> release-please.yaml, as a GitHub App
  -> release pull request: package.json and manifest bumped,
     lockfiles resynced by a second job
merge -> GitHub release skill-<skill>@<version>, immutable
  -> publish.yaml, on the release -> npm publish by OIDC, with provenance
```

## Setting it up

In this order: each step needs the one before.

1. **Name the skills.** A published name is permanent: npm restricts
   unpublishing, so a rename is a new package and a deprecated old one.
   Settle every name, and each frontmatter `name` equal to its
   directory, before the first publish. See
   [packaging](references/packaging.md).
2. **Make each skill a package**: a workspace per `skills/<skill>/`,
   with `SKILL.md` at its root, from
   [`assets/skill-package.json`](assets/skill-package.json). A skill
   held back is `private`. See [packaging](references/packaging.md).
3. **Guard the manifests** with publint, and a test that each repeats
   its frontmatter and ships every file beside it.
4. **Publish each package's first version by hand**, give it a trusted
   publisher, and validate that publisher by publishing once from its
   workflow before the deadline its settings page shows, about 48 hours.
   See [trusted publishing](references/trusted-publishing.md).
5. **Release with release-please**, from
   [`assets/release-please.json`](assets/release-please.json) and the
   workflows [`release-please.yaml`](assets/workflows/release-please.yaml)
   and [`publish.yaml`](assets/workflows/publish.yaml). See
   [release-please](references/release-please.md).
6. **Turn on immutable releases** in the repository's settings. A
   published release and its tag can then never move, and as
   `publish.yaml` starts on a release, never a bare tag, every version
   on npm has one.

## Mistakes to avoid

Each of these cost a failed run or a detour:

- **Provenance on a hand publish.** `publishConfig.provenance` makes a
  local `npm publish` fail, `EUSAGE`, "Automatic provenance generation
  not supported for provider: null": only CI can attest. Pass
  `--provenance=false`, which outranks `publishConfig`.
- **An unvalidated publisher.** A new trusted publisher stays "Pending
  validation" until its workflow publishes once, and has a deadline.
  Plan that publish when you configure it.
- **The wrong permission.** A trusted publisher allows `npm publish`,
  `npm stage publish`, or both; a workflow running the other one fails
  at the OIDC exchange. npm allows one publisher, so one workflow file,
  per package: every publish goes through it.
- **`npm trust list` with no package** reads the current directory's,
  the private root, and answers 404. Name the package.
- **`GITHUB_TOKEN`.** What it creates starts no other workflow:
  release-please's releases would never start `publish.yaml`, nor CI its
  pull request. Give release-please a GitHub App's token.
- **Lockfiles that record versions.** release-please bumps `package.json`
  alone; `bun.lock` and `skills-lock.json` then fail CI's frozen install
  on the release pull request unless a job resyncs them there.
- **Expecting a release without a feat or fix.** `release-as`, in config
  or a footer, chooses the version but never forces a release, and a
  `docs` commit to a `SKILL.md` releases nothing.
- **A `bootstrap-sha` off `main`.** With no release yet, release-please
  walks `main` back to it, or 500 commits. Use `main`'s tip before the
  change: a branch's own commit is lost to a squash merge.
- **Reading a slow registry as failure.** npm processes a new version for
  a few minutes before `npm view` shows it; the run's log says
  `+ @<scope>/skill-<skill>@<version>` once it is sent.
- **Caret ranges below 0.1.0.** `^0.0.1` accepts `0.0.1` alone; a
  consumer moves by hand until a minor of 0.1 or more.
- **Splitting a list in zsh.** An unquoted `$list` stays one word in
  zsh; loop over a literal list or an array.

## Verifying a release

```sh
npm view @<scope>/skill-<skill>@<version> --json |
    jq '{version, latest: .["dist-tags"].latest,
        provenance: .dist.attestations.provenance.predicateType}'
gh api 'repos/<owner>/<repo>/releases/tags/skill-<skill>@<version>' \
    --jq .immutable
```

A good release shows its version as `latest`, a provenance predicate of
`https://slsa.dev/provenance/v1`, and an immutable GitHub release.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
