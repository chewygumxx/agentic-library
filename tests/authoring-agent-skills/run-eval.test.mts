// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/authoring-agent-skills/run-eval.test.mts
//
//

// run-eval.mjs, with stand-ins for claude and codex in bin/: what it
// records of a run, and the arguments it refuses. Its jail and probe are
// in run-eval-jail.test.mts. Needs bubblewrap; skipped where it is
// missing.

import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hasBwrap, run, SKILL, script, world } from "./run-eval-world.mts";

describe.skipIf(!hasBwrap)("a run", () => {
    it("records a with run that read the skill and wrote one", () => {
        const w = world();
        const r = run(w, {});
        expect(r.status).toBe(0);
        expect(r.record).toMatchObject({
            status: "ok",
            arm: "with",
            case: "case",
            loaded_skill: true,
            tokens: 120,
            cost_usd: 0.01,
            final_message: "Done.",
        });
        expect(r.record?.skills_written).toEqual([
            { dir: "skills/made", errors: [], warnings: expect.any(Array) },
        ]);
        expect(
            existsSync(
                join(
                    r.out,
                    "workspace",
                    ".claude",
                    "skills",
                    SKILL,
                    "SKILL.md",
                ),
            ),
        ).toBe(true);
    });

    it("installs a snapshot under the skill's own name", () => {
        const w = world();
        const snapshot = join(w.root, "snapshot");
        mkdirSync(snapshot);
        writeFileSync(
            join(snapshot, "SKILL.md"),
            `---\nname: "${SKILL}"\ndescription: Processes things. Use when needed.\n---\n`,
        );
        const out = join(w.root, "out", "snap");
        const r = spawnSync(
            "node",
            [
                script,
                ...["--client", "claude", "--model", "m", "--arm", "with"],
                ...["--case", join(w.root, "case"), "--skill", snapshot],
                ...["--out", out],
            ],
            { encoding: "utf8", env: { ...w.env, STUB_MODE: "use" } },
        );
        expect(r.status).toBe(0);
        const record = JSON.parse(
            readFileSync(join(out, "result.json"), "utf8"),
        );
        expect(record).toMatchObject({ skill: SKILL, loaded_skill: true });
        expect(
            existsSync(
                join(out, "workspace", ".agents", "skills", SKILL, "SKILL.md"),
            ),
        ).toBe(true);
    });

    it.each([
        [`name: ${SKILL} # the skill`, 0],
        [`name: '${SKILL}' # quoted`, 0],
        ["name: ../escaped", 2],
    ])(
        "reads %s as YAML, and refuses a name a path cannot take",
        (line, code) => {
            const w = world();
            const snapshot = join(w.root, "snapshot");
            mkdirSync(snapshot);
            writeFileSync(
                join(snapshot, "SKILL.md"),
                `---\n${line}\ndescription: Processes things. Use when needed.\n---\n`,
            );
            const out = join(w.root, "out", "yaml");
            const r = spawnSync(
                "node",
                [
                    script,
                    ...["--client", "claude", "--model", "m", "--arm", "with"],
                    ...["--case", join(w.root, "case"), "--skill", snapshot],
                    ...["--out", out],
                ],
                { encoding: "utf8", env: { ...w.env, STUB_MODE: "plain" } },
            );
            expect(r.status).toBe(code);
            if (code === 0) {
                expect(
                    existsSync(
                        join(out, "workspace", ".claude", "skills", SKILL),
                    ),
                ).toBe(true);
            } else {
                expect(existsSync(join(w.root, "out", "escaped"))).toBe(false);
                expect(r.stderr).toContain("name");
            }
        },
    );

    it("refuses a baseline whose workspace holds the skill by a quoted name", () => {
        const w = world();
        const copy = join(
            w.root,
            "case",
            "files",
            ".claude",
            "skills",
            "other",
        );
        mkdirSync(copy, { recursive: true });
        writeFileSync(join(copy, "SKILL.md"), `---\nname: "${SKILL}"\n---\n`);
        const r = run(w, { arm: "without", extra: ["--probe"] });
        expect(r.status).toBe(3);
        expect(r.stderr).toContain("baseline can read the skill");
    });

    it("keeps the skill out of a without run's workspace", () => {
        const w = world();
        const r = run(w, { arm: "without", mode: "plain" });
        expect(r.record).toMatchObject({ status: "ok", loaded_skill: false });
        expect(existsSync(join(r.out, "workspace", ".claude"))).toBe(false);
    });

    it("reads Codex's events", () => {
        const w = world();
        const r = run(w, { client: "codex" });
        expect(r.record).toMatchObject({
            status: "ok",
            loaded_skill: true,
            tokens: 230,
            final_message: "Done.",
        });
    });

    it("marks a run a usage limit stopped, and exits 75", () => {
        const w = world();
        const r = run(w, { mode: "limit" });
        expect(r.status).toBe(75);
        expect(r.record?.status).toBe("limited");
    });

    it("counts a without run that only names the skill", () => {
        const w = world();
        const r = run(w, { arm: "without", mode: "name" });
        expect(r.record).toMatchObject({
            status: "ok",
            mentioned_skill: true,
            loaded_skill: false,
        });
    });

    it("marks a without run that read the skill", () => {
        const w = world();
        const r = run(w, { arm: "without", mode: "use" });
        expect(r.record?.status).toBe("contaminated");
    });

    it("counts a without run whose read of the skill failed", () => {
        const w = world();
        const r = run(w, { arm: "without", mode: "tried" });
        expect(r.record).toMatchObject({ status: "ok", loaded_skill: false });
    });

    it.each(["claude", "codex"])(
        "flags, but does not count, a %s command that only names the skill",
        (client) => {
            const w = world();
            const r = run(w, { client, arm: "without", mode: "echo" });
            expect(r.record).toMatchObject({
                status: "ok",
                loaded_skill: false,
                access_unclear: true,
            });
        },
    );

    it("counts a numbered grep of the skill as a read", () => {
        const w = world();
        const r = run(w, { client: "codex", arm: "without", mode: "grep" });
        expect(r.record).toMatchObject({
            status: "contaminated",
            loaded_skill: true,
        });
    });

    it("marks a run of another model than asked", () => {
        const w = world();
        w.env = { ...w.env, STUB_OBSERVED: "other" };
        const r = run(w, {});
        expect(r.record).toMatchObject({
            status: "mismatched",
            observed_model: "other",
            model_check: "mismatch",
        });
    });

    it("fails a run that never reports its end", () => {
        const w = world();
        const r = run(w, { mode: "cut" });
        expect(r.record).toMatchObject({ status: "failed", ended: false });
    });

    it("records the client's version, and Codex's model as unobserved", () => {
        const w = world();
        const r = run(w, { client: "codex" });
        expect(r.record).toMatchObject({
            client_version: "codex-cli 0.0.0",
            model_check: "unobserved",
            ended: true,
        });
    });

    it("marks a run that installs a skill in the person's client state", () => {
        const w = world();
        const r = run(w, { mode: "leak", extra: ["--profile", "person"] });
        expect(r.record?.status).toBe("leaked");
        expect(String(r.record?.leaked)).toContain("installed");
    });
});

describe("arguments", () => {
    it("refuses a missing option, briefly", () => {
        const r = spawnSync("node", [script, "--client", "claude"], {
            encoding: "utf8",
        });
        expect(r.status).toBe(2);
        expect(r.stderr.trim().split("\n")).toHaveLength(1);
    });

    it("refuses an unknown client or arm", () => {
        const w = world();
        expect(run(w, { client: "gemini" }).status).toBe(2);
        expect(run(w, { arm: "maybe" }).status).toBe(2);
    });
});
