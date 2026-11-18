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
          keeping each version. All or nothing: any error writes nothing.
          Then reinstall, to update lockfiles.
  next    For one skill, read its state, the registry's included, and
          print the commands for its next step.

options:
  --root <dir>              the repository, by default the current directory
  --skills <dir>            the skills' directory, by default skills
  --scope <@scope>          the npm scope; by default the one every
                            existing skill package already uses
  --prefix <prefix>         the package name's prefix, by default skill-
  --package-manager <name>  npm, bun, pnpm or yarn; by default the root's
                            packageManager field, else its one lockfile
  --workflow <file>         the publishing workflow's file name, by
                            default publish.yaml
  --release-config <path>   by default .config/release-please.json
  --release-manifest <path> by default .config/release-please-manifest.json
  --online                  check: also ask npm whether each name is free
                            or already the repository's
  --pack                    check: also compare what npm would pack with
                            the files git tracks
  --dry-run                 write: say what it would write, write nothing
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
        packageManager: undefined,
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
        "--package-manager": "packageManager",
        "--workflow": "workflow",
        "--release-config": "releaseConfig",
        "--release-manifest": "releaseManifest",
    };
    const switches = {
        "--online": "online",
        "--pack": "pack",
        "--dry-run": "dryRun",
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "-h" || arg === "--help") {
            opts.command = "help";
        } else if (arg in switches) {
            opts[switches[arg]] = true;
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
    if ((opts.online || opts.pack) && opts.command !== "check") {
        throw new UsageError(
            "--online and --pack are check's; next always asks npm",
        );
    }
    if (opts.dryRun && opts.command !== "write")
        throw new UsageError("--dry-run is write's");
    if (
        opts.scope !== undefined &&
        !/^@[a-z0-9][a-z0-9._-]*$/.test(opts.scope)
    ) {
        throw new UsageError(
            `--scope ${opts.scope} is not an npm scope, such as @name`,
        );
    }
    if (!/^([a-z0-9][a-z0-9._-]*)?$/.test(opts.prefix)) {
        throw new UsageError(
            `--prefix ${opts.prefix} cannot begin an npm package name`,
        );
    }
    if (opts.packageManager !== undefined && !(opts.packageManager in RANGES)) {
        throw new UsageError(
            `--package-manager is one of ${Object.keys(RANGES).join(", ")}`,
        );
    }
    return opts;
}

// ------------------------------------------------------------ frontmatter

// The keys this script reads. Any other key's value is skipped when it is
// YAML this reader does not follow, as it is never used.
const USED = new Set(["name", "description", "license"]);

// Reads the frontmatter's top-level keys: plain, quoted and block scalars,
// with plain ones folded across lines as YAML folds them. What it cannot
// read exactly in a used key is an error, never a guess.
export function parseFrontmatter(text) {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    if (!match) throw new Error("no frontmatter between --- lines at the top");
    const lines = match[1].split(/\r?\n/);
    const out = {};
    const indented = (l) => l.trim() === "" || /^\s/.test(l);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "" || /^\s*#/.test(line)) continue;
        if (/^\s/.test(line)) continue; // inside a nested mapping skipped below
        const key = line.match(/^([A-Za-z0-9_-]+):(?:[ \t]+(.*))?$/);
        if (!key) throw new Error(`cannot read frontmatter line: ${line}`);
        const [, name, rest = ""] = key;
        const body = [];
        while (i + 1 < lines.length && indented(lines[i + 1]))
            body.push(lines[++i]);
        try {
            out[name] = readValue(name, rest.trim(), body);
        } catch (error) {
            if (USED.has(name)) throw error;
            out[name] = undefined;
        }
    }
    return out;
}

