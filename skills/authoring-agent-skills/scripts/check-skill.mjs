#!/usr/bin/env node
// vim:set expandtab shiftwidth=4 filetype=javascript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/skills/authoring-agent-skills/scripts/check-skill.mjs
//
//

// Usage: check-skill.mjs [options] <skill-dir|skills-dir>...
//
// Checks agent skills against the Agent Skills specification, the limits
// of the client they target, and the authoring practices their sources
// agree on, so an agent need not hold the rules in mind while writing.
// Run with --help for the options and what each finding's level means.
//
// Node alone and read-only. Frontmatter is read by the yaml package,
// bundled in vendor/ under its own licence, so its YAML is YAML's, not a
// subset's.

import { spawnSync } from "node:child_process";
import {
    existsSync,
    lstatSync,
    readdirSync,
    readFileSync,
    statSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { parseDocument } from "./vendor/yaml.mjs";

const USAGE = `usage: check-skill.mjs [options] <skill-dir|skills-dir>...

Checks each skill directory, or each directory holding a SKILL.md inside
a skills directory, and prints one finding per line:
  <skill> <error|warning> <code> <file>[:<line>] <message>

options:
  --target <any|portable|claude-code>
                Which clients the skill must load in; default any.
  --json        Print the findings as one JSON array instead.
  --strict      Exit 1 on warnings too.
  --run-help    Also run each executable script with --help, expecting
                exit 0 and some output within 10 seconds. Runs code from
                the skill: use it on skills you trust.
  --ignore <code>
                Skip a finding's code; repeatable.
  -h, --help    Show this help.

Exit codes: 0 no errors; 1 errors, or warnings with --strict; 2 a bad
option or a path holding no skill.

Errors are what the target refuses; warnings, practices a skill may
break on purpose, and limits only some clients enforce:
  any          Errors: what the Agent Skills specification forbids.
               Keys and forms only some clients accept are warnings.
               For a collection of skills with different targets.
  portable     Also errors: anything claude.ai or the Claude API refuse
               on upload, such as a key outside the specification, a
               name holding anthropic or claude, or an XML tag in the
               description. For a skill meant for every client.
  claude-code  Claude Code's own keys and forms pass; the rest as any.`;

const TARGETS = ["any", "portable", "claude-code"];

// The specification's fields, which every client accepts.
const SPEC_KEYS = new Set([
    "name",
    "description",
    "license",
    "compatibility",
    "metadata",
    "allowed-tools",
]);

// Claude Code's own fields. claude.ai, the Claude API and Anthropic's
// packager reject a skill holding any, and other clients ignore them.
const CLAUDE_CODE_KEYS = new Set([
    "when_to_use",
    "argument-hint",
    "arguments",
    "disable-model-invocation",
    "user-invocable",
    "disallowed-tools",
    "model",
    "effort",
    "context",
    "agent",
    "background",
    "hooks",
    "paths",
    "shell",
]);

// Words ending in -ing that are no gerund.
const ING_NOUNS =
    /^(thing|string|king|ring|spring|wing|ping|sling|sting|swing|ceiling|evening|morning|nothing|something|anything|everything)$/;

const VAGUE_NAMES =
    /^(helper|helpers|utils|utilities|tools|documents|data|files|misc|stuff|common)$/;

// Agent Skills recommends a SKILL.md body under 500 lines and 5,000
// tokens; Anthropic a table of contents atop a reference over 100 lines.
const BODY_LINES = 500;
const BODY_TOKENS = 5000;
const TOC_LINES = 100;
// A rough count: English prose averages about four characters a token.
const CHARS_PER_TOKEN = 4;
const HELP_TIMEOUT_MS = 10_000;

const MONTHS =
    "January|February|March|April|May|June|July|August|September|October|November|December";
const TIME_SENSITIVE = new RegExp(
    `\\b(before|after|until|as of|since|from) ((${MONTHS}) )?20\\d\\d\\b`,
    "i",
);

function main() {
    let parsed;
    try {
        parsed = parseArgs({
            allowPositionals: true,
            options: {
                target: { type: "string", default: "any" },
                json: { type: "boolean", default: false },
                strict: { type: "boolean", default: false },
                "run-help": { type: "boolean", default: false },
                ignore: { type: "string", multiple: true, default: [] },
                help: { type: "boolean", short: "h", default: false },
            },
        });
    } catch (error) {
        process.stderr.write(`${error.message}\n\n${USAGE}\n`);
        process.exit(2);
    }
    const { values: options, positionals } = parsed;
    if (options.help) {
        process.stdout.write(`${USAGE}\n`);
        return;
    }
    if (!TARGETS.includes(options.target)) {
        process.stderr.write(
            `--target must be one of ${TARGETS.join(", ")}, not ${options.target}\n`,
        );
        process.exit(2);
    }
    if (!positionals.length) {
        process.stderr.write(`no skill given\n\n${USAGE}\n`);
        process.exit(2);
    }

    const skills = [];
    for (const path of positionals) {
        const found = skillDirs(resolve(path));
        if (!found.length) {
            process.stderr.write(
                `check-skill: ${path} holds no SKILL.md, nor do its subdirectories\n`,
            );
            process.exit(2);
        }
        skills.push(...found);
    }

    const ignored = new Set(options.ignore);
    const findings = skills
        .flatMap((dir) => checkSkill(dir, options))
        .filter((f) => !ignored.has(f.code));

    if (options.json) {
        process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
    } else {
        for (const f of findings) {
            const where = f.line ? `${f.file}:${f.line}` : f.file;
            process.stdout.write(
                `${f.skill} ${f.level} ${f.code} ${where} ${f.message}\n`,
            );
        }
        const errors = findings.filter((f) => f.level === "error").length;
        process.stderr.write(
            `${skills.length} skill(s): ${errors} error(s), ${findings.length - errors} warning(s)\n`,
        );
    }
    const failing = findings.some((f) => f.level === "error" || options.strict);
    process.exit(failing ? 1 : 0);
}

// A skill directory, or each skill one level inside a directory. An
// installer often links skills in rather than copying them, so a link to
// a directory counts, checked under its own name; a link to nothing is
// reported, never skipped in silence.
function skillDirs(path) {
    if (!existsSync(path) || !statSync(path).isDirectory()) return [];
    if (existsSync(join(path, "SKILL.md"))) return [path];
    const dirs = [];
    for (const name of readdirSync(path).sort()) {
        const entry = join(path, name);
        let stat;
        try {
            stat = statSync(entry);
        } catch {
            if (lstatSync(entry).isSymbolicLink()) {
                process.stderr.write(
                    `check-skill: ${entry} links to nothing; not checked\n`,
                );
            }
            continue;
        }
        if (stat.isDirectory() && existsSync(join(entry, "SKILL.md"))) {
            dirs.push(entry);
        }
    }
    return dirs;
}

// ------------------------------------------------------------- the checks

function checkSkill(dir, options) {
    const skill = basename(dir);
    const findings = [];
    const add = (level, code, file, line, message) =>
        findings.push({ skill, level, code, file, line, message });
    const error = (code, message, file = "SKILL.md", line = null) =>
        add("error", code, file, line, message);
    const warn = (code, message, file = "SKILL.md", line = null) =>
        add("warning", code, file, line, message);
    // A finding whose level depends on the target: error, warning, or
    // nothing, as the target's entry says.
    const by = (levels, code, message) => {
        const level = levels[options.target];
        if (level) add(level, code, "SKILL.md", null, message);
    };

    const text = readFileSync(join(dir, "SKILL.md"), "utf8");
    let parsed;
    try {
        parsed = parseFrontmatter(text);
    } catch (e) {
        error("frontmatter", e.message, "SKILL.md", e.line ?? 1);
        return findings;
    }
    const { front, body, bodyStart, notes } = parsed;
    for (const note of notes)
        warn(note.code, note.message, "SKILL.md", note.line);

    checkName(front.name, skill, error, warn, by);
    checkDescription(front.description, error, warn, by);
    checkKeys(front, error, warn, by);

    const lines = body.split("\n").length;
    if (lines > BODY_LINES) {
        warn(
            "body-lines",
            `body is ${lines} lines; keep it under ${BODY_LINES}, moving detail to references the body says when to read`,
        );
    }
    const tokens = Math.round(body.length / CHARS_PER_TOKEN);
    if (tokens > BODY_TOKENS) {
        warn(
            "body-tokens",
            `body is about ${tokens} tokens; keep it under ${BODY_TOKENS}`,
        );
    }

    checkFiles(dir, body, bodyStart, error, warn);
    if (options["run-help"]) checkScriptsRun(dir, warn);
    return findings;
}

// Anthropic's upload rules: errors for a portable skill, warnings for a
// collection, and warnings in Claude Code, which documents no such ban.
const UPLOAD = { any: "warning", portable: "error", "claude-code": "warning" };
// What Claude Code alone accepts: fine there, refused on upload.
const CLAUDE_CODE_ONLY = { any: "warning", portable: "error" };

function checkName(name, dir, error, warn, by) {
    if (name === undefined || name === null || name === "") {
        error("name-missing", "frontmatter has no name");
        return;
    }
    if (typeof name !== "string") {
        error(
            "name-type",
            `name is YAML's ${typeOf(name)} ${String(name)}, not a string; quote it`,
        );
        return;
    }
    if (name !== dir) {
        error(
            "name-directory",
            `name ${name} is not its directory's, ${dir}; the specification requires they match`,
        );
    }
    if (name.length > 64) {
        error("name-length", `name is ${name.length} characters; at most 64`);
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
        error(
            "name-characters",
            `name ${name} is not lowercase letters, digits and single hyphens, neither opening nor closing with one`,
        );
    }
    if (/anthropic|claude/.test(name)) {
        by(
            UPLOAD,
            "name-reserved",
            `name ${name} holds anthropic or claude, which claude.ai and the Claude API refuse`,
        );
    }
    const first = name.split("-")[0];
    if (VAGUE_NAMES.test(name) || VAGUE_NAMES.test(first)) {
        warn(
            "name-vague",
            `name ${name} is vague; say the activity, as processing-pdfs does`,
        );
    } else if (!/^[a-z]+ing$/.test(first) || ING_NOUNS.test(first)) {
        warn(
            "name-gerund",
            `name ${name} does not open with a gerund, as processing-pdfs does; a convention, and a name is hard to change once installed or published`,
        );
    }
}

function checkDescription(description, error, warn, by) {
    if (description === undefined || description === null) {
        error("description-missing", "frontmatter has no description");
        return;
    }
    if (typeof description !== "string") {
        error(
            "description-type",
            `description is YAML's ${typeOf(description)}, not a string; quote it`,
        );
        return;
    }
    if (description.trim() === "") {
        error("description-missing", "description is empty");
        return;
    }
    if (description.length > 1024) {
        error(
            "description-length",
            `description is ${description.length} characters; at most 1024`,
        );
    } else if (description.length > 200) {
        by(
            { portable: "warning" },
            "description-claude-ai",
            `description is ${description.length} characters; claude.ai's help on custom skills gives 200 as its limit, where the specification and the Claude API give 1,024: test an upload`,
        );
    }
    if (/<\/?[A-Za-z][^>]*>/.test(description)) {
        by(
            UPLOAD,
            "description-xml",
            "description holds an XML tag, which claude.ai and the Claude API refuse",
        );
    } else if (/[<>]/.test(description)) {
        warn(
            "description-brackets",
            "description holds < or >, which Claude Code shows as &lt; and &gt;; write [placeholder]",
        );
    }
    if (/^\s*(I|I'm|I'll|We|You|You'll|Your)\b/.test(description)) {
        warn(
            "description-person",
            "description opens in the first or second person; it is injected into a system prompt, so write in the third person: 'Processes ...'",
        );
    }
    if (!/\bUse (when|for|this skill|it)\b/i.test(description)) {
        warn(
            "description-trigger",
            "description never says when to use the skill, as a 'Use when ...' sentence would",
        );
    } else if (/^\s*Use (when|for)\b/i.test(description)) {
        warn(
            "description-order",
            "description says when to use the skill before what it does",
        );
    }
}

function checkKeys(front, error, warn, by) {
    for (const key of Object.keys(front)) {
        if (SPEC_KEYS.has(key)) continue;
        if (CLAUDE_CODE_KEYS.has(key)) {
            by(
                CLAUDE_CODE_ONLY,
                "key-claude-code",
                `${key} is Claude Code's alone: claude.ai and the Claude API refuse the skill, and other clients ignore it`,
            );
        } else {
            by(
                { any: "warning", portable: "error", "claude-code": "warning" },
                "key-unknown",
                `${key} is in no specification: clients ignore it, and claude.ai and the Claude API refuse the skill; put it under metadata`,
            );
        }
    }
    for (const key of ["license", "compatibility"]) {
        const value = front[key];
        if (value !== undefined && typeof value !== "string") {
            error(
                `${key}-type`,
                `${key} is YAML's ${typeOf(value)}, not a string; quote it`,
            );
        }
    }
    const compatibility = front.compatibility;
    if (typeof compatibility === "string") {
        if (compatibility.trim() === "") {
            error("compatibility", "compatibility is empty; leave it out");
        } else if (compatibility.length > 500) {
            error(
                "compatibility",
                `compatibility is ${compatibility.length} characters; at most 500`,
            );
        }
    }
    const metadata = front.metadata;
    if (metadata !== undefined) {
        const entries = metadata instanceof Map ? [...metadata] : null;
        const bad = entries?.find(
            ([k, v]) => typeof k !== "string" || typeof v !== "string",
        );
        if (!entries) {
            error(
                "metadata",
                `metadata is YAML's ${typeOf(metadata)}, not a mapping of strings to strings`,
            );
        } else if (bad) {
            error(
                "metadata",
                `metadata's ${String(bad[0])} maps a ${typeOf(bad[0])} to a ${typeOf(bad[1])}, not a string to a string; quote it, as version: "1.0"`,
            );
        }
    }
    const tools = front["allowed-tools"];
    if (tools !== undefined && typeof tools !== "string") {
        const list =
            Array.isArray(tools) && tools.every((t) => typeof t === "string");
        if (list) {
            by(
                CLAUDE_CODE_ONLY,
                "allowed-tools",
                "allowed-tools is a list, which Claude Code alone reads; the specification's form is a space-separated string",
            );
        } else {
            error(
                "allowed-tools",
                `allowed-tools is YAML's ${typeOf(tools)}; write a space-separated string`,
            );
        }
    }
    if (front.license === undefined) {
        warn(
            "license",
            "no license: say on what terms the skill may be copied",
        );
    }
}

function typeOf(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "sequence";
    if (value instanceof Map) return "mapping";
    if (value instanceof Date) return "timestamp";
    return typeof value;
}

// Links, references and scripts. What an agent reads is SKILL.md and
// whatever it links to, directly or through other files; what sits in
// references/ is meant to be read. Anything else, such as a README for
// people, is held to no rule but its links.
function checkFiles(dir, body, bodyStart, error, warn) {
    const skillMd = join(dir, "SKILL.md");
    const files = walk(dir);
    const markdown = files.filter((f) => f.endsWith(".md"));
    const links = new Map(); // file -> Set of files it links to
    const texts = new Map();
    const broken = [];

    for (const file of markdown) {
        const rel = relative(dir, file);
        const own = file === skillMd;
        const text = own ? body : readFileSync(file, "utf8");
        texts.set(file, text);
        links.set(file, new Set());
        let fenced = false;
        text.split("\n").forEach((line, i) => {
            const at = (own ? bodyStart : 0) + i + 1;
            if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
            if (fenced) return;
            for (const target of linkTargets(line)) {
                if (target.includes("\\")) {
                    warn(
                        "path-backslash",
                        `link ${target} uses backslashes; use forward slashes`,
                        rel,
                        at,
                    );
                }
                const path = resolve(dirname(file), target.replace(/\\/g, "/"));
                if (!path.startsWith(dir + sep) && path !== dir) {
                    error(
                        "link-outside",
                        `link ${target} leaves the skill, which is installed alone`,
                        rel,
                        at,
                    );
                } else if (!existsSync(path)) {
                    broken.push({ file, target, rel, at });
                } else {
                    links.get(file).add(path);
                }
            }
            if (TIME_SENSITIVE.test(line)) {
                warn(
                    "time-sensitive",
                    `"${line.trim().slice(0, 80)}" ties guidance to a date, which goes stale; describe the current way, and keep the old under an "Old patterns" heading`,
                    rel,
                    at,
                );
            }
        });
    }

    // Breadth first from SKILL.md: depth 1 is linked from it directly.
    const depth = new Map([[skillMd, 0]]);
    const queue = [skillMd];
    while (queue.length) {
        const file = queue.shift();
        for (const target of links.get(file) ?? []) {
            if (depth.has(target)) continue;
            depth.set(target, depth.get(file) + 1);
            if (target.endsWith(".md")) queue.push(target);
        }
    }

    // A broken link an agent can follow is an error; one in a file no
    // agent is sent to, such as a README for people, is a warning.
    for (const { file, target, rel, at } of broken) {
        const level = depth.has(file) ? error : warn;
        level("link-broken", `link ${target} points at nothing`, rel, at);
    }

    for (const file of markdown) {
        if (file === skillMd) continue;
        const rel = relative(dir, file);
        const reached = depth.get(file);
        const reference = rel.startsWith(`references${sep}`);
        if (reached === undefined) {
            if (reference) {
                warn(
                    "reference-unlinked",
                    "never linked: no agent will know to read it",
                    rel,
                );
            }
            continue;
        }
        if (reached > 1) {
            warn(
                "reference-nested",
                `reached only through other files, ${reached} links from SKILL.md; link it from SKILL.md, as an agent may read a nested file only in part`,
                rel,
            );
        }
        const lines = texts.get(file).split("\n");
        const head = lines.slice(0, 30).join("\n");
        if (
            lines.length > TOC_LINES &&
            !/^#{1,3} (Contents|Table of contents)\b/im.test(head)
        ) {
            warn(
                "reference-toc",
                `${lines.length} lines with no "Contents" heading near the top; an agent previewing it with head sees only the start`,
                rel,
            );
        }
    }

    // A script a Markdown file names is one an agent is told to run;
    // others, such as a module the scripts import, are left alone.
    const prose = [...texts.values()].join("\n");
    for (const file of runnableScripts(dir, prose)) {
        const rel = relative(dir, file);
        const head = readFileSync(file, "utf8").slice(0, 200);
        if (!head.startsWith("#!")) {
            warn(
                "script-shebang",
                "script has no #! line, so it runs only through a named interpreter",
                rel,
            );
        }
        if (!(statSync(file).mode & 0o111)) {
            warn("script-executable", "script is not executable", rel);
        }
    }
}

function runnableScripts(dir, prose) {
    return walk(join(dir, "scripts")).filter((file) => {
        const rel = relative(dir, file).split(sep).join("/");
        return (
            !/\.(md|txt|json|ya?ml|toml)$/.test(file) &&
            (prose.includes(rel) || prose.includes(basename(file)))
        );
    });
}

function checkScriptsRun(dir, warn) {
    const prose = walk(dir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => readFileSync(f, "utf8"))
        .join("\n");
    for (const file of runnableScripts(dir, prose)) {
        if (!(statSync(file).mode & 0o111)) continue;
        const rel = relative(dir, file);
        const run = spawnSync(file, ["--help"], {
            cwd: dir,
            encoding: "utf8",
            timeout: HELP_TIMEOUT_MS,
        });
        const output = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
        if (run.error || run.status !== 0 || !output) {
            const how = run.error
                ? `failed: ${run.error.message}`
                : `exited ${run.status}${output ? "" : " with no output"}`;
            warn(
                "script-help",
                `--help ${how}; --help is how an agent learns a script`,
                rel,
            );
        }
    }
}

function walk(dir) {
    if (!existsSync(dir)) return [];
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith("."))
            continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(path));
        else if (entry.isFile()) out.push(path);
    }
    return out.sort();
}

