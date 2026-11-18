<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/publishing-skills-to-npm/references/trusted-publishing.md
   -
   -->

# Trusted publishing

npm exchanges a GitHub Actions job's OIDC token for a short-lived
credential bound to one repository and workflow file, so no `NPM_TOKEN`
secret exists, and signs a provenance statement linking the version to
the run that built it.

## Requirements

- The npm CLI, 11.5.1 or later, does the exchange and the signing; the
  first Node 24 releases ship an older one, so check `npm --version`. A
  repository on Bun still publishes with npm.
- The publishing job has `permissions: id-token: write`.
- The package already exists on npm: a trusted publisher is configured
  on a package's settings, so a package's first version is published by
  hand.

## The first version, by hand

```sh
npm login
npm publish --workspace skills/<skill> --provenance=false
```

`--provenance=false` is needed while `publishConfig` asks for
provenance: without a CI provider npm fails `EUSAGE`, "Automatic
provenance generation not supported for provider: null", and publishes
nothing. A flag on the command line outranks `publishConfig`. npm asks
for the account's 2FA on each package. These first versions have no
provenance; every later one does.

## Configuring the publisher

On npmjs.com, the package's Settings, Trusted Publisher: the owner and
repository, the workflow's file name, `publish.yaml`, and its
permissions. Or, with 2FA:

```sh
npm trust github @<scope>/skill-<skill> --repo <owner>/<repo> \
    --file publish.yaml --allow-publish --yes
npm trust list @<scope>/skill-<skill>
```

- A permission is `npm publish`, `npm stage publish`, or both. The
  workflow's command must be one it allows, or the exchange fails.
  `npm stage publish` holds each version until it is approved on
  npmjs.com with 2FA; `npm publish` makes it live, and merging the
  release pull request is then the approval.
- npm keeps one publisher per package. Replacing one is `npm trust
  revoke --id <id>` with the id `npm trust list` shows, then a new one.
  Every publish of the package goes through that one workflow file.
- `npm trust list` with no package reads the current directory's: in a
  repository whose root is private, a 404.

## Validating it

A new publisher shows "Pending validation" until its workflow publishes
once, with a deadline on its settings page, observed at 48 hours. Plan
that publish when configuring it:

- A new skill's own release does it: its adding `feat` commit gets a
  release pull request for its next version. Publish the first version
  by hand and configure the publisher before merging that pull request.
- For several packages at once, with nothing to release, bump their
  versions by hand in a commit release-please does not count, a
  `build:`, along with its manifest, then publish a GitHub release per
  package once it is on `main`:

  ```sh
  gh release create 'skill-<skill>@<version>' --target <main sha> \
      --title 'skill-<skill>: <version>' --notes '<why>'
  ```

  Each starts `publish.yaml`. release-please then counts from those
  releases, as from its own.

A published version can never be published again, so validation always
takes a new version, even with unchanged contents.

## Settings worth having

- Each package's Publishing access: require two-factor authentication
  and disallow tokens that bypass it. Trusted publishers keep working,
  and npm is restricting bypass tokens anyway.
- The repository's immutable releases, so a release and its tag, once
  published, cannot be changed or deleted.

## After a publish

The run's log shows `Signed provenance statement`, a Sigstore
transparency log entry, then `+ @<scope>/skill-<skill>@<version>`. npm
then processes the version for a few minutes, during which `npm view`
shows nothing for it: wait, then check it as the skill sets out, rather
than re-run.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
