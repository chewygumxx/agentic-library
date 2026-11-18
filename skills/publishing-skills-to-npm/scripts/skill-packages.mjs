#!/usr/bin/env node
// vim:set expandtab shiftwidth=4 filetype=javascript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/skills/publishing-skills-to-npm/scripts/skill-packages.mjs
//
//

// Usage: skill-packages.mjs <check|write|next> [options] [<skill>...]
//
// Builds and checks each skill's npm package from its SKILL.md frontmatter,
// so the serialised data is derived rather than copied: its package.json,
// release-please's config and manifest entries, and the root's
// workspaces and devDependencies. Run with --help for the options.
//
// Node alone, no dependencies: it runs wherever npm publishes. It reads
// the subset of YAML that frontmatter uses, and refuses the rest rather
// than guess.

import { spawnSync } from "node:child_process";
import {
    existsSync,
    readdirSync,
    readFileSync,
    realpathSync,
    writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);

const USAGE = `usage: skill-packages.mjs <command> [options] [<skill>...]

commands:
  check   Check each skill's name, description and package, and its
          release-please entries, against its frontmatter. Exits 1 on an
          error; warnings alone exit 0.
  write   Write each skill's package.json, its release-please entries and
          the root's workspaces and devDependency from its frontmatter,
          keeping each version. Then reinstall, to update lockfiles.
          With --dry-run, say what it would write and write nothing.
  next    For one skill, read its state, the registry's included, and
          print the commands for its next step.

options:
  --root <dir>              the repository, by default the current directory
  --skills <dir>            the skills' directory, by default skills
  --scope <@scope>          the npm scope; by default the one every
                            existing skill package already uses
  --prefix <prefix>         the package name's prefix, by default skill-
  --workflow <file>         the publishing workflow's file name, by
                            default publish.yaml
  --release-config <path>   by default .config/release-please.json
  --release-manifest <path> by default .config/release-please-manifest.json
  --online                  check also asks npm whether each name is free
                            or already the repository's
  --pack                    check also lists what npm would pack, and
                            compares it with the files git tracks
  --dry-run                 write says what it would write, and writes
                            nothing
  -h, --help                this

No <skill> means every directory in the skills' directory with a SKILL.md.`;

// Thrown for what the user must fix in how the script was run.
class UsageError extends Error {}

// ---------------------------------------------------------------- options

function parseArgs(argv) {
    const opts = {
        command: undefined,
        skills: [],
        root: process.cwd(),
        skillsDir: "skills",
        scope: undefined,
        prefix: "skill-",
        workflow: "publish.yaml",
        releaseConfig: ".config/release-please.json",
        releaseManifest: ".config/release-please-manifest.json",
        online: false,
        pack: false,
        dryRun: false,
    };
    const valued = {
        "--root": "root",
        "--skills": "skillsDir",
        "--scope": "scope",
        "--prefix": "prefix",
        "--workflow": "workflow",
        "--release-config": "releaseConfig",
        "--release-manifest": "releaseManifest",
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "-h" || arg === "--help") {
            opts.command = "help";
        } else if (arg === "--online") {
            opts.online = true;
        } else if (arg === "--pack") {
            opts.pack = true;
        } else if (arg === "--dry-run") {
            opts.dryRun = true;
        } else if (arg in valued) {
            const value = argv[++i];
            if (value === undefined)
                throw new UsageError(`${arg} needs a value`);
            opts[valued[arg]] = value;
        } else if (arg.startsWith("-")) {
            throw new UsageError(`unknown option ${arg}`);
        } else if (opts.command === undefined) {
            opts.command = arg;
        } else {
            opts.skills.push(arg);
        }
    }
    if (opts.command === "help") return opts;
    if (!["check", "write", "next"].includes(opts.command ?? "")) {
        throw new UsageError(
            opts.command ? `unknown command ${opts.command}` : "no command",
        );
    }
    if (opts.command === "next" && opts.skills.length !== 1) {
        throw new UsageError("next takes exactly one skill");
    }
    if (
        opts.scope !== undefined &&
        !/^@[a-z0-9][a-z0-9._-]*$/.test(opts.scope)
    ) {
        throw new UsageError(
            `--scope ${opts.scope} is not an npm scope, such as @name`,
        );
    }
    return opts;
}

