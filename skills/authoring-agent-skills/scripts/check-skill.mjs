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
// Anthropic's and Codex's clients enforce, and the authoring practices
// those sources agree on, so an agent need not hold the rules in mind
// while writing. Errors break a client; warnings are practices to weigh.
// Run with --help for the options.
//
// Node alone, no dependencies, read-only. It reads the subset of YAML
// that frontmatter uses, and reports what it cannot read rather than
// guess.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

const USAGE = `usage: check-skill.mjs [options] <skill-dir|skills-dir>...

Checks each skill directory, or each directory holding a SKILL.md inside
a skills directory, and prints one finding per line:
  <skill> <error|warning> <code> <file>[:<line>] <message>

options:
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

Errors: what the specification, claude.ai, the Claude API or Codex
reject. Warnings: the practices of Anthropic's best practices and
agentskills.io, which a skill may break on purpose.`;

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

function skillDirs(path) {
    if (!existsSync(path) || !statSync(path).isDirectory()) return [];
    if (existsSync(join(path, "SKILL.md"))) return [path];
    return readdirSync(path, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => join(path, e.name))
        .filter((dir) => existsSync(join(dir, "SKILL.md")))
        .sort();
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

    const text = readFileSync(join(dir, "SKILL.md"), "utf8");
    let front;
    let body;
    let bodyStart;
    try {
        ({ front, body, bodyStart } = parseFrontmatter(text));
    } catch (e) {
        error("frontmatter", e.message, "SKILL.md", 1);
        return findings;
    }

    checkName(front.name, skill, error, warn);
    checkDescription(front.description, error, warn);
    checkKeys(front, error, warn);

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

function checkName(name, dir, error, warn) {
    if (typeof name !== "string" || name === "") {
        error("name-missing", "frontmatter has no name");
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
        error(
            "name-reserved",
            `name ${name} holds anthropic or claude, which Anthropic reserves`,
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

function checkDescription(description, error, warn) {
    if (typeof description !== "string" || description.trim() === "") {
        error("description-missing", "frontmatter has no description");
        return;
    }
    if (description.length > 1024) {
        error(
            "description-length",
            `description is ${description.length} characters; at most 1024`,
        );
    }
    if (/<\/?[A-Za-z][^>]*>/.test(description)) {
        error(
            "description-xml",
            "description holds an XML tag, which Anthropic rejects",
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

function checkKeys(front, error, warn) {
    for (const key of Object.keys(front)) {
        if (SPEC_KEYS.has(key)) continue;
        if (CLAUDE_CODE_KEYS.has(key)) {
            warn(
                "key-claude-code",
                `${key} is Claude Code's alone: claude.ai and the Claude API reject the skill, and other clients ignore it`,
            );
        } else {
            warn(
                "key-unknown",
                `${key} is in no specification: clients ignore it, and claude.ai and the Claude API reject the skill; put it under metadata`,
            );
        }
    }
    const compatibility = front.compatibility;
    if (compatibility !== undefined) {
        if (typeof compatibility !== "string" || compatibility.trim() === "") {
            error("compatibility", "compatibility is not a non-empty string");
        } else if (compatibility.length > 500) {
            error(
                "compatibility",
                `compatibility is ${compatibility.length} characters; at most 500`,
            );
        }
    }
    const metadata = front.metadata;
    if (metadata !== undefined) {
        if (
            !metadata ||
            typeof metadata !== "object" ||
            Array.isArray(metadata) ||
            Object.values(metadata).some((v) => typeof v !== "string")
        ) {
            error(
                "metadata",
                "metadata is not a mapping of string keys to string values; quote numbers, as version: '1.0'",
            );
        }
    }
    const tools = front["allowed-tools"];
    if (tools !== undefined && typeof tools !== "string") {
        warn(
            "allowed-tools",
            "allowed-tools is not a space-separated string, the specification's form; Claude Code alone also reads a list",
        );
    }
    if (front.license === undefined) {
        warn(
            "license",
            "no license: say on what terms the skill may be copied",
        );
    }
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

// Reads the frontmatter's top-level keys: plain, quoted and block
// scalars, and one level of mapping or sequence beneath a key. What it
// cannot read is an error, never a guess.
function parseFrontmatter(text) {
    if (!/^---\r?\n/.test(text)) {
        throw new Error(
            "SKILL.md does not open with ---, so no client reads its frontmatter",
        );
    }
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) throw new Error("frontmatter is never closed with ---");
    const lines = match[1].split(/\r?\n/);
    const front = {};
    const indented = (l) => l.trim() === "" || /^\s/.test(l);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "" || /^\s*#/.test(line)) continue;
        const key = line.match(/^([A-Za-z0-9_-]+):(?:[ \t]+(.*))?$/);
        if (!key) {
            throw new Error(`cannot read frontmatter line ${i + 2}: ${line}`);
        }
        const [, name, rest = ""] = key;
        if (name in front) throw new Error(`${name} appears twice`);
        const nested = [];
        while (i + 1 < lines.length && indented(lines[i + 1])) {
            nested.push(lines[++i]);
        }
        front[name] = readValue(name, rest.trim(), nested);
    }
    const bodyStart = match[0].split("\n").length - 1;
    return { front, body: text.slice(match[0].length), bodyStart };
}

function readValue(name, rest, body) {
    const block = rest.match(/^([>|])([+-]?)[ \t]*(#.*)?$/);
    if (block) return blockScalar(name, body, block[1], block[2]);
    const filled = body.filter((l) => l.trim() !== "");
    if (rest === "" || rest.startsWith("#")) {
        return filled.length ? collection(name, filled) : null;
    }
    if (rest.startsWith("'") || rest.startsWith('"')) {
        if (filled.length) {
            throw new Error(
                `${name}'s quoted value continues onto another line, which this script does not read`,
            );
        }
        return quoted(name, rest);
    }
    if (/^\[.*\]$/.test(rest)) {
        return rest
            .slice(1, -1)
            .split(",")
            .map((item) => scalar(name, item.trim()))
            .filter((item) => item !== "");
    }
    if (/^[{&*!%@`]/.test(rest)) {
        throw new Error(`${name}'s value is YAML this script does not read`);
    }
    // A plain scalar folds: lines join with a space.
    return [rest.replace(/\s+#.*$/, ""), ...filled.map((l) => l.trim())].join(
        " ",
    );
}

function scalar(name, text) {
    if (text.startsWith("'") || text.startsWith('"')) return quoted(name, text);
    const plain = text.replace(/\s+#.*$/, "");
    if (/^(true|false|yes|no|on|off)$/i.test(plain)) {
        return /^(true|yes|on)$/i.test(plain);
    }
    if (/^[-+]?\d+(\.\d+)?$/.test(plain)) return Number(plain);
    if (/^(null|~)$/.test(plain)) return null;
    return plain;
}

function collection(name, lines) {
    const indent = lines[0].match(/^ */)[0].length;
    const own = lines.filter((l) => l.match(/^ */)[0].length === indent);
    if (own.every((l) => /^\s*- /.test(l))) {
        return own.map((l) => scalar(name, l.replace(/^\s*- /, "").trim()));
    }
    const map = {};
    for (const l of own) {
        const m = l.trim().match(/^([^:#]+?):(?:[ \t]+(.*))?$/);
        if (!m) {
            throw new Error(`cannot read ${name}'s entry: ${l.trim()}`);
        }
        map[m[1].trim()] =
            m[2] === undefined ? null : scalar(name, m[2].trim());
    }
    return map;
}

function blockScalar(name, body, style, chomp) {
    const filled = body.filter((l) => l.trim() !== "");
    if (!filled.length) return "";
    const indent = filled[0].match(/^ */)[0].length;
    if (filled.some((l) => l.match(/^ */)[0].length < indent)) {
        throw new Error(
            `${name}'s block scalar is less indented after its first line`,
        );
    }
    const lines = body.map((l) => (l.trim() === "" ? "" : l.slice(indent)));
    while (lines.length && lines.at(-1) === "") lines.pop();
    let value = "";
    if (style === "|") value = lines.join("\n");
    else {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line === "") value += "\n";
            else if (i > 0 && lines[i - 1] !== "" && !/^\s/.test(line)) {
                value += ` ${line}`;
            } else value += line;
        }
    }
    return chomp === "-" ? value : `${value}\n`;
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

main();
