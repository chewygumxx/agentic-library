// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/authoring-agent-skills/check-skill.test.mts
//
//

// check-skill.mjs: each finding fires on a skill made to break it, and
// stays quiet on one that does not; its exit codes and output forms.

import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
    chmodSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const root = join(import.meta.dir, "..", "..");
const script = join(
    root,
    "skills",
    "authoring-agent-skills",
    "scripts",
    "check-skill.mjs",
);

type Finding = {
    skill: string;
    level: "error" | "warning";
    code: string;
    file: string;
    line: number | null;
    message: string;
};

const GOOD_FRONT = [
    "name: processing-things",
    "description: >-",
    "  Processes things into other things. Use when a thing needs",
    "  processing.",
    "license: MIT",
];

// Writes a skill named `name` holding `files`, SKILL.md built from its
// frontmatter lines and body unless given whole, and returns its path.
function skill(
    name: string,
    options: {
        front?: string[];
        body?: string;
        skillMd?: string;
        files?: Record<string, string>;
    } = {},
) {
    const base = mkdtempSync(join(tmpdir(), "check-skill-"));
    const dir = join(base, name);
    mkdirSync(dir, { recursive: true });
    const front = options.front ?? GOOD_FRONT;
    writeFileSync(
        join(dir, "SKILL.md"),
        options.skillMd ??
            `---\n${front.join("\n")}\n---\n\n${options.body ?? "# Things\n"}`,
    );
    for (const [path, text] of Object.entries(options.files ?? {})) {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), text);
    }
    return dir;
}

function run(...args: string[]) {
    const result = spawnSync("node", [script, ...args], { encoding: "utf8" });
    return {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
    };
}

function findings(dir: string, ...args: string[]): Finding[] {
    const result = run("--json", ...args, dir);
    rmSync(dirname(dir), { recursive: true, force: true });
    return JSON.parse(result.stdout) as Finding[];
}

const codes = (list: Finding[]) => list.map((f) => `${f.level} ${f.code}`);

describe("a skill that keeps every rule", () => {
    it("has no findings and exits 0", () => {
        const dir = skill("processing-things");
        const result = run(dir);
        rmSync(dirname(dir), { recursive: true, force: true });
        expect(result.stdout).toBe("");
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("0 error(s), 0 warning(s)");
    });

    it("reads block, quoted and list frontmatter, and metadata strings", () => {
        const list = findings(
            skill("processing-things", {
                front: [
                    "name: 'processing-things'",
                    "description: |",
                    "  Processes things.",
                    "  Use when there are things.",
                    'license: "MIT"',
                    "compatibility: Node 22",
                    "metadata:",
                    "  author: someone",
                    '  version: "1.0"',
                    "allowed-tools: Bash(git:*) Read",
                ],
            }),
        );
        expect(list).toEqual([]);
    });
});

describe("errors", () => {
    const cases: [string, Parameters<typeof skill>[1], string, string?][] = [
        ["frontmatter", { skillMd: "# No frontmatter\n" }, "frontmatter"],
        [
            "an unclosed frontmatter",
            { skillMd: "---\nname: x\n" },
            "frontmatter",
        ],
        [
            "a name not its directory's",
            { front: ["name: processing-others", ...GOOD_FRONT.slice(1)] },
            "name-directory",
        ],
        [
            "a name with a reserved word",
            { front: ["name: claude-processing", ...GOOD_FRONT.slice(1)] },
            "name-reserved",
            "claude-processing",
        ],
        [
            "a name of other characters",
            { front: ["name: Processing--Things", ...GOOD_FRONT.slice(1)] },
            "name-characters",
            "Processing--Things",
        ],
        [
            "a name past 64 characters",
            { front: [`name: ${"a".repeat(65)}`, ...GOOD_FRONT.slice(1)] },
            "name-length",
            "a".repeat(65),
        ],
        [
            "no description",
            { front: ["name: processing-things"] },
            "description-missing",
        ],
        [
            "a description past 1024 characters",
            {
                front: [
                    "name: processing-things",
                    `description: Processes. Use when ${"x".repeat(1024)}`,
                ],
            },
            "description-length",
        ],
        [
            "an XML tag in the description",
            {
                front: [
                    "name: processing-things",
                    "description: Processes <b>things</b>. Use when needed.",
                ],
            },
            "description-xml",
        ],
        [
            "a compatibility past 500 characters",
            { front: [...GOOD_FRONT, `compatibility: ${"x".repeat(501)}`] },
            "compatibility",
        ],
        [
            "metadata holding a number",
            { front: [...GOOD_FRONT, "metadata:", "  version: 1.0"] },
            "metadata",
        ],
        [
            "a link leaving the skill",
            { body: "See [out](../elsewhere.md).\n" },
            "link-outside",
        ],
        [
            "a link to nothing",
            { body: "See [gone](references/gone.md).\n" },
            "link-broken",
        ],
    ];

    for (const [what, options, code, name] of cases) {
        it(`reports ${what} as ${code}`, () => {
            const list = findings(skill(name ?? "processing-things", options));
            expect(codes(list)).toContain(`error ${code}`);
        });
    }

    it("exits 1 on an error", () => {
        const dir = skill("processing-things", { body: "[x](gone.md)\n" });
        const result = run(dir);
        rmSync(dirname(dir), { recursive: true, force: true });
        expect(result.status).toBe(1);
        expect(result.stdout).toMatch(
            /^processing-things error link-broken SKILL\.md:\d+ /m,
        );
    });
});

