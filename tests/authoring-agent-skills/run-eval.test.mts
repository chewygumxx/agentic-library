// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/authoring-agent-skills/run-eval.test.mts
//
//

// run-eval.mjs, with stand-ins for claude and codex in bin/: what it
// records of a run, and what its jail and probe keep a run from seeing
// or changing. Needs bubblewrap; skipped where it is missing.

import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
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
    "run-eval.mjs",
);
const stubs = join(import.meta.dir, "bin");
const hasBwrap = !spawnSync("bwrap", ["--version"]).error;
const SKILL = "processing-things";

// A fresh home, client homes, a case and a skill, all under one root.
function world() {
    const root = mkdtempSync(join(tmpdir(), "run-eval-"));
    const home = join(root, "home");
    const claudeHome = join(home, ".claude");
    const codexHome = join(home, ".codex");
    for (const dir of [
        join(claudeHome, "skills"),
        join(codexHome, "skills"),
        join(root, "case", "files"),
        join(root, "skills", SKILL),
    ]) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(join(root, "case", "prompt.md"), "make a skill\n");
    writeFileSync(join(root, "case", "files", "notes.md"), "notes\n");
    writeFileSync(
        join(root, "skills", SKILL, "SKILL.md"),
        `---\nname: ${SKILL}\ndescription: Processes things. Use when needed.\n---\n`,
    );
    const env: Record<string, string | undefined> = {
        ...process.env,
        HOME: home,
        CLAUDE_CONFIG_DIR: claudeHome,
        CODEX_HOME: codexHome,
        PATH: `${stubs}:${process.env.PATH}`,
        STUB_SKILL: SKILL,
    };
    return { root, home, claudeHome, codexHome, env };
}

function run(
    w: ReturnType<typeof world>,
    options: { client?: string; arm?: string; mode?: string; extra?: string[] },
) {
    const out = join(
        w.root,
        "out",
        `${options.client ?? "claude"}-${options.arm ?? "with"}-${options.mode ?? "use"}`,
    );
    const result = spawnSync(
        "node",
        [
            script,
            "--client",
            options.client ?? "claude",
            "--model",
            "m",
            "--case",
            join(w.root, "case"),
            "--arm",
            options.arm ?? "with",
            "--skill",
            join(w.root, "skills", SKILL),
            "--out",
            out,
            ...(options.extra ?? []),
        ],
        {
            encoding: "utf8",
            env: { ...w.env, STUB_MODE: options.mode ?? "use" },
        },
    );
    const file = join(out, "result.json");
    const record = existsSync(file)
        ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>)
        : null;
    return { ...result, out, record };
}

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

    it("marks a without run that names the skill", () => {
        const w = world();
        const r = run(w, { arm: "without", mode: "name" });
        expect(r.record?.status).toBe("contaminated");
    });

    it("marks a run that installs a skill in a client's state", () => {
        const w = world();
        const r = run(w, { mode: "leak" });
        expect(r.record?.status).toBe("leaked");
        expect(String(r.record?.leaked)).toContain("installed");
    });
});

describe.skipIf(!hasBwrap)("the jail", () => {
    it("refuses writes to skills directories and the home", () => {
        const w = world();
        const r = run(w, { mode: "escape" });
        expect(r.record?.status).toBe("ok");
        expect(existsSync(join(w.claudeHome, "skills", "escaped"))).toBe(false);
        expect(existsSync(join(w.home, "escaped"))).toBe(false);
        expect(readFileSync(join(r.out, "stderr.log"), "utf8")).not.toContain(
            "wrote skills",
        );
    });

    it("hides past sessions, so a copy there passes the probe", () => {
        const w = world();
        mkdirSync(join(w.claudeHome, "file-history"), { recursive: true });
        writeFileSync(
            join(w.claudeHome, "file-history", "x"),
            `name: ${SKILL}\n`,
        );
        const r = run(w, { arm: "without", extra: ["--probe"] });
        expect(r.status).toBe(0);
        expect(r.stdout).toContain("probe passed");
    });

    it("refuses a without run that could read the skill", () => {
        const w = world();
        mkdirSync(join(w.claudeHome, "notes"), { recursive: true });
        writeFileSync(
            join(w.claudeHome, "notes", "copy.md"),
            `name: ${SKILL}\n`,
        );
        const r = run(w, { arm: "without" });
        expect(r.status).toBe(3);
        expect(r.stderr).toContain("baseline can read the skill");
        expect(r.record).toBeNull();
    });

    it("passes the probe once that copy is hidden", () => {
        const w = world();
        mkdirSync(join(w.claudeHome, "notes"), { recursive: true });
        writeFileSync(
            join(w.claudeHome, "notes", "copy.md"),
            `name: ${SKILL}\n`,
        );
        const r = run(w, {
            arm: "without",
            extra: ["--hide", join(w.claudeHome, "notes"), "--probe"],
        });
        expect(r.status).toBe(0);
    });
});

describe.skipIf(!hasBwrap)("inside a git hook", () => {
    it("leaves the hook's repository alone, and runs no hook", () => {
        const w = world();
        const decoy = join(w.root, "decoy");
        mkdirSync(join(decoy, "hooks"), { recursive: true });
        const clean = Object.fromEntries(
            Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
        );
        spawnSync("git", ["init", "-q", decoy], { env: clean });
        writeFileSync(
            join(decoy, "hooks", "pre-commit"),
            `#!/bin/sh\ntouch ${join(w.root, "hook-ran")}\n`,
            { mode: 0o755 },
        );
        spawnSync(
            "git",
            ["-C", decoy, "config", "core.hooksPath", join(decoy, "hooks")],
            { env: clean },
        );
        // A pre-commit check exports these, as git does for a worktree.
        w.env = {
            ...w.env,
            GIT_DIR: join(decoy, ".git"),
            GIT_INDEX_FILE: join(decoy, ".git", "index"),
        };
        const r = run(w, {});
        expect(r.record?.status).toBe("ok");
        expect(existsSync(join(w.root, "hook-ran"))).toBe(false);
        const count = spawnSync(
            "git",
            ["-C", decoy, "rev-list", "--all", "--count"],
            {
                encoding: "utf8",
                env: clean,
            },
        );
        expect(count.stdout.trim()).toBe("0");
        const log = spawnSync(
            "git",
            ["-C", join(r.out, "workspace"), "log", "--format=%s"],
            {
                encoding: "utf8",
                env: clean,
            },
        );
        expect(log.stdout.trim()).toBe("fixture");
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