function readValue(name, rest, body) {
    const block = rest.match(/^([>|])([+-]?)([0-9]?)[+-]?[ \t]*(#.*)?$/);
    if (block) {
        if (block[3])
            throw new Error(
                `${name}'s block scalar has an indentation indicator, which this script does not read`,
            );
        return blockScalar(name, body, block[1], block[2]);
    }
    if (rest === "" || rest.startsWith("#")) return null; // a nested mapping or sequence, or empty
    const filled = body.filter((l) => l.trim() !== "");
    if (rest.startsWith("'") || rest.startsWith('"')) {
        if (filled.length)
            throw new Error(
                `${name}'s quoted value continues onto another line, which this script does not read`,
            );
        return quoted(name, rest);
    }
    if (/^[[{&*!%@`|>]/.test(rest))
        throw new Error(
            `${name}'s value is YAML this script does not read: ${rest}`,
        );
    if (
        USED.has(name) &&
        /^(true|false|null|~|[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?)$/i.test(
            rest,
        ) &&
        !filled.length
    ) {
        throw new Error(
            `${name} is ${rest}, which YAML reads as no string: quote it`,
        );
    }
    // A plain scalar folds: lines join with a space, an empty line is a newline.
    const parts = [
        rest.replace(/\s+#.*$/, ""),
        ...trimTrailing(body.map((l) => l.trim())),
    ];
    let value = "";
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === "") value += "\n";
        else if (i > 0 && parts[i - 1] !== "") value += ` ${part}`;
        else value += part;
    }
    return value;
}

function trimTrailing(lines) {
    const out = [...lines];
    while (out.length && out.at(-1) === "") out.pop();
    return out;
}

function blockScalar(name, body, style, chomp) {
    const filled = body.filter((l) => l.trim() !== "");
    if (!filled.length) return chomp === "+" ? "\n".repeat(body.length) : "";
    const indent = filled[0].match(/^ */)[0].length;
    if (filled.some((l) => l.match(/^ */)[0].length < indent)) {
        throw new Error(
            `${name}'s block scalar is less indented after its first line`,
        );
    }
    if (
        style === ">" &&
        filled.some((l) => l.match(/^ */)[0].length > indent)
    ) {
        throw new Error(
            `${name}'s folded scalar has a more-indented line, which this script does not read`,
        );
    }
    const lines = body.map((l) => (l.trim() === "" ? "" : l.slice(indent)));
    const content = trimTrailing(lines);
    const trailing = lines.length - content.length;
    let value;
    if (style === "|") {
        value = content.join("\n");
    } else {
        value = "";
        for (let i = 0; i < content.length; i++) {
            const line = content[i];
            if (line === "") value += "\n";
            else if (i > 0 && content[i - 1] !== "") value += ` ${line}`;
            else value += line;
        }
    }
    if (chomp === "-") return value;
    if (chomp === "+") return `${value}\n${"\n".repeat(trailing)}`;
    return `${value}\n`;
}

function quoted(name, text) {
    if (text.startsWith("'")) {
        const m = text.match(/^'((?:[^']|'')*)'\s*(#.*)?$/);
        if (!m) throw new Error(`cannot read ${name}'s single-quoted value`);
        return m[1].replace(/''/g, "'");
    }
    const m = text.match(/^("(?:[^"\\]|\\.)*")\s*(#.*)?$/);
    if (!m) throw new Error(`cannot read ${name}'s double-quoted value`);
    return JSON.parse(m[1]);
}

// ----------------------------------------------------------------- files

function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8"));
}

// The JSON text for a file, in its own indentation or the fallback's.
function jsonText(path, data, fallbackIndent) {
    const old = existsSync(path) ? readFileSync(path, "utf8") : "";
    const indent = old.match(/^\{\n([ \t]+)"/)?.[1] ?? fallbackIndent;
    return { old, text: `${JSON.stringify(data, null, indent)}\n` };
}

function sortedObject(object) {
    return Object.fromEntries(
        Object.entries(object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
}

function deepEqual(a, b) {
    const norm = (v) =>
        v && typeof v === "object" && !Array.isArray(v)
            ? sortedObject(
                  Object.fromEntries(
                      Object.entries(v).map(([k, x]) => [k, norm(x)]),
                  ),
              )
            : v;
    return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

function git(cwd, ...args) {
    return spawnSync("git", args, { cwd, encoding: "utf8" });
}

// Whether git ignores a path: no git, nothing to say.
function gitIgnores(root, path) {
    const r = git(root, "check-ignore", "-q", "--no-index", path);
    return r.error || r.status === 128 ? true : r.status === 0;
}

function gitTracks(root, path) {
    const r = git(root, "ls-files", "--error-unmatch", "--", path);
    return !r.error && r.status === 0;
}

// --------------------------------------------------------------- context

// The range a root lists a workspace package by: npm refuses the
// workspace: protocol, EUNSUPPORTEDPROTOCOL, and links any range the
// workspace satisfies.
const RANGES = {
    npm: "*",
    bun: "workspace:*",
    pnpm: "workspace:*",
    yarn: "workspace:*",
};

const LOCKFILES = {
    "package-lock.json": "npm",
    "npm-shrinkwrap.json": "npm",
    "bun.lock": "bun",
    "bun.lockb": "bun",
    "pnpm-lock.yaml": "pnpm",
    "yarn.lock": "yarn",
};

function packageManagerOf(opts, root, rootPkg) {
    if (opts.packageManager) return opts.packageManager;
    const field =
        typeof rootPkg.packageManager === "string"
            ? rootPkg.packageManager.split("@")[0]
            : undefined;
    if (field in RANGES) return field;
    const found = new Set(
        Object.entries(LOCKFILES)
            .filter(([f]) => existsSync(join(root, f)))
            .map(([, pm]) => pm),
    );
    return found.size === 1 ? [...found][0] : undefined;
}

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
    const pm = packageManagerOf(opts, root, rootPkg);
    return {
        opts,
        root,
        rootPath,
        rootPkg,
        repo,
        skillsPath,
        skillsRel: relative(root, skillsPath).split("\\").join("/"),
        all,
        skills: opts.skills.length ? opts.skills : all,
        scope,
        indent:
            readFileSync(rootPath, "utf8").match(/^\{\n([ \t]+)"/)?.[1] ?? "  ",
        packageManager: pm,
        workspaceRange: pm ? RANGES[pm] : undefined,
        configPath,
        config: existsSync(configPath) ? readJson(configPath) : undefined,
        manifestPath,
        manifest: existsSync(manifestPath) ? readJson(manifestPath) : undefined,
    };
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
            : "no skill package names a scope yet: pass --scope, such as --scope @yours",
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

// npm runs these during a publish, in the job holding the OIDC token.
const PUBLISH_LIFECYCLE = [
    "prepublish",
    "prepare",
    "prepublishOnly",
    "publish",
    "postpublish",
];

// A skill's own licence, by any of its usual names.
const LICENCE_FILE = /^(licence|license|copying)(\..*)?$/i;

// What npm ships from a package's own directory whatever files says.
const ALWAYS_PACKED = /^(licence|license)(\..*)?$/i;

const SEMVER =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(\.(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(\+[0-9a-zA-Z-]+(\.[0-9a-zA-Z-]+)*)?$/;

function skillOf(ctx, skill) {
    const dir = join(ctx.skillsPath, skill);
    const front = parseFrontmatter(readFileSync(join(dir, "SKILL.md"), "utf8"));
    const pkgPath = join(dir, "package.json");
    const pkg = existsSync(pkgPath) ? readJson(pkgPath) : undefined;
    const path = `${ctx.skillsRel}/${skill}`;
    const listing = readdirSync(dir).filter((e) => !e.startsWith("."));
    // A licence git tracks, or one it does not ignore, is the skill's own;
    // a LICENSE git ignores is the copy prepack makes.
    const ownLicense = listing.some(
        (e) =>
            LICENCE_FILE.test(e) &&
            (gitTracks(ctx.root, `${path}/${e}`) ||
                !gitIgnores(ctx.root, `${path}/${e}`)),
    );
    const entries = listing
        .filter((e) => e !== "package.json" && !ALWAYS_PACKED.test(e))
        .sort();
    const toRoot = relative(dir, ctx.root).split("\\").join("/") || ".";
    return {
        skill,
        dir,
        path,
        front,
        pkg,
        pkgPath,
        entries,
        ownLicense,
        prepack: `cp ${toRoot}/LICENSE LICENSE`,
        name: `${ctx.scope}/${ctx.opts.prefix}${skill}`,
    };
}

const POSTPACK = "rm LICENSE";

// The package.json the frontmatter implies, over what the file already has,
// and the problems that stop it being written.
function derivePackage(ctx, s) {
    const old = s.pkg ?? {};
    const errors = [];
    if (old.private !== undefined && typeof old.private !== "boolean") {
        errors.push(
            `package.json private is ${JSON.stringify(old.private)}, not true or false: npm and this script may disagree on whether it publishes`,
        );
    }
    const isPrivate = old.private === true;
    const scripts = { ...old.scripts };
    if (s.ownLicense) {
        if (scripts.prepack === s.prepack) delete scripts.prepack;
        if (scripts.postpack === POSTPACK) delete scripts.postpack;
    } else {
        for (const [hook, want] of [
            ["prepack", s.prepack],
            ["postpack", POSTPACK],
        ]) {
            if (
                scripts[hook] !== undefined &&
                scripts[hook] !== want &&
                !/^cp \S+\/LICENSE LICENSE$/.test(scripts[hook])
            ) {
                errors.push(
                    `package.json ${hook} is its own, ${JSON.stringify(scripts[hook])}: the licence copy would replace it; merge them by hand`,
                );
            }
        }
        scripts.prepack = s.prepack;
        scripts.postpack = POSTPACK;
    }
    for (const hook of PUBLISH_LIFECYCLE) {
        if (scripts[hook] !== undefined) {
            errors.push(
                `package.json runs ${hook} during npm publish, in the job holding the OIDC token: move it out of the package`,
            );
        }
    }
    const config = old.publishConfig ?? {};
    for (const key of Object.keys(config)) {
        if (!["access", "provenance"].includes(key)) {
            errors.push(
                `package.json publishConfig.${key} would change where or how publish.yaml publishes: remove it`,
            );
        }
    }
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
        scripts: Object.keys(scripts).length ? scripts : undefined,
        ...(isPrivate
            ? {}
            : {
                  publishConfig: {
                      access: "public",
                      // Absent on a package that already exists is npm's
                      // default, provenance where it can attest; a new one
                      // insists on it.
                      ...(s.pkg && !("provenance" in config)
                          ? {}
                          : { provenance: config.provenance ?? true }),
                  },
              }),
    };
    const pkg = {};
    for (const key of ORDER)
        if (derived[key] !== undefined) pkg[key] = derived[key];
    for (const [key, value] of Object.entries(old))
        if (!(key in pkg) && !ORDER.includes(key)) pkg[key] = value;
    return { pkg, errors };
}

// ---------------------------------------------------------------- checks

// The Agent Skills specification's name: lowercase letters, digits and
// single hyphens, at most 64; and Anthropic's reserved words.
function nameProblems(name, dir, packageName) {
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
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name))
        errors.push(
            `name ${name} is not lowercase letters, digits and single hyphens`,
        );
    if (/anthropic|claude/.test(name))
        errors.push(`name ${name} holds a word Anthropic reserves`);
    if (packageName.length > 214)
        errors.push(`package name ${packageName} is over npm's 214 characters`);
    if (!/^[a-z]+ing(-|$)/.test(name)) {
        warnings.push(
            `name ${name} does not open with a gerund, as processing-pdfs does; a suggestion, but it cannot change once published`,
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

function frontProblems(s) {
    const n = nameProblems(s.front.name, s.skill, s.name);
    const d = descriptionProblems(s.front.description);
    return {
        errors: [...n.errors, ...d.errors],
        warnings: [...n.warnings, ...d.warnings],
    };
}

function checkSkill(ctx, s) {
    const errors = [];
    const warnings = [];
    const front = frontProblems(s);
    errors.push(...front.errors);
    warnings.push(...front.warnings);
    if (!s.front.license)
        warnings.push("frontmatter has no license, which the package repeats");
    if (!s.pkg) {
        errors.push(`no ${s.path}/package.json: run write`);
        return { errors, warnings };
    }
    const { pkg: want, errors: derivation } = derivePackage(ctx, s);
    errors.push(...derivation);
    for (const key of [
        "name",
        "description",
        "homepage",
        "repository",
        "license",
        "scripts",
        "publishConfig",
    ]) {
        if (!deepEqual(s.pkg[key], want[key])) {
            errors.push(
                `package.json ${key} is ${JSON.stringify(s.pkg[key])}, not ${JSON.stringify(want[key])}: run write`,
            );
        }
    }
    if (typeof s.pkg.version !== "string" || !SEMVER.test(s.pkg.version)) {
        errors.push(
            `package.json version ${JSON.stringify(s.pkg.version)} is not semver`,
        );
    } else if (s.pkg.version.includes("-")) {
        errors.push(
            `version ${s.pkg.version} is a prerelease, which npm publishes only with a --tag that publish.yaml does not pass`,
        );
    }
    const files = [...(s.pkg.files ?? [])].sort();
    if (!deepEqual(files, s.entries)) {
        errors.push(
            `package.json files ${JSON.stringify(files)} are not the entries beside it, ${JSON.stringify(s.entries)}: run write`,
        );
    }
    if (!s.ownLicense) {
        if (!existsSync(join(ctx.root, "LICENSE")))
            errors.push(
                "no LICENSE of its own, and none at the root for prepack to copy",
            );
        if (!gitIgnores(ctx.root, `${s.path}/LICENSE`))
            warnings.push(
                `git does not ignore ${s.path}/LICENSE, which prepack copies in`,
            );
    }
    if (!ctx.workspaceRange) {
        if (
            !["*", "workspace:*"].includes(
                ctx.rootPkg.devDependencies?.[s.name],
            )
        ) {
            warnings.push(
                `the root does not list ${s.name} as a devDependency, so this repository does not sync it`,
            );
        }
    } else if (ctx.rootPkg.devDependencies?.[s.name] !== ctx.workspaceRange) {
        warnings.push(
            `the root does not list ${s.name} as a ${ctx.workspaceRange} devDependency, so this repository does not sync it`,
        );
    }
    if (ctx.config) {
        const entry = ctx.config.packages?.[s.path];
        const version = ctx.manifest?.[s.path];
        if (s.pkg.private === true) {
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
            for (const key of TAG_KEYS) {
                if (entry && key in entry)
                    errors.push(
                        `${ctx.opts.releaseConfig} sets ${key} for ${s.path}, changing the tag publish.yaml reads`,
                    );
            }
            if (version === undefined) {
                errors.push(
                    `${ctx.opts.releaseManifest} has no version for ${s.path}: run write`,
                );
            } else if (version !== s.pkg.version) {
                errors.push(
                    `${ctx.opts.releaseManifest} says ${version}, package.json ${s.pkg.version}: release-please keeps both, ` +
                        "and the manifest is its release baseline; make them agree by hand",
                );
            }
        }
    } else if (s.pkg.private !== true) {
        warnings.push(
            `no ${ctx.opts.releaseConfig}: nothing releases this package`,
        );
    }
    return { errors, warnings };
}

const TAG_KEYS = [
    "include-component-in-tag",
    "include-v-in-tag",
    "tag-separator",
];

function checkRepository(ctx) {
    const errors = [];
    const warnings = [];
    const workspaces = Array.isArray(ctx.rootPkg.workspaces)
        ? ctx.rootPkg.workspaces
        : ctx.rootPkg.workspaces?.packages;
    const glob = `${ctx.skillsRel}/*`;
    if (!workspaces?.includes(glob))
        errors.push(`the root's workspaces do not include ${glob}: run write`);
    if (!ctx.workspaceRange) {
        warnings.push(
            "cannot tell the package manager, from packageManager or one lockfile: write needs --package-manager",
        );
    }
    const managed = `${ctx.scope}/${ctx.opts.prefix}`;
    const names = new Set(ctx.all.map((skill) => `${managed}${skill}`));
    for (const dep of Object.keys(ctx.rootPkg.devDependencies ?? {})) {
        if (dep.startsWith(managed) && !names.has(dep)) {
            warnings.push(
                `the root lists ${dep}, which no skill here is: remove it, and if it was published, npm deprecate it`,
            );
        }
    }
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
        if (!ctx.manifest)
            errors.push(
                `${ctx.opts.releaseConfig} exists, but not ${ctx.opts.releaseManifest}: run write`,
            );
        const known = new Set(
            ctx.all.map((skill) => `${ctx.skillsRel}/${skill}`),
        );
        for (const path of new Set([
            ...Object.keys(c.packages ?? {}),
            ...Object.keys(ctx.manifest ?? {}),
        ])) {
            if (!known.has(path)) {
                errors.push(
                    path.startsWith(`${ctx.skillsRel}/`)
                        ? `release-please lists ${path}, which has no SKILL.md: run write to drop it`
                        : `release-please lists ${path}, outside ${ctx.skillsRel}/: not this script's to manage`,
                );
            }
        }
    }
    return { errors, warnings };
}

// --------------------------------------------------------------- registry

// What npm says of a name: not visible, or its versions, latest,
// repository and whether latest has provenance, or that it could not say.
function registry(ctx, name) {
    const r = spawnSync("npm", ["view", name, "--json"], {
        cwd: ctx.root,
        encoding: "utf8",
        timeout: 60_000,
    });
    if (r.error)
        return {
            inconclusive:
                r.error.code === "ETIMEDOUT"
                    ? "npm view timed out"
                    : r.error.message,
        };
    const text = `${r.stdout}${r.stderr}`;
    if (r.status !== 0) {
        // A 404 says no package is visible to you: not that the name is
        // yours to take, which only the scope's owner can be sure of.
        if (/\bE404\b/.test(text)) return { published: false };
        return {
            inconclusive:
                text.match(/npm error code (\S+)/)?.[1] ??
                `npm exited ${r.status}`,
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

function sameRepository(url, repo) {
    const m = url?.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
    return Boolean(m && m[1] === repo.owner && m[2] === repo.name);
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
        return [
            `npm pack failed: ${r.error?.message ?? `${r.stderr}`.trim().split("\n").at(-1)}`,
        ];
    const packed = new Set(JSON.parse(r.stdout)[0].files.map((f) => f.path));
    const tracked = git(s.dir, "ls-files", "-z", "--", ".");
    if (tracked.error || tracked.status !== 0)
        return [
            "cannot list the files git tracks, to compare with what npm packs",
        ];
    return tracked.stdout
        .split("\0")
        .filter(Boolean)
        .filter((f) => !packed.has(f))
        .map((f) => `npm would not pack ${s.path}/${f}`);
}

// -------------------------------------------------------------- commands

function report(skill, { errors, warnings }) {
    for (const e of errors) console.log(`error: ${skill}: ${e}`);
    for (const w of warnings) console.log(`warning: ${skill}: ${w}`);
}

function check(ctx) {
    let failed = false;
    const repository = checkRepository(ctx);
    report("repository", repository);
    failed ||= repository.errors.length > 0;
    for (const skill of ctx.skills) {
        let result;
        try {
            const s = skillOf(ctx, skill);
            result = checkSkill(ctx, s);
            if (ctx.opts.pack && s.pkg)
                result.errors.push(...packProblems(ctx, s));
            if (ctx.opts.online && s.pkg && s.pkg.private !== true) {
                const npm = registry(ctx, s.name);
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
        `${n} skill${n === 1 ? "" : "s"} checked${failed ? ": errors above" : ""}`,
    );
    return failed ? 1 : 0;
}

// Plans every file first, writes only if nothing in the plan is wrong.
function write(ctx) {
    const errors = [];
    if (!ctx.workspaceRange) {
        throw new UsageError(
            "cannot tell the package manager, from packageManager or one lockfile: pass --package-manager",
        );
    }
    const plan = new Map();
    const rootPkg = structuredClone(ctx.rootPkg);
    const glob = `${ctx.skillsRel}/*`;
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
    const dropped = [];
    if (config) {
        // Entries under the skills' directory are this script's to manage.
        const known = new Set(
            ctx.all.map((skill) => `${ctx.skillsRel}/${skill}`),
        );
        for (const table of [config.packages ?? {}, manifest]) {
            for (const path of Object.keys(table)) {
                if (path.startsWith(`${ctx.skillsRel}/`) && !known.has(path)) {
                    delete table[path];
                    dropped.push(path);
                }
            }
        }
    }

    for (const skill of ctx.skills) {
        let s;
        try {
            s = skillOf(ctx, skill);
        } catch (error) {
            errors.push(`${skill}: ${error.message}`);
            continue;
        }
        const front = frontProblems(s);
        const { pkg, errors: derivation } = derivePackage(ctx, s);
        const problems = [...front.errors, ...derivation];
        if (typeof pkg.version !== "string" || !SEMVER.test(pkg.version))
            problems.push(
                `version ${JSON.stringify(pkg.version)} is not semver`,
            );
        if (config && !pkg.private) {
            const recorded = manifest[s.path];
            if (recorded !== undefined && recorded !== pkg.version) {
                problems.push(
                    `${ctx.opts.releaseManifest} says ${recorded}, package.json ${pkg.version}: the manifest is release-please's baseline, ` +
                        "so write will not overwrite it; make them agree by hand",
                );
            }
        }
        if (problems.length) {
            errors.push(...problems.map((p) => `${skill}: ${p}`));
            continue;
        }
        plan.set(s.pkgPath, pkg);
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
        }
    }
    if (errors.length) {
        for (const e of errors) console.log(`error: ${e}`);
        console.log("nothing written");
        return 1;
    }
    plan.set(ctx.rootPath, rootPkg);
    if (config) {
        config.packages = sortedObject(config.packages ?? {});
        plan.set(ctx.configPath, config);
        plan.set(ctx.manifestPath, sortedObject(manifest));
    }
    const dry = ctx.opts.dryRun;
    let changed = 0;
    for (const [path, data] of plan) {
        const { old, text } = jsonText(path, data, ctx.indent);
        if (text === old) continue;
        changed++;
        if (!dry) writeFileSync(path, text);
        console.log(
            `${dry ? "would write" : "wrote"} ${relative(ctx.root, path)}`,
        );
    }
    for (const path of dropped)
        console.log(
            `${dry ? "would drop" : "dropped"} release-please's ${path}, which has no SKILL.md`,
        );
    if (!changed) console.log("nothing to write");
    else if (dry) console.log("dry run: nothing written");
    else
        console.log(
            "next: reinstall, so the lockfiles record the packages, then check",
        );
    return 0;
}

function next(ctx) {
    const skill = ctx.skills[0];
    const s = skillOf(ctx, skill);
    const result = checkSkill(ctx, s);
    const repository = checkRepository(ctx);
    report("repository", repository);
    report(skill, result);
    const script = relative(ctx.root, SELF);
    const say = (lines) => console.log(lines.join("\n"));
    if (result.errors.length || repository.errors.length) {
        say([
            "",
            "Fix the errors above first. Most are derived data:",
            `  node '${script}' write '${skill}'`,
        ]);
        return 1;
    }
    if (s.pkg.private === true) {
        say([
            "",
            `${skill} is private, so never published. To publish it: delete`,
            `"private" from ${s.path}/package.json, run write, which adds its`,
            "release-please entries, and commit it as a feat, so release-please",
            "proposes its next version; then run next again before merging that:",
            `  node '${script}' write '${skill}'`,
        ]);
        return 0;
    }
    const workflow = join(ctx.root, ".github", "workflows", ctx.opts.workflow);
    if (!existsSync(workflow) || !ctx.config) {
        say([
            "",
            "The release path is not here yet: copy the skill's assets/workflows/",
            `${ctx.opts.workflow} and release-please.yaml, and assets/release-please.json,`,
            "set the release App's credentials, and merge them before any trusted",
            "publisher exists: a new publisher has 2 days to publish once.",
        ]);
        return 1;
    }
    const npm = registry(ctx, s.name);
    const repo = `${ctx.repo.owner}/${ctx.repo.name}`;
    if (npm.inconclusive) {
        say([
            "",
            `npm could not say what it holds of ${s.name}: ${npm.inconclusive}`,
            "Check the network and your login, then run next again.",
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
            `No package ${s.name} is visible on npm.`,
            "Its name is permanent once published: this is the last chance to",
            "change it. A 404 means no package you can see, not that the scope's",
            "owner will let you publish it. Then, in order:",
            "",
            "1. Publish its first version by hand. If publishConfig insists on",
            "   provenance, which only CI can attest, waive it this once:",
            `     npm publish --workspace '${s.path}' --provenance=false`,
            `2. Give it a trusted publisher, with npm 11.15 or later and 2FA.`,
            "   npm stage publish is always allowed; --allow-publish adds npm",
            `   publish, if ${ctx.opts.workflow} runs that:`,
            `     npm trust github '${s.name}' --repo '${repo}' \\`,
            `         --file '${ctx.opts.workflow}' --allow-publish --yes`,
            "3. Within 2 days, publish once from that workflow, or the publisher",
            "   expires and must be made anew: merge the release pull request",
            "   release-please opens for the skill's feat commit.",
        ]);
        return 0;
    }
    const lines = [];
    if (npm.versions.includes(s.pkg.version)) {
        lines.push(
            "",
            `${s.pkg.version}, its version here, is already on npm: its next release`,
            "needs a commit that produces release notes, a feat, fix or Release-As.",
        );
    }
    if (!npm.provenance) {
        say([
            ...lines,
            "",
            `${s.name} is on npm, latest ${npm.latest}, without provenance: only a`,
            "hand publish so far. Check its trusted publisher, then publish once",
            "from CI within 2 days of making it, or it expires:",
            `  npm trust list '${s.name}'`,
            "Merge a release pull request for it, or with nothing to release, bump",
            "its version in a commit release-please does not count, a build:, run",
            "write, and once that is on main, publish a release, checking first",
            "that no such tag already points elsewhere:",
            `  gh release create '${ctx.opts.prefix}${skill}@<version>' --target '<main sha>' \\`,
            `      --title '${ctx.opts.prefix}${skill}: <version>' --notes '<why>'`,
        ]);
        return 0;
    }
    say([
        ...lines,
        "",
        `${s.name} releases through CI; its latest, ${npm.latest}, has provenance.`,
        `A commit touching ${s.path}/ that produces release notes, a feat,`,
        "fix or Release-As, makes release-please propose its next version;",
        "merging that pull request publishes it. To verify one:",
        `  npm view '${s.name}@<version>' --json | jq '{version, provenance: .dist.attestations.provenance.predicateType}'`,
    ]);
    return 0;
}

// ------------------------------------------------------------------ main

function main(argv) {
    try {
        const opts = parseArgs(argv);
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
