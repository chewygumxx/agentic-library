// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/authoring-agent-skills/blind-grades.test.mts
//
//

// blind-grades.mjs over made-up runs in run-eval.mjs's layout: blinding
// keeps nothing that names the arm, and unblinding puts each grade back
// and totals it.

import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    readlinkSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = join(
    import.meta.dir,
    "..",
    "..",
    "skills",
    "authoring-agent-skills",
    "scripts",
    "blind-grades.mjs",
);
const SKILL = "processing-things";

// The environment without git's hook variables, which a pre-commit check
// that runs these tests exports, pointing at the repository it checks.
const clean = () =>
    Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
    );

// A repository whose pre-commit hook leaves a mark, to aim GIT_DIR at.
function decoy(root: string) {
    const dir = join(root, "decoy");
    mkdirSync(join(dir, "hooks"), { recursive: true });
    spawnSync("git", ["init", "-q", dir], { env: clean() });
    writeFileSync(
        join(dir, "hooks", "pre-commit"),
        `#!/bin/sh\ntouch ${join(root, "hook-ran")}\n`,
        { mode: 0o755 },
    );
    spawnSync(
        "git",
        ["-C", dir, "config", "core.hooksPath", join(dir, "hooks")],
        { env: clean() },
    );
    return { gitDir: join(dir, ".git"), marker: join(root, "hook-ran") };
}

function runs() {
    const root = mkdtempSync(join(tmpdir(), "blind-grades-"));
    const runsDir = join(root, "runs");
    for (const arm of ["with", "without"]) {
        const run = join(runsDir, "m", "case-0", arm);
        const ws = join(run, "workspace");
        mkdirSync(join(ws, "skills", "made"), { recursive: true });
        writeFileSync(
            join(ws, "skills", "made", "SKILL.md"),
            "---\nname: made\n---\n",
        );
        if (arm === "with") {
            mkdirSync(join(ws, ".claude", "skills", SKILL), {
                recursive: true,
            });
            writeFileSync(
                join(ws, ".claude", "skills", SKILL, "SKILL.md"),
                "x",
            );
        }
        const git = (...a: string[]) =>
            spawnSync(
                "git",
                ["-c", "core.hooksPath=/dev/null", "-C", ws, ...a],
                {
                    env: clean(),
                },
            );
        git("init", "-q");
        git("add", "-A");
        git(
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@t",
            "commit",
            "-qm",
            "fixture",
        );
        writeFileSync(
            join(ws, "skills", "made", "notes.md"),
            `Made in ${ws}, per ${SKILL}.\n`,
        );
        git("add", "-A");
        git(
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@t",
            "commit",
            "-qm",
            "work",
        );
        symlinkSync("skills/made/SKILL.md", join(ws, "inside-link"));
        symlinkSync(join(run, "result.json"), join(ws, "outside-link"));
        // Inside by its path, outside by where it leads.
        symlinkSync(run, join(ws, "via"));
        symlinkSync("via/result.json", join(ws, "sneaky-link"));
        writeFileSync(join(run, "changes.txt"), "");
        writeFileSync(
            join(run, "result.json"),
            JSON.stringify({
                client: "claude",
                model: "m",
                case: "case",
                arm,
                skill: SKILL,
                status: "ok",
                tokens: arm === "with" ? 200 : 100,
                duration_ms: 1000,
                skills_written: [
                    { dir: "skills/made", errors: [], warnings: [] },
                ],
                final_message: `See ${ws}/skills/made/SKILL.md, per ${SKILL}.`,
            }),
        );
    }
    return { root, runsDir, blindDir: join(root, "blind") };
}

const cli = (...args: string[]) =>
    spawnSync("node", [script, ...args], { encoding: "utf8", env: clean() });

const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
    );

