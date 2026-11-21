<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/creating-bun-repositories/references/adopting.md
   -
   -->

# Adopting the setup

Generate the nearest template beside the repository and merge it in,
rather than writing the files from memory: the template carries the pins
and configurations create-repo currently ships.

```sh
parent=$(mktemp -d)
bunx @chewygumxx/create-repo my-tool --template typescript --with '' \
    --description 'Prints the weather for a city.' --owner my-account \
    --dir "$parent/my-tool" --no-metadata --dry-run --yes
```

Use the repository's own name, description and owner, and `--with
publish` if it publishes. `--dry-run` creates nothing on GitHub; the
directory holds a committed, checked repository to compare with. Then,
on a branch of the existing repository:

1. **Copy what is only the setup's,** changing each file's header to name
   this repository: `.config/mise/config.toml`, `.config/mise/tasks/`,
   `.config/hk.pkl`, `.config/prettierrc.json`, `.config/remarkrc.json`,
   `.config/tombi.toml`, `.biome.json`, `.markdownlint-cli2.jsonc`,
   `.secretlintrc.json`, `.knip.jsonc` and `bunfig.toml`.
2. **Merge what the repository already has:**
   - `package.json`: add the template's `devDependencies` to the
     repository's own, which its tests and build still need, and take its
     `check` script. Keep the name, dependencies and lifecycle scripts;
     remove a script once a mise task or hk step does its work. Move the
     `prettier`, `remarkConfig` and `cspell` fields' settings under
     `.config/`, the spellings into `.config/cspell.json`'s `words`.
   - `.github/workflows/ci.yaml`: the generated one switches the
     metadata sync off. If the repository syncs its metadata, set
     `metadata-sync` back to `${{ vars.METADATA_APP_CLIENT_ID != '' }}`
     and keep its `.repo-metadata.jsonc`. Keep its default branch in
     `on.push.branches`.
   - `.commitlintrc.mts`, `AGENTS.md`, `.editorconfig`, `.gitignore` and
     `.github/dependabot.yml`: keep the repository's scopes, guidance and
     rules, and add what the template's have that they lack.
3. **Remove husky** before the first install: its dependency, its
   `prepare` script and `.husky/`. Remove `package-lock.json` if the
   repository moves from npm to Bun, as the shared lint refuses both.
4. **Link the task templates.** In an ordinary repository, commit the
   link:

   ```sh
   mkdir -p .config/mise/conf.d
   ln -s ../../../node_modules/@chewygumxx/mise-tasks-config/tasks.toml .config/mise/conf.d/50-cgxx.toml
   ```

   In a repository other workflows call as an action, make it in
   `package.json`'s `postinstall` and ignore it instead; see
   [Troubleshooting](troubleshooting.md).
5. **Point the tasks at the repository:** the `test` task's `run` in
   `.config/mise/tasks/standard.task.toml`, and any task its scripts had,
   such as a build, as a mise task. A check the shared steps lack becomes
   a local step in `.config/hk.pkl`, with `cache` and its `cache_inputs`.
6. **Install and check:** `bun install`, committing `bun.lock`; `mise
   install`, which also installs the hooks (ask the person to `mise
   trust` first if mise refuses the configuration); then `mise run format
   --all` and `mise run check --all` until both pass, and once more to see
   the cache hold.

Commit each step on its own where it stands alone, and open a pull
request: CI then runs the shared workflows against the new layout before
anything lands.

<!-- vim:set expandtab shiftwidth=2 filetype=markdown foldlevel=3: -->
