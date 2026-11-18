// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/mise-tasks.test.mts
//
//

// What keeps a task's skip honest, in this repository's tasks and in the
// skill's template: a staged run watches git's index by an absolute path,
// and a check watches the lockfile and tool pins that govern it. And what
// keeps both staged by default: task templates declare the flag, --all
// turns a run to every file, and no run templates the flag itself.

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const skill = join(root, "skills", "configuring-mise-tasks");

type Task = {
    extends?: string;
    usage?: string;
    sources?: string[];
    depends?: string[];
    run?: string | string[];
};

const parse = (path: string) =>
    Bun.TOML.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

// A set of task files, and the config whose task templates they extend.
const sets: Record<string, { config: string; tasks: string[] }> = {
    "this repository": {
        config: join(root, ".config", "mise", "config.toml"),
        tasks: [join(root, ".config", "mise", "tasks.toml")],
    },
    "the skill's template": {
        config: join(skill, "assets", "config.toml"),
        tasks: readdirSync(join(skill, "assets", "tasks")).map((file) =>
            join(skill, "assets", "tasks", file),
        ),
    },
};

const templatesOf = (config: string) =>
    (parse(config).task_templates ?? {}) as Record<string, Task>;

// Each task as mise merges it with the template it extends: the usage
// specs joined, the template's first, and every other field the task's
// own, else the template's.
const tasksOf = ({ config, tasks }: { config: string; tasks: string[] }) => {
    const templates = templatesOf(config);
    return tasks.flatMap((path) =>
        Object.entries(parse(path) as Record<string, Task>).map(
            ([name, task]): [string, Task, Task] => {
                const base = task.extends ? templates[task.extends] : {};
                if (!base) throw new Error(`${name}: no ${task.extends}`);
                const usage = [base.usage, task.usage].filter(Boolean);
                return [
                    name,
                    {
                        ...base,
                        ...task,
                        usage: usage.length ? usage.join("\n") : undefined,
                    },
                    task,
                ];
            },
        ),
    );
};

const text = ({ config, tasks }: { config: string; tasks: string[] }) =>
    [config, ...tasks].map((path) => readFileSync(path, "utf8")).join("\n");

// git prints the index's path relative to where mise runs the template,
// `.config/mise/`, unless asked for an absolute one.
const absoluteIndex =
    '{% if usage.staged %}{{ exec(command="git rev-parse --path-format=absolute --git-path index") }}{% endif %}';

describe.each(Object.entries(sets))("%s", (_, set) => {
    it("watches git's index by an absolute path in every staged run", () => {
        const runs = [
            ...Object.entries(templatesOf(set.config)),
            ...tasksOf(set),
        ];
        for (const [name, task] of runs) {
            if (!task.usage?.includes("--staged") || !task.sources) continue;
            expect([name, task.sources]).toEqual([
                name,
                expect.arrayContaining([absoluteIndex]),
            ]);
        }
    });

    it("never reads the index through a config-wide variable", () => {
        expect(text(set)).not.toContain("vars.index");
    });

    it("never skips a check that reads the whole project", () => {
        const whole = Object.fromEntries(tasksOf(set));
        for (const name of ["lint:types", "lint:deps", "test"]) {
            if (!whole[name]) continue;
            expect([name, whole[name].sources]).toEqual([name, undefined]);
        }
    });

    it("watches the lockfile and tool pins in every check", () => {
        for (const [name, task] of tasksOf(set)) {
            if (!task.sources) continue;
            const sources = task.sources.join(" ");
            const watched =
                task.sources.includes("**/*") ||
                (/lock/.test(sources) &&
                    sources.includes(".config/mise/config.toml"));
            expect([name, watched]).toEqual([name, true]);
        }
    });
});

describe.each(Object.entries(sets))("%s's staged runs", (_, set) => {
    const templates = Object.entries(templatesOf(set.config)).filter(
        ([, template]) => template.usage?.includes("--staged"),
    );

    it("runs on the staged files by default, and on every file by --all", () => {
        expect(templates.length).toBeGreaterThan(0);
        for (const [name, template] of templates) {
            expect([name, template.usage]).toEqual([
                name,
                expect.stringContaining(
                    'flag "--staged" negate="--all" default=#true',
                ),
            ]);
        }
    });

    it("declares the flag in a template alone, never in a task", () => {
        const staged = tasksOf(set).filter(([, task]) =>
            task.usage?.includes("--staged"),
        );
        expect(staged.length).toBeGreaterThan(0);
        for (const [name, , own] of staged) {
            expect([name, own.usage]).toEqual([name, undefined]);
        }
    });

    // Under default=#true, mise sets $usage_staged to "false" for --all,
    // which ${usage_staged:+...} would read as set. The scripts read it
    // themselves, so no run templates the flag either.
    it("never tests the flag in a run", () => {
        expect(text(set)).not.toMatch(/usage_staged:[+-]/);
        for (const [name, task] of tasksOf(set)) {
            expect([name, [task.run ?? []].flat().join("\n")]).toEqual([
                name,
                expect.not.stringContaining("usage.staged"),
            ]);
        }
    });

    it("passes --all, never --staged, on to what it depends on", () => {
        for (const [name, task] of tasksOf(set)) {
            for (const dep of task.depends ?? []) {
                expect([name, dep]).not.toEqual([
                    name,
                    expect.stringContaining("--staged"),
                ]);
            }
        }
    });
});

it("the skill recommends no config-wide index variable", () => {
    const text = readFileSync(join(skill, "SKILL.md"), "utf8");
    expect(text).not.toContain("vars.index");
    expect(text).toContain("--path-format=absolute --git-path index");
});

it("the skill teaches staged runs by default, and --all", () => {
    const text = readFileSync(join(skill, "SKILL.md"), "utf8");
    expect(text).toContain('flag "--staged" negate="--all" default=#true');
    expect(text).toContain("[task_templates.staged]");
    expect(text).toContain("$usage_staged");
    expect(text).not.toMatch(/usage_staged:[+-]/);
    expect(text).toContain('"check": "mise run check --all"');
});
