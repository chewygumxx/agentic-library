#!/usr/bin/env node
// vim:set expandtab shiftwidth=4 filetype=javascript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/skills/authoring-agent-skills/scripts/extract-user-turns.mjs
//
//

// Usage: extract-user-turns.mjs --output <file|-> [options]
//
// Reads Claude Code and Codex session transcripts and prints, as JSON
// Lines, only what a person put into them: what they typed, what they
// answered and noted in a question dialog, the tools they rejected and
// why, and the messages other agents relayed to the session, each with
// the agent's last words before it for context. Everything else the
// transcripts log as a user turn, from tool results to injected
// instructions and subagent reports, is dropped. Run with --help.
//
// Node alone, no dependencies, and read-only: it never writes a
// transcript.

import {
    existsSync,
    readdirSync,
    readFileSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";

const USAGE = `usage: extract-user-turns.mjs --output <file|-> [options]

Writes one JSON object per line for each turn a person, or an agent
relaying to the session, put into a Claude Code or Codex transcript,
oldest first, and a count of them by tool and kind to stderr.

options:
  --output <file|->      Where to write the turns; - for stdout, which
                         may run to megabytes. Required.
  --match <regex>        Keep only sessions whose working directory
                         matches; repeatable, any match keeps. Default:
                         every session.
  --claude-dir <dir>     A Claude projects directory to read; repeatable.
                         Default: $CLAUDE_CONFIG_DIR/projects,
                         ~/.claude/projects and
                         $XDG_DATA_HOME/claude/projects, those that exist.
  --codex-dir <dir>      A Codex sessions directory to read; repeatable.
                         Default: $CODEX_HOME/sessions, else
                         ~/.codex/sessions.
  --tool <claude|codex>  Read only that tool's transcripts.
  --kinds <list>         Keep only these kinds, comma-separated: typed,
                         relayed, answer, rejection, command, interrupt.
  --max-context <n>      Cut each context to its last n characters; 0
                         drops it. Default: keep it whole.
  --include-subagents    Also read subagents' own transcripts, whose
                         user turns are another agent's prompts.
  --redact <regex>[=<text>]
                         Replace each match, case-insensitively, in every
                         string written with <text>, by default
                         [redacted]; repeatable, applied in order. The
                         last = splits the two.
  -h, --help             Show this help.

Exit codes: 0 written; 2 a bad option or an unreadable directory.

Each line holds: tool, session, cwd, branch (Claude only), timestamp,
kind, text, and context, the agent's last text since the previous kept
turn, or null. A relayed turn adds from and, when present, via; an
answer adds answers, each question with its options, the choice and any
notes, and clarify when the dialog was sent back without submitting; a
rejection adds rejectedTool; a turn with images adds images.

examples:
  extract-user-turns.mjs --match '/my-repo([./]|$)' --output turns.jsonl
  extract-user-turns.mjs --kinds answer --max-context 0 --output - |
      jq -r '.answers[] | select(.notes) | .notes'`;

const KINDS = [
    "typed",
    "relayed",
    "answer",
    "rejection",
    "command",
    "interrupt",
];

// A relayed message, as herdr's send-prompt.sh writes it:
// "[from <agent>] <text>" or "[from <agent>, <via>] <text>".
const RELAYED = /^\[from ([^\],\n]+)(?:, ([^\]\n]+))?\]\s*/;

// What Codex injects as a user message. A person's own text rarely
// opens with a lone tag, and never with these.
const CODEX_INJECTED = [
    /^# AGENTS\.md instructions for /,
    /^<(environment_context|user_instructions|skill|turn_aborted|permissions instructions|user_shell_command|subagent_notification|collaboration_mode)>/,
];

