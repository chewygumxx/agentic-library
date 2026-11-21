// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/mise-tasks.test.mts
//
//

// What keeps this repository's mise tasks a thin switchboard: each
// standard task extends a cgxx: template from @chewygumxx/mise-tasks-config,
// linked into conf.d, and lint and format leave file selection to hk, whose
// steps come from @chewygumxx/hk-config. No task declares its own --staged,
// and nothing picks files by itself. The skill teaches the same.

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const skill = join(root, "skills", "configuring-mise-tasks");
const mise = join(root, ".config", "mise");

type Task = {
    extends?: string;
    usage?: string;
    sources?: string[];
    run?: string | string[];
};

const parse = (path: string) =>
    Bun.TOML.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

const taskFiles = readdirSync(join(mise, "tasks"))
    .filter((name) => name.endsWith(".task.toml"))
    .map((name) => join(mise, "tasks", name));

const tasks = Object.fromEntries(
    taskFiles.flatMap((path) =>
        Object.entries(parse(path) as Record<string, Task>),
    ),
);

describe("this repository", () => {
    it("links the shared templates into conf.d", () => {
        expect(readlinkSync(join(mise, "conf.d", "50-cgxx.toml"))).toBe(
            "../../../node_modules/@chewygumxx/mise-tasks-config/tasks.toml",
        );
    });

    it("declares no templates of its own", () => {
        expect(parse(join(mise, "config.toml")).task_templates).toBeUndefined();
    });

    it("extends a cgxx: template for each standard task", () => {
        for (const name of [
            "install",
            "lint",
            "format",
            "test",
            "check",
            "lint:commit",
            "commit",
            "act",
        ]) {
            expect([name, tasks[name]?.extends]).toEqual([
                name,
                `cgxx:${name}`,
            ]);
        }
    });

    it("leaves file selection and caching to hk", () => {
        for (const [name, task] of Object.entries(tasks)) {
            expect([name, task.usage ?? ""]).toEqual([
                name,
                expect.not.stringContaining("--staged"),
            ]);
            expect([name, task.sources]).toEqual([name, undefined]);
        }
        const text = taskFiles
            .map((path) => readFileSync(path, "utf8"))
            .join("\n");
        expect(text).not.toContain("with-files.sh");
        expect(text).not.toContain("git rev-parse");
    });

    it("lints and formats with the shared hk steps", () => {
        const hk = readFileSync(join(root, ".config", "hk.pkl"), "utf8");
        expect(hk).toContain(
            'import "../node_modules/@chewygumxx/hk-config/steps.pkl"',
        );
        expect(hk).toContain('check = "mise run check --staged"');
    });
});

it("the skill hands file selection and caching to hk", () => {
    const text = readFileSync(join(skill, "SKILL.md"), "utf8");
    for (const phrase of [
        "`--staged`",
        "`--all`",
        "`cgxx-hk`",
        "`cache_inputs`",
        '"check": "mise run check --all"',
    ]) {
        expect([phrase, text.includes(phrase)]).toEqual([phrase, true]);
    }
    expect(text).not.toContain("with-files.sh");
    expect(text).not.toContain("vars.index");
    expect(text).not.toMatch(/usage_staged:[+-]/);
});

it("the skill names a tool for each kind of work", () => {
    const text = readFileSync(join(skill, "SKILL.md"), "utf8");
    for (const tool of ["hk", "worktrunk", "herdr", "skills-cli", "act"]) {
        expect([tool, text.includes(tool)]).toEqual([tool, true]);
    }
});