// ------------------------------------------------------------ frontmatter

// Reads the frontmatter's top-level keys: plain, quoted and block scalars.
// A nested mapping, such as metadata, is skipped; anything else unread is
// an error, so a value is never guessed.
export function parseFrontmatter(text) {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    if (!match) throw new Error("no frontmatter between --- lines at the top");
    const lines = match[1].split(/\r?\n/);
    const out = {};
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "" || /^\s*#/.test(line)) continue;
        if (/^\s/.test(line)) continue; // inside a nested mapping skipped below
        const key = line.match(/^([A-Za-z0-9_-]+):(?:[ \t]+(.*))?$/);
        if (!key) throw new Error(`cannot read frontmatter line: ${line}`);
        const [, name, rest = ""] = key;
        const block = rest.match(/^([>|])([+-]?)[ \t]*(#.*)?$/);
        if (block) {
            const body = [];
            while (
                i + 1 < lines.length &&
                (lines[i + 1].trim() === "" || /^\s/.test(lines[i + 1]))
            ) {
                body.push(lines[++i]);
            }
            out[name] = blockScalar(body, block[1], block[2]);
        } else if (rest.trim() === "" || /^#/.test(rest.trim())) {
            out[name] = null; // a nested mapping or sequence, or empty
        } else {
            out[name] = flowScalar(rest, name);
        }
    }
    return out;
}

function blockScalar(body, style, chomp) {
    const filled = body.filter((l) => l.trim() !== "");
    const indent = Math.min(...filled.map((l) => l.match(/^ */)[0].length));
    const lines = body.map((l) => (l.trim() === "" ? "" : l.slice(indent)));
    while (lines.length && lines.at(-1) === "") lines.pop();
    let value;
    if (style === "|") {
        value = lines.join("\n");
    } else {
        // Folded: a line break between two lines of text becomes a space;
        // each empty line, a newline.
        value = "";
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line === "") value += "\n";
            else if (i > 0 && lines[i - 1] !== "") value += ` ${line}`;
            else value += line;
        }
    }
    return chomp === "-" ? value : `${value}\n`;
}

