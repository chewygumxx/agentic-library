// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/authoring-agent-skills/extract-user-turns.test.mts
//
//

// extract-user-turns.mjs, over made-up Claude Code and Codex transcripts
// of each record it keeps or drops: a person's turns kept with the
// agent's words before them, the clients' own user turns dropped.

import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const script = join(
    import.meta.dir,
    "..",
    "..",
    "skills",
    "authoring-agent-skills",
    "scripts",
    "extract-user-turns.mjs",
);

const base = mkdtempSync(join(tmpdir(), "extract-user-turns-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));

const claudeDir = join(base, "claude");
const codexDir = join(base, "codex");
const REPO = "/work/my-repo";

function jsonl(path: string, records: object[]) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, records.map((r) => JSON.stringify(r)).join("\n"));
}

let clock = 0;
const at = () => new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString();

const claude = (session: string, cwd = REPO) => ({
    said: (text: string) => ({
        type: "assistant",
        sessionId: session,
        cwd,
        timestamp: at(),
        message: { content: [{ type: "text", text }] },
    }),
    calls: (id: string, name: string, input: object) => ({
        type: "assistant",
        sessionId: session,
        cwd,
        timestamp: at(),
        message: { content: [{ type: "tool_use", id, name, input }] },
    }),
    user: (content: unknown, extra: object = {}) => ({
        type: "user",
        sessionId: session,
        cwd,
        gitBranch: "main",
        timestamp: at(),
        message: { content },
        ...extra,
    }),
    result: (id: string, content: string, extra: object = {}) => ({
        type: "user",
        sessionId: session,
        cwd,
        timestamp: at(),
        message: {
            content: [
                { type: "tool_result", tool_use_id: id, content, ...extra },
            ],
        },
    }),
});

const human = { origin: { kind: "human" } };
const question = {
    question: "Which way?",
    header: "Way",
    multiSelect: false,
    options: [
        { label: "Left (Recommended)", description: "The usual" },
        { label: "Right", description: "The other" },
    ],
};

const c = claude("s1");
jsonl(join(claudeDir, "-work-my-repo", "s1.jsonl"), [
    c.said("Shall I start?"),
    { ...c.user("yes please", human), uuid: "u-yes" },
    c.user("<task-notification>done</task-notification>", {
        origin: { kind: "task-notification" },
    }),
    c.user([{ type: "text", text: "Caveat: injected" }], { isMeta: true }),
    c.user("[Subagent hand-back] report", { origin: { kind: "peer" } }),
    c.calls("t1", "Bash", { command: "ls" }),
    c.result("t1", "file-a\nfile-b"),
    c.said("Which way should it go?"),
    c.calls("q1", "AskUserQuestion", { questions: [question] }),
    {
        ...c.result("q1", "answered"),
        toolUseResult: {
            questions: [question],
            answers: { "Which way?": "Left (Recommended)" },
            annotations: { "Which way?": { notes: "and cover both" } },
        },
    },
    c.calls("q2", "AskUserQuestion", { questions: [question] }),
    c.result(
        "q2",
        'The user doesn\'t want to proceed with this tool use. The tool use was rejected. To tell you how to proceed, the user said:\nThe user wants to clarify these questions.\n    Start by asking them.\n\n    Questions asked:\n- "Which way?"\n  (No answer provided)',
        { is_error: true },
    ),
    c.calls("e1", "Edit", { file_path: "x" }),
    c.result(
        "e1",
        "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). To tell you how to proceed, the user said:\nuse tabs instead",
        { is_error: true },
    ),
    c.user(
        "<command-name>/review</command-name>\n<command-message>review</command-message>\n<command-args>high</command-args>",
    ),
    c.user("<local-command-stdout>ok</local-command-stdout>"),
    c.user([{ type: "text", text: "[Request interrupted by user]" }]),
    c.said("Relaying now."),
    c.user("[from reviewer] Please fix line 3", human),
    {
        type: "attachment",
        sessionId: "s1",
        cwd: REPO,
        timestamp: at(),
        attachment: {
            type: "queued_command",
            prompt: "and the tests too",
            origin: { kind: "human" },
            timestamp: at(),
        },
    },
    c.user(
        [
            { type: "text", text: "look at this" },
            { type: "image", source: {} },
        ],
        human,
    ),
    { ...c.user("from a sidechain", human), isSidechain: true },
    c.said("Shall I delete the cache?"),
    c.user("no, leave it", human),
    c.said("Shall I push the branch?"),
    c.user("no, leave it", human),
]);

