---
name: configuring-mise-tasks
description: >-
  Sets out a repository's standard mise tasks: where each action is
  defined, how tasks are written and named, how they hand work to the
  tools made for it, and how hooks run them. Use when adding, changing,
  reviewing or adopting a repository's mise tasks, deciding what belongs
  in package.json scripts or the runtime's equivalent, or running git
  hooks or worktree hooks through mise.
license: GPL-3.0-only
---

<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/configuring-mise-tasks/SKILL.md
   -
   -->

# Configuring mise tasks

Repositories offer the same tasks under the same names, written the
same way, so `mise run check` means one thing everywhere. Here is where an
action is defined, how tasks are written and named, how they hand work to
the tools made for it, and how hooks reach them.

## mise as the switchboard

mise is a repository's switchboard: it pins the tools, sets the
environment, and names the tasks a developer or agent runs. A task does
none of the work itself. It hands it to the tool made for it, and adds no
logic the tool already has:

| Work                                         | Tool                                 |
| -------------------------------------------- | ------------------------------------ |
| Linting, formatting, file selection, caching | [hk](https://hk.jdx.dev)             |
| Git worktrees                                | worktrunk                            |
| Workspaces and agent delegation              | herdr                                |
| Agent skill sync                             | `@vercel-labs/skills-cli`            |
| CI, locally                                  | act                                  |

So a task never selects files, stashes edits or caches results for a tool
that does so itself: `lint` is `hk check`, not a list of linters.

## mise or the runtime

`mise` is the primary interface for development. It cannot be relied on
wherever the project runs beyond the developer's own machine or CI, such as
an end user's install. The project's runtime tool (Bun, uv, cargo and the like)
is what is there everywhere.

- An action that must run without mise is defined in the runtime's
  layer: a script in `scripts/`, or an entry in the runtime's manifest. A
  lifecycle script the package manager runs, such as `prepare` on
  `bun install`, never calls `mise run`.
- Every other action is a mise task alone.
- Each action has one definition. The other layer may wrap it; nothing
  wraps in both directions, as a task reaching a script that runs
  `mise run` back is a loop.

The manifest's scripts (`package.json`'s, for Bun) hold only:

1. Lifecycle scripts, such as `prepare`;
2. Runtime entry points, such as `dev` or `start`;
3. Names something outside the repository calls, such as a shared CI
   workflow's `bun run check`. Where that caller has mise, the entry is
   `"check": "mise run check --all"`, as CI checks every file.

Remove any other entry, and change its mentions from `bun run <name>` to
`mise run <name>`.

## Where tasks live

- `.config/mise/config.toml` includes the tasks with:

  ```toml
  [task_config]
  includes = [".config/mise/tasks/*.task.toml"]
  ```

  The include path is relative to the repository root. mise 2026.11.6
  takes a glob there.

