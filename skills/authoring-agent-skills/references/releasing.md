<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/authoring-agent-skills/references/releasing.md
   -
   -->

# Releasing a skill

A released skill is a dependency: projects install it, pin it, and take
its updates without reading them. Release it as code.

## Before the first release

- **The name is permanent.** Installers record it, other skills and
  documents link to it, and a registry such as npm will not hand a
  published name back. Renaming later means a new package beside a
  deprecated old one.
- **Choose public or private,** and keep a private skill out of
  whatever publishes, so it cannot leak by a later mistake.
- **Start below `1.0.0`.** Until evaluations show the skill stable, a
  `0.x` version promises users nothing, so every change can be made.
  Below `0.1.0`, a caret range pins one version, so consumers update by
  hand until the skill reaches `0.1.0`.

## Versions follow what users see

Type each change by what it does for the skill's users, never by the
file it touches: `SKILL.md` and its scripts are the skill's code.

| Change | Conventional commit | Bump at `1.x` | Bump at `0.x` |
| --- | --- | --- | --- |
| New guidance, script or behaviour | `feat` | minor | minor, or patch if configured |
| Wrong or misleading guidance corrected | `fix` | patch | patch |
| Guidance removed, or behaviour users rely on changed | `feat!` or `fix!` | major | minor |
| Anything users never see | `docs`, `refactor`, `build`, ... | none | none |

Release tools differ below `1.0.0`; release-please's
`bump-minor-pre-major` and `bump-patch-for-minor-pre-major` give the
last column's patch and minor.

A release tool reading these commits (release-please, semantic-release,
changesets) writes the release notes from them, so:

- **Keep one skill's change to one commit,** its message written for
  that skill's users.
- **Do not squash** a branch whose commits become release notes: merge
  or rebase it.
- **Resync lockfiles in the same commit** as the change that alters a
  skill's content, as a frozen install in CI rejects a stale hash: the
  `skills` CLI's `skills-lock.json`, for one.

## Publishing

- **Publish from CI,** with short-lived credentials (npm's trusted
  publishing by OIDC) and provenance tying each version to the run that
  built it. A first version may need publishing by hand, before a
  trusted publisher can be configured; publish it without provenance,
  which only CI can attest, and let CI publish every later one.
- **Check the exact version** after a release: the registry shows it,
  with provenance, not just a green run. A registry takes minutes to
  show a new version, so poll before concluding it failed.
- **Correct, never remove:** deprecate a broken version and release a
  fix, as consumers may already pin it.

A repository releasing skills to npm with release-please can follow the
`publishing-skills-to-npm` skill, which derives each package from its
frontmatter and prints each release's next commands.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
