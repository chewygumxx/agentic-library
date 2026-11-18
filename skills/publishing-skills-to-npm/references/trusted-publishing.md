<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/publishing-skills-to-npm/references/trusted-publishing.md
   -
   -->

# Trusted publishing

npm exchanges a CI job's OIDC token for a credential that lasts the job
and is good only for that repository and workflow file. Nothing long
lived exists to leak, and npm can sign a provenance statement naming the
run that built each version. Facts below are npm's documentation as of
late 2026, or the npm 11 CLI, as marked; the registry has moved faster
than the CLI's help, so where they disagree, believe the registry's
settings page.

## What it needs

- npm 11.5.1 or later and Node 22.14 or later, which do the exchange and
  the signing. The first Node 24 releases ship an older npm: check
  `npm --version` in the job. A repository on Bun still publishes with
  npm.
- A cloud-hosted runner: GitHub's own, not a self-hosted one.
- `permissions: id-token: write` on the publishing job, and nothing it
  does not need, as it holds the credential.
- The package's `repository.url` matching the repository the publisher
  names.
- The package already on npm, as a publisher is set on its settings:
  its first version is published by hand.

## The first version, by hand

```sh
npm login
npm publish --workspace skills/<skill> --provenance=false
```

The flag is needed only while `publishConfig.provenance` is `true`:
outside CI there is no provider to attest the build, and npm fails with
`EUSAGE`, "Automatic provenance generation not supported for provider:
null", publishing nothing. A command-line flag outranks
`publishConfig`. npm asks for your 2FA for each package. These first
versions carry no provenance; every one after does.

## The publisher

Set it on the package's npmjs.com settings, Trusted Publisher, or with
npm 11's CLI, which also needs your 2FA:

```sh
npm trust github '@<scope>/skill-<skill>' --repo '<owner>/<repo>' \
    --file publish.yaml --allow-publish --yes
npm trust list '@<scope>/skill-<skill>'
```

- **What it allows.** Every publisher allows `npm stage publish`, which
  holds a version until it is approved on npmjs.com with 2FA, or by
  `npm stage approve`. `npm publish`, live at once, is allowed only when
  asked for, as `--allow-publish` does. The workflow's command must be
  one it allows, or the exchange fails.
- **How many.** npm's documentation allows up to ten per package; the
  npm 11 CLI's help still says one. One workflow file publishing every
  version is simpler to reason about either way.
- **Naming the package.** `npm trust list` with no package reads the
  current directory's: at a private root, a 404, not a missing
  publisher.

## The 2-day window

A new publisher must publish once within 2 days, or it expires and can
be neither used nor edited: delete it, make it again, and publish within
the new window. That is why the release path should exist first. Ways
to make that publish:

- A new skill's own release does it: the `feat` commit that adds it
  gets a release pull request for its next version. Publish the first
  version and make the publisher before merging that pull request.
- For packages with nothing to release, bump their versions in a commit
  release-please does not count, a `build:`, run `write`, and once it is
  on `main` publish a GitHub release per package, which starts the
  workflow:

  ```sh
  gh release create 'skill-<skill>@<version>' --target '<main sha>' \
      --title 'skill-<skill>: <version>' --notes '<why>'
  ```

  `--target` only places a tag that does not exist yet: check that no
  `skill-<skill>@<version>` tag points elsewhere first. release-please
  then counts from these releases as from its own.

A version can never be published twice, so validating always takes a
new one, even with unchanged contents.

## Settings worth having

- Each package's Publishing access: require 2FA and disallow tokens that
  bypass it. Trusted publishers are unaffected, and npm is restricting
  bypass tokens anyway.
- The repository's immutable releases. While a release exists, its tag
  and assets cannot change; its notes can still be edited, and the
  release deleted, so a deleted release is a reason to look closer.

## After a publish

The run's log shows `Signed provenance statement`, a Sigstore
transparency log entry, then `+ <package>@<version>` once npm took it.
npm then processes the version for a few minutes, so poll with a bound
rather than conclude from the first empty answer. A release whose
publish failed has published nothing: re-run the job for it, on the same
commit. A release that exists does not prove a publish happened; the
registry does.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