- The task templates come from
  [`@chewygumxx/mise-tasks-config`](https://www.npmjs.com/package/@chewygumxx/mise-tasks-config),
  linked into `.config/mise/conf.d/`, as an included task file holds tasks
  alone and mise reads templates from a configuration file:

  ```sh
  bun add --dev --exact @chewygumxx/mise-tasks-config @chewygumxx/hk-config
  ln -s ../../../node_modules/@chewygumxx/mise-tasks-config/tasks.toml .config/mise/conf.d/50-cgxx.toml
  ```

  Pin both exactly: below 1.0.0, each functional change to them is a
  breaking one.

- `.config/mise/tasks/` holds every task, as TOML, one file per task
  family, so a task is found by the first part of its name:

  | File                  | Tasks                                       |
  | --------------------- | ------------------------------------------- |
  | `standard.task.toml`  | `install`, `test`, `check`                  |
  | `lint.task.toml`      | `lint` and every `lint:*`                   |
  | `format.task.toml`    | `format` and every `format:*`               |
  | `<runtime>.task.toml` | Those wrapping the runtime                  |
  | `other.task.toml`     | Every other task, such as `commit` or `act` |

  Tasks that map single test files, `test:<subject>`, are the exception:
  they live beside the tests, in `tests/tasks.toml` and a test
  directory's own `tasks.toml`, which the include's glob lists too, as
  the mapping-tests skill sets out.
  The runtime's file is named for it, such as `bun.task.toml`, and holds
  `dev`, `start` and `build` and any task that runs one of its scripts,
  such as `eval` or `skills`. Each file opens with the house header
  naming its own path, as the [examples](assets/tasks/) do. Leave out a
  file with no tasks.

- Each standard task extends its `cgxx:` template and sets only what
  differs, such as `test`'s `run`. A task's own field replaces the
  template's; `extends` names a template, never another task.

- A task's `run` is one line, or a short list of one-line commands.
  Anything longer is a script in `scripts/`, which runs without mise. No
  file tasks with `#MISE` comments.
- Every task has a `description`, which `mise tasks` shows. Otherwise a
  task file carries labels, and at most a one-line why where a setting is
  not obvious. Longer reasoning goes in the directory's guidance file.
- Tools mise pins run by name. Tools the runtime installs run through it,
  as `mise run` puts no `node_modules/.bin` on `PATH`: `bun run <cli>` for
  Bun, with `[run] bun = true` in `bunfig.toml`, so a CLI whose shebang
  names `node` runs on Bun. `bun run` never installs, and a
  `package.json` script of the CLI's name runs in its place, so name no
  script after a CLI. Not `bunx`, which runs such a CLI on Node without
  `--bun`, and without `--no-install` fetches the package named for the
  CLI, which need not be the one locked.

## The standard set

| Task      | Alias | Runs                                  | Writes |
| --------- | ----- | ------------------------------------- | ------ |
| `install` | `i`   | The locked dependency install         | yes    |
| `lint`    | `l`   | Every linter and format check         | no     |
| `format`  | `f`   | Every formatter                       | yes    |
| `test`    | `t`   | The tests                             | no     |
| `check`   | `c`   | Everything CI runs: `lint` and `test` | no     |

Where they apply, `dev`, `start` and `build` too, wrapping the runtime's
own entry points, and `act`, which runs CI locally.

- Linters and formatters are hk steps, not tasks: `lint` and `format` run
  every step, and `-S <step>` one, as `mise run lint -S tombi`.
- Any other sub-task is named for its parent and its kind, such as
  `lint:commit`.
- `test:<subject>` tasks, each running one test file to record what it
  covers for `mise tasks` and `mise mcp`, are not sub-tasks: `test` never
  depends on a `test:<subject>`, as it runs every test itself and would
  then run each twice.
- A format check is a lint: the `tombi` step checks formatting as well
  as linting, so `format` only ever writes.
- Only the five parents take aliases, which their templates carry.
- `lint`, `test` and `check` never write files; CI and the pre-commit
  hook rely on that.
- `lint:commit` takes the commit message file as an argument, so `lint`
  does not depend on it; only the `commit-msg` hook runs it.
- A task outside the set takes a name that cannot be mistaken for one in
  it, such as `commit` or `skills`.

To adopt the set, add the two packages and the link above, copy the
files in [`assets/tasks/`](assets/tasks/) to `.config/mise/tasks/`, pointing
each header at its new path and filling in `test`'s `run`, merge
[`assets/config.toml`](assets/config.toml) into `.config/mise/config.toml`,
and copy [`assets/hk.pkl`](assets/hk.pkl) to `.config/hk.pkl`. A repository
with a single `.config/mise/tasks.toml` moves each task into its family's
file and changes the include to the glob.

## Selecting files

hk selects the files `lint`, `format` and `check` act on:

| Flag       | Files                                                    |
| ---------- | -------------------------------------------------------- |
| None       | The changed files: staged, unstaged and untracked        |
| `--staged` | The staged files alone                                   |
| `--all`    | Every file git does not ignore, untracked ones included  |

The templates declare the flags, and `cgxx-hk` passes them on as hk's own,
so no `run` names a file. `check` forwards its flag to `lint` through a
templated `depends`. A change to a path in `$CGXX_WIDEN_ON`, by default
`bun.lock`, `.config/hk.pkl` and `.config/mise`, selects every file, as it
can change the result for any of them. A repository whose own files
configure its linters adds them in mise's `[env]`:

```toml
[env]
CGXX_WIDEN_ON = "bun.lock .config packages"
```

Every step runs, however many fail, and `format` leaves its fixes
unstaged for review.

## Skipping unchanged work

Each step of `@chewygumxx/hk-config` sets hk's `cache`, keyed on its
`cache_inputs`: the files it reads, its configuration, `bun.lock` and
`.config/mise/config.toml`. hk skips a step whose inputs have not changed
since it last passed. hk leaves files git ignores out of the key, so a
configuration package in `node_modules` counts through `bun.lock`; a
repository that keeps its own copies amends the steps' `extraInputs`, as
[`assets/hk.pkl`](assets/hk.pkl) shows.

No task declares `sources`: hk's cache does the work.

## hk steps

`.config/hk.pkl` imports the steps from node_modules and maps them into
hk's `check` and `fix` hooks, which `lint` and `format` run:

```pkl
import "../node_modules/@chewygumxx/hk-config/steps.pkl" as cgxx

hooks {
    ["check"] { steps = cgxx.lint }
    ["fix"] {
        stage = false
        steps = cgxx.format
    }
}
```

`cgxx.lint` maps every step and `cgxx.format` those that fix, as `hk fix`
runs a step's check where it has no fix. Amend a mapping to change a step
or add one of the repository's own, or map single steps by name.

## Hooks

A git hook is one step, calling a task, whichever manager runs it:

- `pre-commit`: `mise run check --staged`
- `commit-msg`: `mise run lint:commit <file>`, the message file being
  `{{ commit_msg_file }}` in hk's `hk.pkl`, or `"$1"` in a shell hook

In `hk.pkl`, such a step is a `check` command alone, with no `glob`: the
task picks its own files, running hk's hooks in turn inside the stash the
pre-commit hook made. Pin hk among mise's tools, and install its hooks
from mise's config, so `mise install` sets them up.

Until the packages are installed no task loads, as each extends a
template that does not yet exist, and `hk.pkl` cannot import its steps.
So `mise install` installs the packages before the hooks. CI installs the
packages itself, from a lockfile a release may yet refresh, and needs no
hooks:

```toml
[hooks]
postinstall = 'test -n "${CI-}" || { bun ci && hk install --mise; }'
```

Worktree tools' hooks, such as worktrunk's in `.config/wt.toml`, call
`mise run <task>` likewise. A hook needs only the `mise` binary on `PATH`,
as `mise run` puts the pinned tools there itself; hk's, installed with
`--mise`, run `mise x -- hk`. Where even that is missing, as in a git
GUI, the hook manager's per-user startup file adds it, such as husky's
`~/.config/husky/init.sh`, or the GUI is started from a shell with mise
on `PATH`.

As `check` runs the tests, the pre-commit hook runs them with git's own
variables set, such as `GIT_INDEX_FILE`. A test that runs git in a
scratch repository drops every `GIT_*` variable from its environment, or
it writes to the real repository's index and branch.

## Trust

Includes and templates make mise refuse the configuration until it is
trusted. `mise run` and `mise install` trust the active configuration
themselves, so a new checkout needs nothing by hand. Never run
`mise trust` on the user's behalf.

A test that replaces `HOME` hides the user's trust from a mise shim on
`PATH`, which refuses any untrusted config above it, such as the main
checkout's above a worktree nested within it. Run what a test spawns
from its temporary directory, outside every checkout, where a mise shim
finds no config to refuse.

## Remote tasks

`act`, and any CI task that depends on a remote script, are the one
exception to TOML-only tasks. Read [Remote tasks](./references/remote-tasks.md)
before adding one; `act` extends `cgxx:act`, which runs the repository's
own hidden remote task.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