const REJECTED = /^The user doesn't want to proceed with this tool use\./;
const CLARIFY = /^The user wants to clarify these questions\./;
const INTERRUPTED = /^\[Request interrupted by user/;

function main() {
    let options;
    try {
        ({ values: options } = parseArgs({
            options: {
                match: { type: "string", multiple: true },
                "claude-dir": { type: "string", multiple: true },
                "codex-dir": { type: "string", multiple: true },
                tool: { type: "string" },
                kinds: { type: "string" },
                "max-context": { type: "string" },
                "include-subagents": { type: "boolean" },
                output: { type: "string" },
                redact: { type: "string", multiple: true },
                help: { type: "boolean", short: "h" },
            },
        }));
    } catch (error) {
        process.stderr.write(`${error.message}\n\n${USAGE}\n`);
        process.exit(2);
    }
    // Node before 18.11 ignores parseArgs' defaults: apply them here.
    for (const key of ["match", "claude-dir", "codex-dir", "redact"]) {
        options[key] ??= [];
    }
    if (options.help) {
        process.stdout.write(`${USAGE}\n`);
        return;
    }
    if (options.tool && !["claude", "codex"].includes(options.tool)) {
        fail(`--tool must be claude or codex, not ${options.tool}`);
    }
    const kinds = options.kinds ? options.kinds.split(",") : KINDS;
    for (const kind of kinds) {
        if (!KINDS.includes(kind)) fail(`unknown kind: ${kind}`);
    }
    let maxContext = null;
    if (options["max-context"] !== undefined) {
        maxContext = Number(options["max-context"]);
        if (!Number.isInteger(maxContext) || maxContext < 0) {
            fail("--max-context must be a whole number");
        }
    }
    if (!options.output) fail("--output is required: a file, or - for stdout");
    const matches = options.match.map((source) => regex(source, ""));
    const redactions = options.redact.map((rule) => {
        const split = rule.lastIndexOf("=");
        return split < 0
            ? [regex(rule, "gi"), "[redacted]"]
            : [regex(rule.slice(0, split), "gi"), rule.slice(split + 1)];
    });
    const settings = {
        matches,
        includeSubagents: options["include-subagents"],
    };

    const turns = [];
    if (options.tool !== "codex") {
        const dirs = options["claude-dir"].length
            ? options["claude-dir"]
            : defaultClaudeDirs();
        for (const file of unique(dirs.flatMap(jsonlFiles))) {
            turns.push(...readClaude(file, settings));
        }
    }
    if (options.tool !== "claude") {
        const dirs = options["codex-dir"].length
            ? options["codex-dir"]
            : defaultCodexDirs();
        for (const file of unique(dirs.flatMap(jsonlFiles))) {
            turns.push(...readCodex(file, settings));
        }
    }

    // One event can sit in two Claude files, as when a session is
    // forked; its record keeps its uuid, the one identity a transcript
    // proves. Of such copies, keep the one that knows what came before
    // it. Nothing else is merged: a person repeating themselves, in the
    // same words, is evidence too.
    const seen = new Map();
    const kept = [];
    for (const turn of turns) {
        if (!kinds.includes(turn.kind)) continue;
        const { record, ...rest } = turn;
        if (!record) {
            kept.push(rest);
            continue;
        }
        const key = [turn.tool, record, turn.kind, turn.text].join("\0");
        const index = seen.get(key);
        if (index === undefined) {
            seen.set(key, kept.length);
            kept.push(rest);
        } else if (kept[index].context === null && rest.context !== null) {
            kept[index] = rest;
        }
    }
    kept.sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
    const lines = [];
    const counts = {};
    for (const turn of kept) {
        if (maxContext === 0) turn.context = null;
        else if (maxContext !== null && turn.context?.length > maxContext) {
            turn.context = `...${turn.context.slice(-maxContext)}`;
        }
        lines.push(JSON.stringify(redact(turn, redactions)));
        const key = `${turn.tool} ${turn.kind}`;
        counts[key] = (counts[key] ?? 0) + 1;
    }
    const text = lines.length ? `${lines.join("\n")}\n` : "";
    if (options.output === "-") process.stdout.write(text);
    else writeFileSync(options.output, text);
    const sessions = new Set(kept.map((turn) => turn.session)).size;
    process.stderr.write(
        `${kept.length} turns from ${sessions} sessions: ${
            Object.entries(counts)
                .map(([key, n]) => `${n} ${key}`)
                .join(", ") || "none"
        }\n`,
    );
}

function regex(source, flags) {
    try {
        return new RegExp(source, flags);
    } catch (error) {
        fail(`bad regex ${JSON.stringify(source)}: ${error.message}`);
    }
}

// Applies each redaction to every string within a value.
function redact(value, redactions) {
    if (typeof value === "string") {
        return redactions.reduce(
            (text, [pattern, replacement]) =>
                text.replace(pattern, replacement),
            value,
        );
    }
    if (Array.isArray(value)) return value.map((v) => redact(v, redactions));
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([k, v]) => [k, redact(v, redactions)]),
        );
    }
    return value;
}

function fail(message) {
    process.stderr.write(`extract-user-turns: ${message}\n`);
    process.exit(2);
}

function unique(items) {
    return [...new Set(items)];
}

function defaultClaudeDirs() {
    const home = homedir();
    const dataHome = process.env.XDG_DATA_HOME || join(home, ".local/share");
    return [
        process.env.CLAUDE_CONFIG_DIR &&
            join(process.env.CLAUDE_CONFIG_DIR, "projects"),
        join(home, ".claude/projects"),
        join(dataHome, "claude/projects"),
    ].filter((dir) => dir && existsSync(dir));
}

