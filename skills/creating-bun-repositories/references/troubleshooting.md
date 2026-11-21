<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/creating-bun-repositories/references/troubleshooting.md
   -
   -->

# Troubleshooting

Failures whose cause is not where they show.

## The header check names the wrong repository

`sync-header-metadata` takes the repository from `GITHUB_REPOSITORY`
before the origin remote. In GitHub Actions every step has the running
repository's, and a step's `env:` cannot override a `GITHUB_*` variable:
to check another repository's headers in a step, `export
GITHUB_REPOSITORY=<owner>/<name>` in its script. Locally, before the
origin remote exists, set it the same way, as create-repo does for its
own checks.

A header written with an owner spelt otherwise than GitHub spells it
fails the same check in CI, which compares case: rewrite it with
`mise run format`, run where `GITHUB_REPOSITORY` holds GitHub's spelling.

## Every caller's CI fails after a change to an action repository

A repository other workflows call by `uses:` is unpacked by the runner
without `node_modules`, so a committed symlink into `node_modules`, such
as the conf.d link, dangles there and fails every caller. In such a
repository, make the link in `package.json`'s `postinstall` and ignore
it. Move a moving tag such as `v1` only after a caller's CI has passed
against the candidate commit.

## A check passes locally and fails in CI

- **A file the run left untracked.** CI sees the commit alone: clone it
  fresh, `bun install --frozen-lockfile`, then `bun run check`.
- **A tool installed lazily** from inside a parallel hk step: pin it in
  `[tools]` without `lazy`.
- **The lockfile disagrees with `package.json`:** CI installs frozen.
  Run `bun install`, then commit `bun.lock`.

## The metadata sync fails on the first push

It mints a token from `METADATA_APP_CLIENT_ID` and
`METADATA_APP_PRIVATE_KEY`. Check both are set on the repository, that
the key is the App's, and that the App's installation covers the
repository. Re-run it with `gh workflow run CI --repo <owner>/<name>`
once fixed. A repository made with `--no-metadata` has the sync switched
off in `.github/workflows/ci.yaml`; its README says how to switch it on.

## A release pull request broke the next release

Release Please finds its last release by the merged pull request's
commit. Squash-merge its pull request with the generated title as the
subject and an empty body; a rebase-merge loses it, and the next
proposal re-releases everything since the one before.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
