// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/authoring-agent-skills/run-eval-jail.test.mts
//
//

// run-eval.mjs's jail and probe, with the stand-in clients in bin/:
// what a run can see and change, what the probe refuses, and git inside
// a hook. Needs bubblewrap; skipped where it is missing.

import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    hasBwrap,
    NODE,
    run,
    SKILL,
    script,
    world,
} from "./run-eval-world.mts";

describe.skipIf(!hasBwrap)("the jail", () => {
    it.each(["with", "without"])(
        "keeps the source, the case, other runs and the host out of a %s run",
        (arm) => {
            const w = world();
            const sibling = run(w, {});
            const host = mkdtempSync(join(tmpdir(), "run-eval-host-"));
            writeFileSync(join(host, "marker"), "host\n");
            const source = join(w.root, "skills", SKILL, "SKILL.md");
            const result = join(sibling.out, "result.json");
            const before = readFileSync(source, "utf8");
            w.env = {
                ...w.env,
                STUB_PEEK: [
                    source,
                    join(w.root, "case", "prompt.md"),
                    result,
                    join(host, "marker"),
                ].join(":"),
                STUB_POKE: [source, result, join(host, "marker")].join(":"),
            };
            const r = run(w, { arm, mode: "peek" });
            expect(r.record?.status).toBe("ok");
            expect(readFileSync(join(r.out, "stderr.log"), "utf8")).toBe("");
            expect(readFileSync(source, "utf8")).toBe(before);
            expect(readFileSync(join(host, "marker"), "utf8")).toBe("host\n");
        },
    );

    it.each([["out", "the run can see beside its output"]])(
        "refuses a run that --ro lets see %s",
        (dir, message) => {
            const w = world();
            mkdirSync(join(w.root, dir), { recursive: true });
            const r = run(w, {
                extra: ["--ro", join(w.root, dir), "--probe"],
            });
            expect(r.status).toBe(3);
            expect(r.stderr).toContain(message);
            expect(readdirSync(join(w.root, "out"))).not.toContainEqual(
                expect.stringMatching(/^\.run-eval-beside/),
            );
        },
    );

    it("keeps a fresh profile's writes in the jail", () => {
        const w = world();
        const leak = run(w, { mode: "leak" });
        expect(leak.record?.status).toBe("ok");
        expect(existsSync(join(w.claudeHome, "installed"))).toBe(false);
        const escaped = run(w, { mode: "escape" });
        expect(escaped.record?.status).toBe("ok");
        expect(existsSync(join(w.claudeHome, "skills", "escaped"))).toBe(false);
        expect(existsSync(join(w.home, "escaped"))).toBe(false);
    });

    it("gives a fresh profile the credentials, and nothing else", () => {
        const w = world();
        writeFileSync(join(w.claudeHome, "CLAUDE.md"), `Use ${SKILL}.\n`);
        w.env = {
            ...w.env,
            STUB_PEEK: [
                join(w.claudeHome, "CLAUDE.md"),
                join(w.home, ".run-eval", "claude", "CLAUDE.md"),
            ].join(":"),
        };
        const r = run(w, { arm: "without", mode: "peek" });
        expect(r.record?.status).toBe("ok");
        expect(readFileSync(join(r.out, "stderr.log"), "utf8")).toBe("");
    });

    it.each(["claude", "codex"])(
        "refuses to run %s signed out, or apart from its binary",
        (client) => {
            const w = world();
            const file =
                client === "claude"
                    ? join(w.claudeHome, ".credentials.json")
                    : join(w.codexHome, "auth.json");
            rmSync(file);
            const r = run(w, { client });
            expect(r.status).toBe(3);
            expect(r.stderr).toContain(`${client} is not signed in`);
            const bare = world();
            bare.env = { ...bare.env, PATH: "/usr/bin:/bin" };
            const s = run(bare, { client });
            expect(s.status).toBe(3);
        },
    );

    it("gives a run its own client's credentials, read-only", () => {
        const w = world();
        const own = join(w.claudeHome, ".credentials.json");
        w.env = {
            ...w.env,
            STUB_PEEK: join(w.home, ".run-eval", "codex", "auth.json"),
            STUB_POKE: join(w.home, ".run-eval", "claude", ".credentials.json"),
        };
        const r = run(w, { mode: "peek" });
        expect(r.record?.status).toBe("ok");
        expect(readFileSync(join(r.out, "stderr.log"), "utf8")).toBe("");
        expect(readFileSync(own, "utf8")).toBe("{}\n");
    });

    it("freezes the installed skill in a with run", () => {
        const w = world();
        const installed = [".claude", ".agents"].map((d) =>
            join("skills", SKILL, "SKILL.md").replace(/^/, `${d}/`),
        );
        w.env = { ...w.env, STUB_POKE: installed.join(":") };
        const r = run(w, { mode: "peek" });
        expect(r.record?.status).toBe("ok");
        expect(readFileSync(join(r.out, "stderr.log"), "utf8")).toBe("");
    });

    it.each([
        ["--ro", "case"],
        ["--rw", "skills"],
    ])("refuses %s over the %s", (flag, dir) => {
        const w = world();
        const r = run(w, { extra: [flag, join(w.root, dir), "--probe"] });
        expect(r.status).toBe(2);
        expect(r.stderr).toContain(`${flag} ${join(w.root, dir)} overlaps`);
    });

    // Never --out /: should the guard regress, the runner would empty it.
    it.each(["--ro", "--rw"])("refuses %s /", (flag) => {
        const w = world();
        const r = run(w, { extra: [flag, "/", "--dry-run"] });
        expect(r.status).toBe(2);
        expect(r.stdout).toBe("");
    });

    it("refuses --out holding the home", () => {
        const w = world();
        const box = join(w.root, "box");
        mkdirSync(join(box, "home"), { recursive: true });
        w.env = { ...w.env, HOME: join(box, "home") };
        const r = run(w, { extra: ["--out", box] });
        expect(r.status).toBe(2);
        expect(existsSync(join(box, "home"))).toBe(true);
    });

    it("refuses --out through a symlink into the case", () => {
        const w = world();
        symlinkSync(join(w.root, "case"), join(w.root, "link"));
        const r = run(w, {
            extra: ["--out", join(w.root, "link", "new", "run")],
        });
        expect(r.status).toBe(2);
        expect(r.stderr).toContain("--out and --case overlap");
        expect(existsSync(join(w.root, "case", "new"))).toBe(false);
    });

    it("refuses --out inside the skill, and deletes nothing", () => {
        const w = world();
        const skill = join(w.root, "skills", SKILL);
        const r = spawnSync(
            NODE,
            [
                script,
                ...["--client", "claude", "--model", "m", "--arm", "with"],
                ...["--case", join(w.root, "case"), "--skill", skill],
                ...["--out", join(skill, "runs")],
            ],
            { encoding: "utf8", env: w.env },
        );
        expect(r.status).toBe(2);
        expect(r.stderr).toContain("--out and --skill overlap");
        expect(existsSync(join(skill, "SKILL.md"))).toBe(true);
    });

    it("refuses writes to the person's skills directories and home", () => {
        const w = world();
        const r = run(w, { mode: "escape", extra: ["--profile", "person"] });
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
        const r = run(w, {
            arm: "without",
            extra: ["--profile", "person", "--probe"],
        });
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
        const r = run(w, { arm: "without", extra: ["--profile", "person"] });
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
            extra: [
                "--profile",
                "person",
                "--hide",
                join(w.claudeHome, "notes"),
                "--probe",
            ],
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