function defaultCodexDirs() {
    const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
    return [join(codexHome, "sessions")].filter((dir) => existsSync(dir));
}

function jsonlFiles(dir) {
    if (!existsSync(dir)) fail(`no such directory: ${dir}`);
    const files = [];
    const walk = (path) => {
        let entries;
        try {
            entries = readdirSync(path, { withFileTypes: true });
        } catch (error) {
            // A directory this user cannot read holds no transcript of
            // theirs; say so, and read on.
            process.stderr.write(
                `extract-user-turns: skipped ${path}: ${error.code}\n`,
            );
            return;
        }
        for (const entry of entries) {
            const child = join(path, entry.name);
            if (entry.isDirectory()) walk(child);
            else if (entry.name.endsWith(".jsonl")) files.push(child);
        }
    };
    if (statSync(dir).isDirectory()) walk(dir);
    return files.sort();
}

function* records(file) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
            yield JSON.parse(line);
        } catch {
            // A session still being written may end mid-line.
        }
    }
}

function matchesCwd(cwd, settings) {
    if (!settings.matches.length) return true;
    return Boolean(cwd) && settings.matches.some((re) => re.test(cwd));
}

function textOf(content) {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
        .filter((block) =>
            ["text", "input_text", "output_text"].includes(block.type),
        )
        .map((block) => block.text)
        .join("\n");
}

function imagesIn(content) {
    if (!Array.isArray(content)) return 0;
    return content.filter((block) =>
        ["image", "input_image"].includes(block.type),
    ).length;
}

// Splits "[from <agent>] text" into its parts, else null.
function relayed(text) {
    const match = RELAYED.exec(text);
    if (!match) return null;
    const turn = { from: match[1].trim(), text: text.slice(match[0].length) };
    if (match[2]) turn.via = match[2].trim();
    return turn;
}

// Claude Code ---------------------------------------------------------

function readClaude(file, settings) {
    if (!settings.includeSubagents && file.includes("/subagents/")) return [];
    const turns = [];
    const asked = new Map(); // tool_use id -> { name, input }
    let context = null;
    let session = basename(file, ".jsonl");
    // A session belongs if it was ever in a matching directory.
    let keep = !settings.matches.length;

    const emit = (record, turn) => {
        turns.push({
            tool: "claude",
            session: record.sessionId ?? session,
            cwd: record.cwd ?? null,
            branch: record.gitBranch ?? null,
            timestamp: record.timestamp ?? null,
            ...turn,
            context,
            record: record.uuid ?? null,
        });
        context = null;
    };

    for (const record of records(file)) {
        if (record.sessionId) session = record.sessionId;
        if (!keep && matchesCwd(record.cwd, settings)) keep = true;
        if (record.isSidechain && !settings.includeSubagents) continue;

        if (record.type === "assistant") {
            for (const block of record.message?.content ?? []) {
                if (block.type === "text" && block.text.trim()) {
                    context = block.text.trim();
                } else if (block.type === "tool_use") {
                    asked.set(block.id, block);
                }
            }
            continue;
        }

        // A prompt typed while the agent was busy waits as an attachment.
        if (record.type === "attachment") {
            const attachment = record.attachment ?? {};
            if (
                attachment.type === "queued_command" &&
                attachment.origin?.kind === "human"
            ) {
                const text = textOf(attachment.prompt).trim();
                if (text) {
                    emit(
                        {
                            ...record,
                            timestamp: attachment.timestamp ?? record.timestamp,
                        },
                        { ...claudeTyped(text), queued: true },
                    );
                }
            }
            continue;
        }

        if (record.type !== "user" || record.isMeta) continue;
        const content = record.message?.content;

        if (
            Array.isArray(content) &&
            content.some((b) => b.type === "tool_result")
        ) {
            for (const block of content) {
                if (block.type !== "tool_result") continue;
                const turn = claudeToolResult(block, record, asked);
                if (turn) emit(record, turn);
            }
            continue;
        }

        const origin = record.origin?.kind;
        // Task notifications, subagent hand-backs and the like are the
        // harness speaking, not a person.
        if (origin && origin !== "human") continue;
        const text = textOf(content).trim();
        if (!text) continue;
        if (INTERRUPTED.test(text)) {
            emit(record, { kind: "interrupt", text: "" });
            continue;
        }
        const command = claudeCommand(text);
        if (command !== undefined) {
            if (command) emit(record, { kind: "command", text: command });
            continue;
        }
        // Without an origin, as in older transcripts, a leading tag
        // marks harness output.
        if (!origin && /^<[a-z][\w-]*>/.test(text)) continue;
        const turn = claudeTyped(text);
        const images = imagesIn(content);
        if (images) turn.images = images;
        emit(record, turn);
    }
    return keep ? turns : [];
}