// The targets of a line's Markdown links that are paths, not URLs or
// fragments, outside inline code.
function linkTargets(line) {
    const prose = line.replace(/`[^`]*`/g, "");
    return [...prose.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)]
        .map((m) => decodeURI(m[1].split("#")[0]))
        .filter((t) => t && !/^[a-z][a-z0-9+.-]*:/i.test(t));
}

// ------------------------------------------------------------ frontmatter

// The frontmatter's mapping, read as YAML 1.2, with mappings kept as Maps
// so a key keeps its own type. Errors carry the line in SKILL.md.
// Clients read YAML with different libraries, some of them YAML 1.1,
// where yes, on and 1:20 are no strings: a value that reads otherwise
// under 1.1 is noted.
function parseFrontmatter(text) {
    if (!/^---\r?\n/.test(text)) {
        throw new Error(
            "SKILL.md does not open with ---, so no client reads its frontmatter",
        );
    }
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(\r?\n|$)/);
    if (!match) throw new Error("frontmatter is never closed with ---");
    const yaml = match[1];
    const fail = (problem) => {
        const err = new Error(`frontmatter: ${problem.message.split("\n")[0]}`);
        err.line = (problem.linePos?.[0]?.line ?? 0) + 1;
        return err;
    };
    const read = (version) => {
        const doc = parseDocument(yaml, {
            version,
            uniqueKeys: true,
            prettyErrors: true,
        });
        return doc;
    };
    const doc = read("1.2");
    if (doc.errors.length) throw fail(doc.errors[0]);
    const notes = doc.warnings.map((w) => ({
        code: "frontmatter-unsupported",
        message: `frontmatter: ${w.message.split("\n")[0]}; its meaning cannot be checked`,
        line: (w.linePos?.[0]?.line ?? 0) + 1,
    }));
    const value = doc.toJS({ mapAsMap: true, maxAliasCount: 100 });
    if (!(value instanceof Map)) {
        throw new Error("frontmatter is not a mapping of keys to values");
    }
    const front = {};
    for (const [key, field] of value) {
        if (typeof key !== "string") {
            throw new Error(`frontmatter key ${String(key)} is not a string`);
        }
        front[key] = field;
    }

    const old = read("1.1");
    if (!old.errors.length) {
        const then = old.toJS({ mapAsMap: true, maxAliasCount: 100 });
        for (const key of [...SPEC_KEYS]) {
            const now = front[key];
            const was = then instanceof Map ? then.get(key) : undefined;
            const pairs =
                now instanceof Map && was instanceof Map
                    ? [...now].map(([k, v]) => [`${key}.${k}`, v, was.get(k)])
                    : [[key, now, was]];
            for (const [where, a, b] of pairs) {
                if (a === undefined || a instanceof Map) continue;
                if (typeof a !== typeof b || String(a) !== String(b)) {
                    notes.push({
                        code: "yaml-version",
                        message: `${where} reads as ${typeOf(a)} ${JSON.stringify(a)} in YAML 1.2 but ${typeOf(b)} ${JSON.stringify(b)} in YAML 1.1, which some clients use; quote it`,
                        line: null,
                    });
                }
            }
        }
    }
    const bodyStart = match[0].split("\n").length - 1;
    return { front, notes, body: text.slice(match[0].length), bodyStart };
}

main();