// A forked session copies a record, its uuid included.
const resumed = claude("s1-resumed");
jsonl(join(claudeDir, "-work-my-repo", "s1-resumed.jsonl"), [
    { ...resumed.user("yes please", human), uuid: "u-yes" },
]);

const elsewhere = claude("s2", "/work/other");
jsonl(join(claudeDir, "-work-other", "s2.jsonl"), [
    elsewhere.user("not this repository", human),
]);

jsonl(join(claudeDir, "-work-my-repo", "s1", "subagents", "agent-a.jsonl"), [
    claude("s1", REPO).user("a subagent's prompt", human),
]);

const codexRecord = (type: string, payload: object) => ({
    timestamp: at(),
    type,
    payload,
});
const codexUser = (...texts: string[]) =>
    codexRecord("response_item", {
        type: "message",
        role: "user",
        content: texts.map((text) => ({ type: "input_text", text })),
    });
const codexSaid = (text: string) =>
    codexRecord("response_item", {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text }],
    });

jsonl(join(codexDir, "2026", "01", "01", "rollout-x1.jsonl"), [
    codexRecord("session_meta", { id: "x1", cwd: `${REPO}.wt/feature` }),
    codexUser(
        "# AGENTS.md instructions for /work\n\n<INSTRUCTIONS>...</INSTRUCTIONS>",
        "<environment_context>\n  <cwd>/work</cwd>\n</environment_context>",
    ),
    codexUser("review the skill"),
    codexUser("<skill>\n<name>x</name>\n</skill>"),
    codexSaid("Found two problems."),
    codexUser("[from al___reviewer, scheduled] Agreed, go ahead"),
    codexUser("review the skill"),
]);

jsonl(join(codexDir, "2026", "01", "01", "rollout-x2.jsonl"), [
    codexRecord("session_meta", {
        id: "x2",
        cwd: REPO,
        parent_thread_id: "x1",
        source: { subagent: { thread_spawn: { parent_thread_id: "x1" } } },
    }),
    codexUser("a spawned agent's task"),
]);

type Turn = Record<string, unknown> & {
    tool: string;
    kind: string;
    text: string;
    context: string | null;
};

function extract(...args: string[]) {
    const result = spawnSync(
        "node",
        [
            script,
            "--claude-dir",
            claudeDir,
            "--codex-dir",
            codexDir,
            "--output",
            "-",
            ...args,
        ],
        { encoding: "utf8" },
    );
    const turns = result.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Turn);
    return { ...result, turns };
}

const repo = ["--match", "/my-repo([./]|$)"];
const { turns, stderr } = extract(...repo);
const find = (text: string) => turns.find((t) => t.text === text);