function claudeTyped(text) {
    const relay = relayed(text);
    return relay ? { kind: "relayed", ...relay } : { kind: "typed", text };
}

// "/name args" for a slash command; null for a local command's output;
// undefined for anything else.
function claudeCommand(text) {
    if (/^<local-command-(stdout|stderr|caveat)>/.test(text)) return null;
    const name = /<command-name>([\s\S]*?)<\/command-name>/.exec(text);
    if (!name) return undefined;
    const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text);
    const slash = name[1].trim().replace(/^\/?/, "/");
    return `${slash} ${args ? args[1].trim() : ""}`.trim();
}

function claudeToolResult(block, record, asked) {
    const call = asked.get(block.tool_use_id);
    const result = textOf(block.content);
    if (block.is_error && REJECTED.test(result)) {
        const said = /the user said:\s*([\s\S]*)$/i.exec(result);
        if (call?.name === "AskUserQuestion" && CLARIFY.test(said?.[1] ?? "")) {
            return clarified(said[1], call);
        }
        return {
            kind: "rejection",
            text: said ? said[1].trim() : "",
            rejectedTool: call?.name ?? null,
        };
    }
    if (call?.name !== "AskUserQuestion") return null;
    const outcome = record.toolUseResult;
    if (!outcome || typeof outcome !== "object" || !outcome.answers)
        return null;
    const questions = outcome.questions ?? call.input?.questions ?? [];
    const notes = outcome.annotations ?? {};
    return {
        kind: "answer",
        text: Object.values(outcome.answers).join("\n"),
        answers: questions.map((q) => {
            const answer = {
                question: q.question,
                header: q.header ?? null,
                multiSelect: Boolean(q.multiSelect),
                options: (q.options ?? []).map((o) => ({
                    label: o.label,
                    description: o.description ?? null,
                })),
                answer: outcome.answers[q.question] ?? null,
            };
            if (notes[q.question]?.notes)
                answer.notes = notes[q.question].notes;
            return answer;
        }),
    };
}

// Choosing to clarify rather than submit a question dialog rejects it,
// listing what was answered so far:
//   - "<question>"
//     Answer: <choice>      or      (No answer provided)
function clarified(said, call) {
    const answered = new Map();
    const item =
        /^- "([\s\S]*?)"\n\s+(?:Answer: (.*)|\(No answer provided\))$/gm;
    for (const match of said.matchAll(item)) {
        answered.set(match[1], match[2]?.trim() ?? null);
    }
    const questions = call.input?.questions ?? [];
    return {
        kind: "answer",
        clarify: true,
        text: [...answered.values()].filter(Boolean).join("\n"),
        answers: questions.map((q) => ({
            question: q.question,
            header: q.header ?? null,
            multiSelect: Boolean(q.multiSelect),
            options: (q.options ?? []).map((o) => ({
                label: o.label,
                description: o.description ?? null,
            })),
            answer: answered.get(q.question) ?? null,
        })),
    };
}

// Codex ---------------------------------------------------------------

function readCodex(file, settings) {
    const turns = [];
    let meta = null;
    let cwd = null;
    let context = null;
    let keep = !settings.matches.length;

    for (const record of records(file)) {
        const payload = record.payload ?? {};
        if (record.type === "session_meta") {
            meta = payload;
            const subagent =
                payload.parent_thread_id || payload.source?.subagent;
            if (subagent && !settings.includeSubagents) return [];
        }
        if (
            (record.type === "session_meta" ||
                record.type === "turn_context") &&
            payload.cwd
        ) {
            cwd = payload.cwd;
            if (matchesCwd(cwd, settings)) keep = true;
            continue;
        }
        if (record.type !== "response_item" || payload.type !== "message") {
            continue;
        }
        if (payload.role === "assistant") {
            const text = textOf(payload.content).trim();
            if (text) context = text;
            continue;
        }
        if (payload.role !== "user") continue;

        const pieces = (payload.content ?? []).filter(
            (block) =>
                block.type !== "input_text" ||
                !CODEX_INJECTED.some((re) => re.test(block.text.trimStart())),
        );
        const text = textOf(pieces).trim();
        const images = imagesIn(pieces);
        if (!text && !images) continue;
        const relay = relayed(text);
        const turn = {
            tool: "codex",
            session: meta?.id ?? basename(file, ".jsonl"),
            cwd,
            branch: null,
            timestamp: record.timestamp ?? null,
            ...(relay
                ? { kind: "relayed", ...relay }
                : { kind: "typed", text }),
            context,
        };
        if (images) turn.images = images;
        turns.push(turn);
        context = null;
    }
    return keep ? turns : [];
}

main();