function flowScalar(raw, name) {
    const text = raw.trim();
    if (text.startsWith("'")) {
        const m = text.match(/^'((?:[^']|'')*)'\s*(#.*)?$/);
        if (!m) throw new Error(`cannot read ${name}'s single-quoted value`);
        return m[1].replace(/''/g, "'");
    }
    if (text.startsWith('"')) {
        const m = text.match(/^("(?:[^"\\]|\\.)*")\s*(#.*)?$/);
        if (!m) throw new Error(`cannot read ${name}'s double-quoted value`);
        return JSON.parse(m[1]);
    }
    if (/^[[{&*!%@`]/.test(text)) {
        throw new Error(
            `${name}'s value is YAML this script does not read: ${text}`,
        );
    }
    return text.replace(/\s+#.*$/, "");
}

// ----------------------------------------------------------------- files

function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8"));
}

// Writes JSON in the file's own indentation, or the fallback's, unless
// dry; either way, says whether it differs.
function writeJson(path, data, fallbackIndent, dry = false) {
    const old = existsSync(path) ? readFileSync(path, "utf8") : "";
    const indent = old.match(/^\{\n([ \t]+)"/)?.[1] ?? fallbackIndent;
    const text = `${JSON.stringify(data, null, indent)}\n`;
    if (text === old) return false;
    if (!dry) writeFileSync(path, text);
    return true;
}

function sortedObject(object) {
    return Object.fromEntries(
        Object.entries(object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
}

function deepEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

// --------------------------------------------------------------- context

function loadContext(opts) {
    const root = opts.root;
    const rootPath = join(root, "package.json");
    if (!existsSync(rootPath))
        throw new UsageError(`no package.json in ${root}`);
    const rootPkg = readJson(rootPath);
    const repo = repositoryOf(rootPkg);
    const skillsPath = join(root, opts.skillsDir);
    if (!existsSync(skillsPath))
        throw new UsageError(`no ${opts.skillsDir}/ in ${root}`);
    const all = readdirSync(skillsPath, { withFileTypes: true })
        .filter(
            (e) =>
                e.isDirectory() &&
                existsSync(join(skillsPath, e.name, "SKILL.md")),
        )
        .map((e) => e.name)
        .sort();
    for (const skill of opts.skills) {
        if (!all.includes(skill))
            throw new UsageError(`no ${opts.skillsDir}/${skill}/SKILL.md`);
    }
    const scope = opts.scope ?? inferScope(skillsPath, all);
    const configPath = join(root, opts.releaseConfig);
    const manifestPath = join(root, opts.releaseManifest);
    return {
        opts,
        root,
        rootPath,
        rootPkg,
        repo,
        skillsPath,
        skills: opts.skills.length ? opts.skills : all,
        scope,
        indent:
            readFileSync(rootPath, "utf8").match(/^\{\n([ \t]+)"/)?.[1] ?? "  ",
        workspaceRange: workspaceRangeOf(root),
        configPath,
        config: existsSync(configPath) ? readJson(configPath) : undefined,
        manifestPath,
        manifest: existsSync(manifestPath) ? readJson(manifestPath) : undefined,
    };
}

// npm refuses the workspace: protocol, EUNSUPPORTEDPROTOCOL, and links a
// workspace by any range it satisfies; Bun, pnpm and Yarn take workspace:*.
function workspaceRangeOf(root) {
    const others = ["bun.lock", "bun.lockb", "pnpm-lock.yaml", "yarn.lock"];
    const npm = ["package-lock.json", "npm-shrinkwrap.json"];
    const has = (f) => existsSync(join(root, f));
    return npm.some(has) && !others.some(has) ? "*" : "workspace:*";
}

// The GitHub owner and repository, from the root's repository field.
function repositoryOf(rootPkg) {
    const field = rootPkg.repository;
    const url = typeof field === "string" ? field : field?.url;
    const m = url?.match(
        /^(?:github:|(?:git\+)?(?:https?|ssh|git):\/\/(?:git@)?github\.com\/|git@github\.com:)([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
    );
    if (!m) {
        throw new UsageError(
            'the root package.json needs "repository" on GitHub, such as "git+https://github.com/<owner>/<repo>.git"',
        );
    }
    return {
        owner: m[1],
        name: m[2],
        url: `git+https://github.com/${m[1]}/${m[2]}.git`,
    };
}

function inferScope(skillsPath, skills) {
    const scopes = new Set();
    for (const skill of skills) {
        const path = join(skillsPath, skill, "package.json");
        const name = existsSync(path) ? readJson(path).name : undefined;
        const m = typeof name === "string" ? name.match(/^(@[^/]+)\//) : null;
        if (m) scopes.add(m[1]);
    }
    if (scopes.size === 1) return [...scopes][0];
    throw new UsageError(
        scopes.size
            ? `skill packages use several scopes, ${[...scopes].join(", ")}: pass --scope`
            : "no skill package names a scope yet: pass --scope",
    );
}

// --------------------------------------------------------------- deriving

const ORDER = [
    "name",
    "version",
    "private",
    "description",
    "keywords",
    "homepage",
    "repository",
    "license",
    "files",
    "scripts",
    "publishConfig",
];

const PREPACK = "cp ../../LICENSE LICENSE";
const POSTPACK = "rm LICENSE";

// npm ships a LICENSE only from the package's own directory, so a skill
// sharing the repository's copies it in to pack; one with its own does not.
function licenceScripts(scripts = {}, ownLicense = false) {
    const out = { ...scripts };
    if (ownLicense) {
        if (out.prepack === PREPACK) delete out.prepack;
        if (out.postpack === POSTPACK) delete out.postpack;
    } else {
        out.prepack = PREPACK;
        out.postpack = POSTPACK;
    }
    return Object.keys(out).length ? out : undefined;
}

function skillOf(ctx, skill) {
    const dir = join(ctx.skillsPath, skill);
    const front = parseFrontmatter(readFileSync(join(dir, "SKILL.md"), "utf8"));
    const pkgPath = join(dir, "package.json");
    const pkg = existsSync(pkgPath) ? readJson(pkgPath) : undefined;
    const path = relative(ctx.root, dir).split("\\").join("/");
    const entries = readdirSync(dir)
        .filter(
            (e) =>
                !["package.json", "LICENSE"].includes(e) && !e.startsWith("."),
        )
        .sort();
    // A LICENSE git tracks is the skill's own: npm ships it, and the
    // licence copy would overwrite it, then delete it.
    const ownLicense =
        existsSync(join(dir, "LICENSE")) &&
        !gitIgnores(ctx.root, join(path, "LICENSE"));
    return {
        skill,
        dir,
        path,
        front,
        pkg,
        pkgPath,
        entries,
        ownLicense,
        name: `${ctx.scope}/${ctx.opts.prefix}${skill}`,
    };
}

// The package.json the frontmatter implies, over what the file already has.
function derivePackage(ctx, s) {
    const old = s.pkg ?? {};
    const isPrivate = old.private === true;
    const derived = {
        name: s.name,
        version: old.version ?? "0.0.1",
        ...(isPrivate ? { private: true } : {}),
        description: s.front.description ?? "",
        keywords: old.keywords ?? ["agent-skills"],
        homepage: `https://github.com/${ctx.repo.owner}/${ctx.repo.name}/blob/main/${s.path}/SKILL.md`,
        repository: { type: "git", url: ctx.repo.url, directory: s.path },
        license: s.front.license ?? old.license,
        files: s.entries,
        scripts: licenceScripts(old.scripts, s.ownLicense),
        ...(isPrivate
            ? {}
            : {
                  publishConfig: {
                      ...old.publishConfig,
                      access: "public",
                      provenance: true,
                  },
              }),
    };
    const out = {};
    for (const key of ORDER)
        if (derived[key] !== undefined) out[key] = derived[key];
    for (const [key, value] of Object.entries(old))
        if (!(key in out) && !ORDER.includes(key)) out[key] = value;
    return out;
}

// ---------------------------------------------------------------- checks

// The Agent Skills specification's name: lowercase letters, digits and
// single hyphens, at most 64; and Anthropic's reserved words.
function nameProblems(name, dir) {
    const errors = [];
    const warnings = [];
    if (typeof name !== "string" || name === "") {
        errors.push("frontmatter has no name");
        return { errors, warnings };
    }
    if (name !== dir)
        errors.push(
            `name ${name} is not its directory's, ${dir}: sync installs it as ${name}`,
        );
    if (name.length > 64)
        errors.push(`name is ${name.length} characters; at most 64`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
        errors.push(
            `name ${name} is not lowercase letters, digits and single hyphens`,
        );
    }
    if (/anthropic|claude/.test(name))
        errors.push(`name ${name} holds a word Anthropic reserves`);
    if (!/^[a-z]+ing(-|$)/.test(name)) {
        warnings.push(
            `name ${name} does not open with a gerund, as processing-pdfs does: it is permanent once published`,
        );
    }
    return { errors, warnings };
}

function descriptionProblems(description) {
    const errors = [];
    const warnings = [];
    if (typeof description !== "string" || description.trim() === "") {
        errors.push("frontmatter has no description");
        return { errors, warnings };
    }
    if (description.length > 1024)
        errors.push(
            `description is ${description.length} characters; at most 1024`,
        );
    if (/<\/?[A-Za-z][^>]*>/.test(description))
        errors.push("description holds an XML tag, which Anthropic rejects");
    if (!/\bUse when\b/.test(description)) {
        warnings.push(
            "description never says when to use the skill, as a 'Use when ...' sentence would",
        );
    } else if (/^Use when\b/.test(description)) {
        warnings.push(
            "description says when to use the skill but not first what it does",
        );
    }
    return { errors, warnings };
}

function checkSkill(ctx, s) {
    const errors = [];
    const warnings = [];
    const add = (p) => {
        errors.push(...p.errors);
        warnings.push(...p.warnings);
    };
    add(nameProblems(s.front.name, s.skill));
    add(descriptionProblems(s.front.description));
    if (!s.front.license)
        warnings.push("frontmatter has no license, which the package repeats");

    if (!s.pkg) {
        errors.push(`no ${s.path}/package.json: run write`);
        return { errors, warnings };
    }
    const want = derivePackage(ctx, s);
    for (const key of [
        "name",
        "description",
        "homepage",
        "repository",
        "license",
    ]) {
        if (!deepEqual(s.pkg[key], want[key])) {
            errors.push(
                `package.json ${key} is ${JSON.stringify(s.pkg[key])}, not ${JSON.stringify(want[key])}: run write`,
            );
        }
    }
    if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(s.pkg.version ?? "")) {
        errors.push(
            `package.json version ${JSON.stringify(s.pkg.version)} is not semver`,
        );
    }
    const files = [...(s.pkg.files ?? [])].sort();
    if (!deepEqual(files, s.entries)) {
        errors.push(
            `package.json files ${JSON.stringify(files)} are not the entries beside it, ${JSON.stringify(s.entries)}: run write`,
        );
    }
    if (s.ownLicense) {
        if (
            s.pkg.scripts?.prepack === PREPACK ||
            s.pkg.scripts?.postpack === POSTPACK
        ) {
            errors.push(
                "its own LICENSE would be overwritten by prepack's copy, then deleted: run write",
            );
        }
    } else if (
        s.pkg.scripts?.prepack !== PREPACK ||
        s.pkg.scripts?.postpack !== POSTPACK
    ) {
        errors.push(
            "package.json does not copy in the licence to pack, as npm ships one only from the package's own directory: run write",
        );
    }
    const isPrivate = s.pkg.private === true;
    if (isPrivate && s.pkg.publishConfig)
        errors.push("a private package has a publishConfig");
    if (
        !isPrivate &&
        (s.pkg.publishConfig?.access !== "public" ||
            s.pkg.publishConfig?.provenance !== true)
    ) {
        errors.push(
            'package.json publishConfig is not {"access": "public", "provenance": true}: run write',
        );
    }
    if (!s.ownLicense && !gitIgnores(ctx.root, join(s.path, "LICENSE"))) {
        warnings.push(
            `git does not ignore ${s.path}/LICENSE, which prepack copies in`,
        );
    }

    const dev = ctx.rootPkg.devDependencies?.[s.name];
    if (dev !== ctx.workspaceRange) {
        warnings.push(
            `the root does not list ${s.name} as a ${ctx.workspaceRange} devDependency, so this repository does not sync it`,
        );
    }

    if (ctx.config) {
        const entry = ctx.config.packages?.[s.path];
        const version = ctx.manifest?.[s.path];
        if (isPrivate) {
            if (entry)
                errors.push(
                    `private, but a release-please package in ${ctx.opts.releaseConfig}`,
                );
            if (version)
                errors.push(`private, but in ${ctx.opts.releaseManifest}`);
        } else {
            const component = `${ctx.opts.prefix}${s.skill}`;
            if (entry?.component !== component) {
                errors.push(
                    `${ctx.opts.releaseConfig} has no package ${s.path} with component ${component}: run write`,
                );
            }
            if (version !== s.pkg.version) {
                errors.push(
                    `${ctx.opts.releaseManifest} says ${version ?? "nothing"}, package.json ${s.pkg.version}: run write`,
                );
            }
        }
    } else if (!isPrivate) {
        warnings.push(
            `no ${ctx.opts.releaseConfig}: nothing releases this package`,
        );
    }
    return { errors, warnings };
}

function checkRepository(ctx) {
    const errors = [];
    const workspaces = Array.isArray(ctx.rootPkg.workspaces)
        ? ctx.rootPkg.workspaces
        : ctx.rootPkg.workspaces?.packages;
    const glob = `${ctx.opts.skillsDir}/*`;
    if (!workspaces?.includes(glob))
        errors.push(`the root's workspaces do not include ${glob}: run write`);
    if (ctx.config) {
        const c = ctx.config;
        if (
            c["include-component-in-tag"] !== true ||
            c["include-v-in-tag"] !== false ||
            c["tag-separator"] !== "@"
        ) {
            errors.push(
                `${ctx.opts.releaseConfig} must tag ${ctx.opts.prefix}<skill>@<version>, which publishing reads back: ` +
                    'set "include-component-in-tag": true, "include-v-in-tag": false and "tag-separator": "@"',
            );
        }
        const known = new Set(
            readdirSync(ctx.skillsPath).map(
                (d) => `${relative(ctx.root, ctx.skillsPath)}/${d}`,
            ),
        );
        for (const path of [
            ...Object.keys(c.packages ?? {}),
            ...Object.keys(ctx.manifest ?? {}),
        ]) {
            if (!known.has(path))
                errors.push(`release-please lists ${path}, which is no skill`);
        }
    }
    return errors;
}

function gitIgnores(root, path) {
    const r = spawnSync("git", ["check-ignore", "-q", "--no-index", path], {
        cwd: root,
    });
    return r.error || r.status === 128 ? true : r.status === 0; // no git: nothing to say
}

// --------------------------------------------------------------- registry

// What npm says of a name: absent, or its versions, latest, repository
// and whether latest has provenance.
function registry(name) {
    const r = spawnSync("npm", ["view", name, "--json"], { encoding: "utf8" });
    if (r.error) throw new Error(`cannot run npm: ${r.error.message}`);
    const text = `${r.stdout}${r.stderr}`;
    if (r.status !== 0) {
        // A 404 says no package is visible to you: not that the name is
        // yours to take, which only the scope's owner can be sure of.
        if (/E404|404 Not Found/.test(text)) return { published: false };
        return {
            inconclusive:
                text.trim().split("\n").at(-1) || `npm exited ${r.status}`,
        };
    }
    const data = JSON.parse(r.stdout);
    const url =
        typeof data.repository === "string"
            ? data.repository
            : data.repository?.url;
    return {
        published: true,
        versions: [].concat(data.versions ?? []),
        latest: data["dist-tags"]?.latest,
        repository: url,
        provenance: Boolean(data.dist?.attestations?.provenance),
    };
}

// What npm would pack, scripts off so nothing is copied in, against the
// files git tracks in the skill: an .npmignore, a symlink or a files
// entry can each drop one silently.
function packProblems(ctx, s) {
    const r = spawnSync(
        "npm",
        [
            "pack",
            "--dry-run",
            "--json",
            "--ignore-scripts",
            "--workspace",
            s.path,
        ],
        {
            cwd: ctx.root,
            encoding: "utf8",
        },
    );
    if (r.error || r.status !== 0)
        return [`npm pack failed: ${`${r.stderr}`.trim().split("\n").at(-1)}`];
    const packed = new Set(JSON.parse(r.stdout)[0].files.map((f) => f.path));
    const git = spawnSync("git", ["ls-files", "-z", "--", "."], {
        cwd: s.dir,
        encoding: "utf8",
    });
    if (git.error || git.status !== 0) return [];
    const tracked = git.stdout.split("\0").filter(Boolean);
    return tracked
        .filter((f) => !packed.has(f))
        .map((f) => `npm would not pack ${s.path}/${f}`);
}

function sameRepository(url, repo) {
    const m = url?.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
    return Boolean(m && m[1] === repo.owner && m[2] === repo.name);
}

// -------------------------------------------------------------- commands

function report(skill, { errors, warnings }) {
    for (const e of errors) console.log(`error: ${skill}: ${e}`);
    for (const w of warnings) console.log(`warning: ${skill}: ${w}`);
}

function check(ctx) {
    let failed = false;
    const repoErrors = checkRepository(ctx);
    report("repository", { errors: repoErrors, warnings: [] });
    failed ||= repoErrors.length > 0;
    for (const skill of ctx.skills) {
        let result;
        try {
            const s = skillOf(ctx, skill);
            result = checkSkill(ctx, s);
            if (ctx.opts.pack && s.pkg)
                result.errors.push(...packProblems(ctx, s));
            if (ctx.opts.online && s.pkg && s.pkg.private !== true) {
                const npm = registry(s.name);
                if (npm.inconclusive)
                    result.warnings.push(
                        `npm could not say whether ${s.name} is free: ${npm.inconclusive}`,
                    );
                if (
                    npm.published &&
                    !sameRepository(npm.repository, ctx.repo)
                ) {
                    result.errors.push(
                        `${s.name} is already on npm from ${npm.repository ?? "an unknown repository"}`,
                    );
                }
            }
        } catch (error) {
            result = { errors: [error.message], warnings: [] };
        }
        report(skill, result);
        failed ||= result.errors.length > 0;
    }
    const n = ctx.skills.length;
    console.log(
        failed
            ? `${n} skill${n === 1 ? "" : "s"} checked: errors above`
            : `${n} skill${n === 1 ? "" : "s"} checked`,
    );
    return failed ? 1 : 0;
}

function write(ctx) {
    const changed = [];
    let failed = false;
    const rootPkg = structuredClone(ctx.rootPkg);
    const glob = `${ctx.opts.skillsDir}/*`;
    if (Array.isArray(rootPkg.workspaces)) {
        if (!rootPkg.workspaces.includes(glob)) rootPkg.workspaces.push(glob);
    } else if (rootPkg.workspaces?.packages) {
        if (!rootPkg.workspaces.packages.includes(glob))
            rootPkg.workspaces.packages.push(glob);
    } else {
        rootPkg.workspaces = [glob];
    }
    const config = ctx.config ? structuredClone(ctx.config) : undefined;
    const manifest = ctx.config
        ? structuredClone(ctx.manifest ?? {})
        : undefined;

    for (const skill of ctx.skills) {
        let s;
        try {
            s = skillOf(ctx, skill);
            const names = nameProblems(s.front.name, skill);
            const descriptions = descriptionProblems(s.front.description);
            if (names.errors.length || descriptions.errors.length) {
                report(skill, {
                    errors: [...names.errors, ...descriptions.errors],
                    warnings: [],
                });
                failed = true;
                continue;
            }
        } catch (error) {
            report(skill, { errors: [error.message], warnings: [] });
            failed = true;
            continue;
        }
        const pkg = derivePackage(ctx, s);
        if (writeJson(s.pkgPath, pkg, ctx.indent, ctx.opts.dryRun))
            changed.push(relative(ctx.root, s.pkgPath));
        rootPkg.devDependencies = sortedObject({
            ...rootPkg.devDependencies,
            [s.name]: ctx.workspaceRange,
        });
        if (config) {
            config.packages ??= {};
            if (pkg.private) {
                delete config.packages[s.path];
                delete manifest[s.path];
            } else {
                config.packages[s.path] = {
                    ...config.packages[s.path],
                    component: `${ctx.opts.prefix}${skill}`,
                };
                manifest[s.path] = pkg.version;
            }
            config.packages = sortedObject(config.packages);
        }
    }
    const dry = ctx.opts.dryRun;
    if (writeJson(ctx.rootPath, rootPkg, ctx.indent, dry))
        changed.push("package.json");
    if (config) {
        if (writeJson(ctx.configPath, config, ctx.indent, dry))
            changed.push(ctx.opts.releaseConfig);
        if (
            writeJson(ctx.manifestPath, sortedObject(manifest), ctx.indent, dry)
        )
            changed.push(ctx.opts.releaseManifest);
    }
    for (const path of changed)
        console.log(`${dry ? "would write" : "wrote"} ${path}`);
    if (changed.length && dry) {
        console.log("dry run: nothing written");
    } else if (changed.length) {
        console.log(
            "next: reinstall, so the lockfiles record the packages, then check",
        );
    } else if (!failed) {
        console.log("nothing to write");
    }
    return failed ? 1 : 0;
}

function next(ctx) {
    const skill = ctx.skills[0];
    const s = skillOf(ctx, skill);
    const result = checkSkill(ctx, s);
    report(skill, result);
    const script = relative(ctx.root, SELF);
    const say = (lines) => console.log(lines.join("\n"));
    if (result.errors.length) {
        say([
            "",
            "Fix the errors above first. Most are derived data:",
            `  node ${script} write ${skill}`,
        ]);
        return 1;
    }
    if (s.pkg.private === true) {
        say([
            "",
            `${skill} is private, so never published. To publish it, delete`,
            `"private" from ${s.path}/package.json, then:`,
            `  node ${script} write ${skill}`,
            "and commit it as a feat, so release-please proposes its next version.",
        ]);
        return 0;
    }
    const npm = registry(s.name);
    const repo = `${ctx.repo.owner}/${ctx.repo.name}`;
    if (npm.inconclusive) {
        say([
            "",
            `npm could not say what it holds of ${s.name}: ${npm.inconclusive}`,
            "Check your network and login, then run next again.",
        ]);
        return 1;
    }
    if (npm.published && !sameRepository(npm.repository, ctx.repo)) {
        say([
            "",
            `${s.name} is already on npm, from ${npm.repository ?? "an unknown repository"}: choose another name.`,
        ]);
        return 1;
    }
    if (!npm.published) {
        say([
            "",
            `No package ${s.name} is visible on npm. Its name is permanent once`,
            "published, so this is the last chance to change it. A trusted",
            "publisher then has 2 days to publish once, so have the release path",
            "ready first: the workflows on main, the release App's credentials",
            "set, immutable releases on. Then, in order:",
            "",
            "1. Publish its first version by hand. publishConfig insists on",
            "   provenance, which only CI can attest, so waive it this once:",
            `     npm publish --workspace ${s.path} --provenance=false`,
            "2. Give it a trusted publisher. npm stage publish is always allowed;",
            `   --allow-publish adds npm publish, if ${ctx.opts.workflow} runs that:`,
            `     npm trust github ${s.name} --repo ${repo} \\`,
            `         --file ${ctx.opts.workflow} --allow-publish --yes`,
            "3. Within 2 days, publish once from that workflow, or the publisher",
            "   expires and must be made anew: merge the release pull request",
            "   release-please opens for the skill's feat commit.",
        ]);
        return 0;
    }
    if (!npm.provenance) {
        say([
            "",
            `${s.name} is on npm, latest ${npm.latest}, without provenance: only`,
            "a hand publish so far. Check its trusted publisher, then publish once",
            "from CI within 2 days of making it, or it expires:",
            `  npm trust list ${s.name}`,
            "Merge a release pull request for it, or, with nothing to release,",
            "bump its version in a commit release-please does not count (build:),",
            "run write, and once on main publish a release:",
            `  gh release create '${ctx.opts.prefix}${skill}@<version>' --target <main sha> \\`,
            `      --title '${ctx.opts.prefix}${skill}: <version>' --notes '<why>'`,
        ]);
        return 0;
    }
    say([
        "",
        `${s.name} releases through CI: latest ${npm.latest}, with provenance.`,
        `A feat or fix touching ${s.path}/ makes release-please propose its`,
        "next version; merging that pull request publishes it. To verify one:",
        `  npm view ${s.name}@<version> --json | jq '{version, provenance: .dist.attestations.provenance.predicateType}'`,
    ]);
    return 0;
}

// ------------------------------------------------------------------ main

function main(argv) {
    let opts;
    try {
        opts = parseArgs(argv);
        if (opts.command === "help") {
            console.log(USAGE);
            return 0;
        }
        const ctx = loadContext(opts);
        return { check, write, next }[opts.command](ctx);
    } catch (error) {
        if (error instanceof UsageError) {
            console.error(`skill-packages.mjs: ${error.message}\n\n${USAGE}`);
            return 2;
        }
        console.error(`skill-packages.mjs: ${error.message}`);
        return 1;
    }
}

// Run as a command, not when imported, as by a test of its parser.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(SELF)) {
    process.exitCode = main(process.argv.slice(2));
}