describe("Claude Code", () => {
    it("keeps a typed turn with the agent's words before it", () => {
        expect(find("yes please")).toMatchObject({
            tool: "claude",
            kind: "typed",
            session: "s1",
            branch: "main",
            context: "Shall I start?",
        });
    });

    it("drops notifications, injected text, hand-backs and tool output", () => {
        const texts = turns.map((t) => t.text).join("\n");
        for (const dropped of [
            "task-notification",
            "Caveat",
            "Subagent hand-back",
            "file-a",
            "local-command-stdout",
            "from a sidechain",
        ]) {
            expect(texts).not.toContain(dropped);
        }
    });

    it("keeps an answer with its options and notes", () => {
        const answer = turns.find((t) => t.kind === "answer" && !t.clarify);
        expect(answer).toMatchObject({
            text: "Left (Recommended)",
            context: "Which way should it go?",
            answers: [
                {
                    question: "Which way?",
                    answer: "Left (Recommended)",
                    notes: "and cover both",
                    multiSelect: false,
                },
            ],
        });
        const answers = (answer?.answers ?? []) as { options: unknown[] }[];
        expect(answers[0]?.options).toHaveLength(2);
    });

    it("reads a dialog sent back to clarify as an answer", () => {
        const clarified = turns.find((t) => t.clarify);
        expect(clarified).toMatchObject({
            kind: "answer",
            answers: [{ question: "Which way?", answer: null }],
        });
    });

    it("keeps what a person said rejecting a tool", () => {
        expect(find("use tabs instead")).toMatchObject({
            kind: "rejection",
            rejectedTool: "Edit",
        });
    });

    it("reads slash commands and interrupts", () => {
        expect(find("/review high")?.kind).toBe("command");
        expect(turns.filter((t) => t.kind === "interrupt")).toHaveLength(1);
    });

    it("reads a relayed message's sender", () => {
        expect(find("Please fix line 3")).toMatchObject({
            kind: "relayed",
            from: "reviewer",
            context: "Relaying now.",
        });
    });

    it("keeps a queued prompt, and counts images", () => {
        expect(find("and the tests too")).toMatchObject({
            kind: "typed",
            queued: true,
        });
        expect(find("look at this")?.images).toBe(1);
    });

    it("keeps one copy of a record two files share", () => {
        expect(turns.filter((t) => t.text === "yes please")).toHaveLength(1);
        expect(find("yes please")?.context).toBe("Shall I start?");
    });

    it("keeps a correction repeated in the same words", () => {
        expect(
            turns
                .filter((t) => t.text === "no, leave it")
                .map((t) => t.context),
        ).toEqual(["Shall I delete the cache?", "Shall I push the branch?"]);
    });

    it("leaves other directories and subagents out", () => {
        expect(find("not this repository")).toBeUndefined();
        expect(find("a subagent's prompt")).toBeUndefined();
    });
});

describe("Codex", () => {
    it("drops injected instructions and skills, keeping typed text", () => {
        const codex = turns.filter((t) => t.tool === "codex");
        expect(codex.map((t) => t.kind)).toEqual(["typed", "relayed", "typed"]);
        expect(find("review the skill")).toMatchObject({
            session: "x1",
            cwd: `${REPO}.wt/feature`,
            context: null,
        });
    });

    it("keeps a prompt sent twice", () => {
        expect(turns.filter((t) => t.text === "review the skill")).toHaveLength(
            2,
        );
    });

    it("reads a relayed message's sender and route", () => {
        expect(find("Agreed, go ahead")).toMatchObject({
            from: "al___reviewer",
            via: "scheduled",
            context: "Found two problems.",
        });
    });

    it("leaves spawned agents' sessions out", () => {
        expect(find("a spawned agent's task")).toBeUndefined();
    });
});

describe("options", () => {
    it("counts what it wrote on stderr", () => {
        expect(stderr).toMatch(/^\d+ turns from 2 sessions: /);
    });

    it("takes every session without --match", () => {
        expect(
            extract().turns.some((t) => t.text === "not this repository"),
        ).toBe(true);
    });

    it("includes subagents when asked", () => {
        const all = extract(...repo, "--include-subagents").turns;
        expect(all.some((t) => t.text === "a subagent's prompt")).toBe(true);
        expect(all.some((t) => t.text === "a spawned agent's task")).toBe(true);
    });

    it("filters by tool and kind", () => {
        const answers = extract(
            ...repo,
            "--tool",
            "claude",
            "--kinds",
            "answer",
        );
        expect(
            new Set(answers.turns.map((t) => `${t.tool} ${t.kind}`)),
        ).toEqual(new Set(["claude answer"]));
    });

    it("cuts or drops context", () => {
        const cut = extract(...repo, "--max-context", "5").turns;
        expect(cut.find((t) => t.text === "yes please")?.context).toBe(
            "...tart?",
        );
        const none = extract(...repo, "--max-context", "0").turns;
        expect(none.every((t) => t.context === null)).toBe(true);
    });

    it("redacts every string it writes", () => {
        const redacted = extract(
            ...repo,
            "--redact",
            "my-repo=REPO",
            "--redact",
            "reviewer",
        ).turns;
        const text = JSON.stringify(redacted);
        expect(text).not.toContain("my-repo");
        expect(text).toContain("/work/REPO");
        expect(text).toContain("[redacted]");
    });

    it("refuses to run without --output, or with a bad option", () => {
        const bare = spawnSync("node", [script], { encoding: "utf8" });
        expect(bare.status).toBe(2);
        expect(bare.stderr).toContain("--output is required");
        expect(extract("--kinds", "nonsense").status).toBe(2);
        expect(extract("--max-context", "-1").status).toBe(2);
    });
});