describe("warnings", () => {
    const description = (text: string) => [
        "name: processing-things",
        `description: ${text}`,
        "license: MIT",
    ];
    const cases: [string, Parameters<typeof skill>[1], string, string?][] = [
        [
            "a first-person description",
            { front: description("I process things. Use when needed.") },
            "description-person",
        ],
        [
            "a description never saying when",
            { front: description("Processes things.") },
            "description-trigger",
        ],
        [
            "a description saying when first",
            { front: description("Use when things. Processes them.") },
            "description-order",
        ],
        [
            "angle brackets in the description",
            { front: description("Processes a thing > another. Use when.") },
            "description-brackets",
        ],
        [
            "a Claude Code field",
            { front: [...GOOD_FRONT, "disable-model-invocation: true"] },
            "key-claude-code",
        ],
        [
            "a field of no specification",
            { front: [...GOOD_FRONT, "version: 1.0.0"] },
            "key-unknown",
        ],
        ["no licence", { front: GOOD_FRONT.slice(0, -1) }, "license"],
        [
            "a name without a gerund",
            { front: ["name: thing-processor", ...GOOD_FRONT.slice(1)] },
            "name-gerund",
            "thing-processor",
        ],
        [
            "a vague name",
            { front: ["name: utils", ...GOOD_FRONT.slice(1)] },
            "name-vague",
            "utils",
        ],
        ["a body past 500 lines", { body: "line\n".repeat(501) }, "body-lines"],
        [
            "a body past 5,000 tokens",
            { body: "word ".repeat(4200) },
            "body-tokens",
        ],
        [
            "a reference reached only through another",
            {
                body: "See [a](references/a.md).\n",
                files: {
                    "references/a.md": "See [b](b.md).\n",
                    "references/b.md": "B\n",
                },
            },
            "reference-nested",
        ],
        [
            "a reference never linked",
            { files: { "references/a.md": "A\n" } },
            "reference-unlinked",
        ],
        [
            "a long reference without contents",
            {
                body: "See [a](references/a.md).\n",
                files: { "references/a.md": "line\n".repeat(101) },
            },
            "reference-toc",
        ],
        [
            "a date-bound instruction",
            { body: "Before August 2025, use the old API.\n" },
            "time-sensitive",
        ],
        [
            "a backslashed link",
            {
                body: "See [a](references\\a.md).\n",
                files: { "references/a.md": "A\n" },
            },
            "path-backslash",
        ],
        [
            "a named script with no #! line",
            {
                body: "Run `scripts/go.sh`.\n",
                files: { "scripts/go.sh": "true\n" },
            },
            "script-shebang",
        ],
        [
            "a broken link in a file no agent reaches",
            { files: { "README.md": "[gone](gone.md)\n" } },
            "link-broken",
        ],
    ];

    for (const [what, options, code, name] of cases) {
        it(`reports ${what} as ${code}`, () => {
            const list = findings(skill(name ?? "processing-things", options));
            expect(codes(list)).toContain(`warning ${code}`);
            expect(list.filter((f) => f.level === "error")).toEqual([]);
        });
    }

    it("exits 0 on warnings alone, and 1 with --strict", () => {
        const dir = skill("processing-things", {
            front: description("Processes things."),
        });
        expect(run(dir).status).toBe(0);
        expect(run("--strict", dir).status).toBe(1);
        expect(
            run("--strict", "--ignore", "description-trigger", dir).status,
        ).toBe(0);
        rmSync(dirname(dir), { recursive: true, force: true });
    });
});

describe("what it leaves alone", () => {
    it("skips links in fenced code, inline code and URLs", () => {
        const list = findings(
            skill("processing-things", {
                body: [
                    "```markdown",
                    "[template](chapters/<slug>.md)",
                    "```",
                    "`[inline](nowhere.md)` and [web](https://example.com/x.md)",
                    "and [anchor](#things).",
                ].join("\n"),
            }),
        );
        expect(list).toEqual([]);
    });

    it("leaves a script no file names, such as a module", () => {
        const list = findings(
            skill("processing-things", {
                files: { "scripts/helpers.py": "x = 1\n" },
            }),
        );
        expect(list).toEqual([]);
    });

    it("accepts a long reference with a contents heading", () => {
        const list = findings(
            skill("processing-things", {
                body: "See [a](references/a.md).\n",
                files: {
                    "references/a.md": `# A\n\n## Contents\n\n${"line\n".repeat(120)}`,
                },
            }),
        );
        expect(list).toEqual([]);
    });
});

describe("--run-help", () => {
    it("warns on a named script whose --help fails", () => {
        const dir = skill("processing-things", {
            body: "Run `scripts/go.sh`.\n",
            files: { "scripts/go.sh": "#!/bin/sh\nexit 3\n" },
        });
        chmodSync(join(dir, "scripts", "go.sh"), 0o755);
        expect(codes(findings(dir, "--run-help"))).toContain(
            "warning script-help",
        );
    });
});

describe("arguments", () => {
    it("checks each skill in a skills directory", () => {
        const one = skill("processing-things");
        const other = join(dirname(one), "writing-things");
        mkdirSync(other);
        writeFileSync(
            join(other, "SKILL.md"),
            "---\nname: writing-things\ndescription: Writes. Use when.\nlicense: MIT\n---\n",
        );
        const result = run(dirname(one));
        rmSync(dirname(one), { recursive: true, force: true });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("2 skill(s)");
    });

    it("exits 2 on a path holding no skill, or no path", () => {
        const empty = mkdtempSync(join(tmpdir(), "check-skill-"));
        expect(run(empty).status).toBe(2);
        expect(run().status).toBe(2);
        rmSync(empty, { recursive: true, force: true });
    });
});

describe("this repository's skills", () => {
    it("have no errors", () => {
        const result = run("--json", join(root, "skills"));
        const errors = (JSON.parse(result.stdout) as Finding[]).filter(
            (f) => f.level === "error",
        );
        expect(errors).toEqual([]);
    });
});