describe("blind", () => {
    it("copies each ok run under a random id, keeping its map apart", () => {
        const r = runs();
        const out = cli("blind", r.runsDir, r.blindDir);
        expect(out.status).toBe(0);
        const ids = readdirSync(join(r.blindDir, "case"));
        expect(ids).toHaveLength(2);
        expect(existsSync(join(r.runsDir, "blind-map.json"))).toBe(true);
        expect(existsSync(join(r.blindDir, "blind-map.json"))).toBe(false);
        expect(
            existsSync(
                join(
                    r.blindDir,
                    "case",
                    ids[0] ?? "",
                    "skill",
                    "skills",
                    "made",
                    "SKILL.md",
                ),
            ),
        ).toBe(true);
        expect(
            readFileSync(
                join(r.blindDir, "case", ids[0] ?? "", "git-log.txt"),
                "utf8",
            ),
        ).toContain("work");
    });

    it("leaves nothing naming the arm or the skill", () => {
        const r = runs();
        cli("blind", r.runsDir, r.blindDir);
        for (const f of files(r.blindDir)) {
            const text = readFileSync(f, "utf8");
            expect([f, text.includes(SKILL)]).toEqual([f, false]);
            expect([f, /\/(with|without)\//.test(text)]).toEqual([f, false]);
        }
    });

    it("reads each run's own history, whatever git's hook variables say", () => {
        const r = runs();
        const d = decoy(r.root);
        const out = spawnSync(
            "node",
            [script, "blind", r.runsDir, r.blindDir],
            {
                encoding: "utf8",
                env: {
                    ...clean(),
                    GIT_DIR: d.gitDir,
                    GIT_INDEX_FILE: join(d.gitDir, "index"),
                },
            },
        );
        expect(out.status).toBe(0);
        const id = readdirSync(join(r.blindDir, "case"))[0] ?? "";
        expect(
            readFileSync(join(r.blindDir, "case", id, "git-log.txt"), "utf8"),
        ).toContain("work");
    });

    it("keeps links inside the copy, and withholds the rest", () => {
        const r = runs();
        const result = join(r.runsDir, "m", "case-0", "with", "result.json");
        const before = readFileSync(result, "utf8");
        cli("blind", r.runsDir, r.blindDir);
        expect(readFileSync(result, "utf8")).toBe(before);
        for (const id of readdirSync(join(r.blindDir, "case"))) {
            const ws = join(r.blindDir, "case", id, "workspace");
            expect(readlinkSync(join(ws, "inside-link"))).toBe(
                "skills/made/SKILL.md",
            );
            expect(existsSync(join(ws, "outside-link"))).toBe(false);
            expect(
                readFileSync(
                    join(r.blindDir, "case", id, "withheld-links.txt"),
                    "utf8",
                ),
            ).toBe(
                "workspace/outside-link\nworkspace/sneaky-link\nworkspace/via\n",
            );
        }
    });

    it("leaves out a run that never reported its end", () => {
        const r = runs();
        const file = join(r.runsDir, "m", "case-0", "with", "result.json");
        const res = JSON.parse(readFileSync(file, "utf8"));
        writeFileSync(file, JSON.stringify({ ...res, ended: false }));
        cli("blind", r.runsDir, r.blindDir);
        expect(readdirSync(join(r.blindDir, "case"))).toHaveLength(1);
        expect(
            JSON.parse(
                readFileSync(join(r.runsDir, "blind-excluded.json"), "utf8"),
            ),
        ).toEqual([
            { run: "m/case-0/with", status: "ok", reason: "never ended" },
        ]);
    });

    it("refuses a blind directory inside the runs", () => {
        const r = runs();
        expect(cli("blind", r.runsDir, join(r.runsDir, "blind")).status).toBe(
            2,
        );
    });
});

describe("unblind", () => {
    it("puts each grade back, the checker's from the run, and totals them", () => {
        const r = runs();
        cli("blind", r.runsDir, r.blindDir);
        for (const id of readdirSync(join(r.blindDir, "case"))) {
            writeFileSync(
                join(r.blindDir, "case", id, "grading.json"),
                JSON.stringify({
                    assertion_results: [
                        {
                            text: "check-skill.mjs reports no errors",
                            passed: false,
                            evidence: "renamed",
                        },
                        { text: "It works", passed: true, evidence: "yes" },
                    ],
                }),
            );
        }
        const out = cli("unblind", r.runsDir, r.blindDir, "--json");
        expect(out.status).toBe(0);
        const report = JSON.parse(out.stdout);
        expect(report.by_arm.with).toMatchObject({
            passed: 2,
            total: 2,
            mean_tokens: 200,
        });
        expect(report.by_arm.without).toMatchObject({ passed: 2, total: 2 });
        const grading = JSON.parse(
            readFileSync(
                join(r.runsDir, "m", "case-0", "with", "grading.json"),
                "utf8",
            ),
        );
        expect(grading.assertion_results[0].passed).toBe(true);
        expect(grading.summary).toMatchObject({ passed: 2, total: 2 });
    });

    it("holds grades to the frozen assertions, and checks only those asked", () => {
        const r = runs();
        const evals = join(r.root, "evals.json");
        writeFileSync(
            evals,
            JSON.stringify({
                evals: [
                    {
                        name: "case",
                        assertions: [
                            { text: "The skill passes", check: "check-skill" },
                            "It mentions check-skill",
                        ],
                    },
                ],
            }),
        );
        cli("blind", r.runsDir, r.blindDir, "--evals", evals);
        const ids = readdirSync(join(r.blindDir, "case")).filter(
            (e) => e !== "assertions.json",
        );
        expect(
            JSON.parse(
                readFileSync(
                    join(r.blindDir, "case", "assertions.json"),
                    "utf8",
                ),
            ).map((a: { id: string }) => a.id),
        ).toEqual(["A1", "A2"]);
        const [good, bad] = ids;
        const grade = (id: string, results: unknown[]) =>
            writeFileSync(
                join(r.blindDir, "case", id, "grading.json"),
                JSON.stringify({ assertion_results: results }),
            );
        grade(good ?? "", [
            { id: "A1", passed: false, evidence: "x" },
            { id: "A2", passed: false, evidence: "no mention" },
        ]);
        grade(bad ?? "", [{ id: "A1", passed: "yes", evidence: "" }]);
        const out = cli("unblind", r.runsDir, r.blindDir, "--json");
        expect(out.status).toBe(1);
        const report = JSON.parse(out.stdout);
        expect(report.invalid_grading).toHaveLength(1);
        expect(report.invalid_grading[0]).toContain("A2 missing");
        expect(report.by_arm.with ?? report.by_arm.without).toMatchObject({
            passed: 1,
            total: 2,
            runs: 1,
        });
    });

    it("keeps the rubric from the graders' reach, and fails closed", () => {
        const r = runs();
        const evals = join(r.root, "evals.json");
        writeFileSync(
            evals,
            JSON.stringify({
                evals: [
                    {
                        name: "case",
                        assertions: [
                            "It works",
                            {
                                text: "The archive is right",
                                check: "zip-layout",
                            },
                        ],
                    },
                ],
            }),
        );
        expect(
            cli(
                "blind",
                r.runsDir,
                r.blindDir,
                "--evals",
                join(r.root, "none.json"),
            ).status,
        ).toBe(2);
        writeFileSync(
            join(r.root, "other.json"),
            JSON.stringify({ evals: [] }),
        );
        expect(
            cli(
                "blind",
                r.runsDir,
                r.blindDir,
                "--evals",
                join(r.root, "other.json"),
            ).status,
        ).toBe(2);
        cli("blind", r.runsDir, r.blindDir, "--evals", evals);
        rmSync(join(r.blindDir, "case", "assertions.json"));
        const ids = readdirSync(join(r.blindDir, "case"));
        for (const id of ids) {
            writeFileSync(
                join(r.blindDir, "case", id, "grading.json"),
                JSON.stringify({
                    assertion_results: [
                        { id: "A1", passed: true, evidence: "x" },
                        { id: "A9", passed: true, evidence: "x" },
                    ],
                }),
            );
        }
        const bad = JSON.parse(
            cli("unblind", r.runsDir, r.blindDir, "--json").stdout,
        );
        expect(bad.invalid_grading).toHaveLength(2);
        const rubric = join(r.runsDir, "blind-rubric.json");
        const kept = readFileSync(rubric, "utf8");
        rmSync(rubric);
        expect(cli("unblind", r.runsDir, r.blindDir).status).toBe(2);
        writeFileSync(rubric, kept);
        const runDirs = ["with", "without"].map((a) =>
            join(r.runsDir, "m", "case-0", a),
        );
        for (const id of ids) {
            writeFileSync(
                join(r.blindDir, "case", id, "grading.json"),
                JSON.stringify({
                    assertion_results: [
                        { id: "A1", passed: true, evidence: "x" },
                        { id: "A2", passed: true, evidence: "graded" },
                    ],
                }),
            );
        }
        const unchecked = JSON.parse(
            cli("unblind", r.runsDir, r.blindDir, "--json").stdout,
        );
        expect(unchecked.invalid_grading[0]).toContain("zip-layout");
        writeFileSync(
            join(runDirs[0] ?? "", "checks.json"),
            JSON.stringify({
                "zip-layout": { passed: true, evidence: { a: 1 } },
            }),
        );
        expect(
            JSON.parse(cli("unblind", r.runsDir, r.blindDir, "--json").stdout)
                .invalid_grading[0],
        ).toContain("zip-layout");
        writeFileSync(
            join(runDirs[0] ?? "", "checks.json"),
            JSON.stringify({
                "zip-layout": { passed: false, evidence: "flat" },
            }),
        );
        writeFileSync(
            join(runDirs[1] ?? "", "checks.json"),
            JSON.stringify({
                "zip-layout": { passed: true, evidence: "nested" },
            }),
        );
        const out = cli("unblind", r.runsDir, r.blindDir, "--json");
        expect(out.status).toBe(0);
        const report = JSON.parse(out.stdout);
        expect(report.by_arm.with).toMatchObject({ passed: 1, total: 2 });
        expect(report.by_arm.without).toMatchObject({ passed: 2, total: 2 });
    });

    it("exits 1 when a run has no grading", () => {
        const r = runs();
        cli("blind", r.runsDir, r.blindDir);
        expect(cli("unblind", r.runsDir, r.blindDir).status).toBe(1);
    });
});
