// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/configuring-mise-tasks.test.mts
//
//

// The configuring-mise-tasks skill's bundled examples: the standard task set,
// one file per task family, each task extending its cgxx: template; the
// config that installs the packages before the hooks; and the hk.pkl that
// takes its steps from @chewygumxx/hk-config.

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const skill = join(root, "skills", "configuring-mise-tasks");

type Task = {
    description?: string;
    alias?: string | string[];
    usage?: string;
    extends?: string;
    depends?: string[];
};

const templates = join(skill, "assets", "tasks");

const parse = (file: string) =>
    Bun.TOML.parse(readFileSync(join(templates, file), "utf8")) as Record<
        string,
        Task
    >;

// Every template file's tasks, as mise merges them through the include.
const template = () =>
    Object.assign(
        {},
        ...readdirSync(templates)
            .sort()
            .map((file) => parse(file)),
    ) as Record<string, Task>;

// The tasks each family's file may hold.
const families: Record<string, (name: string) => boolean> = {
    "standard.task.toml": (name) => ["install", "test", "check"].includes(name),
    "lint.task.toml": (name) => name === "lint" || name.startsWith("lint:"),
    "format.task.toml": (name) =>
        name === "format" || name.startsWith("format:"),
};

describe("configuring-mise-tasks", () => {
    it("its template is one file per family", () => {
        expect(readdirSync(templates).sort()).toEqual(
            Object.keys(families).sort(),
        );
        for (const [file, holds] of Object.entries(families)) {
            for (const name of Object.keys(parse(file))) {
                expect([file, name, holds(name)]).toEqual([file, name, true]);
            }
        }
    });

    it("its template files each name their own path", () => {
        for (const file of readdirSync(templates)) {
            const path = `skills/configuring-mise-tasks/assets/tasks/${file}`;
            const text = readFileSync(join(templates, file), "utf8");
            expect(text).toContain(`# ::: :/${path}\n`);
            expect(text).toContain(`.config/mise/tasks/${file}`);
        }
    });

    it("its template extends the cgxx: template of each standard task", () => {
        const tasks = template();
        for (const name of ["install", "lint", "format", "test", "check"]) {
            expect([name, tasks[name]?.extends]).toEqual([
                name,
                `cgxx:${name}`,
            ]);
        }
        // The templates carry the aliases and the flags.
        for (const [name, task] of Object.entries(tasks)) {
            expect([name, task.alias, task.usage]).toEqual([
                name,
                undefined,
                undefined,
            ]);
        }
    });

    it("its config installs the packages before the hooks, outside CI", () => {
        const config = Bun.TOML.parse(
            readFileSync(join(skill, "assets", "config.toml"), "utf8"),
        ) as {
            hooks?: { postinstall?: string };
            task_config?: { includes?: string[] };
        };
        expect(config.hooks?.postinstall).toBe(
            'test -n "${CI-}" || { bun ci && hk install --mise; }',
        );
        expect(config.task_config?.includes).toEqual([
            ".config/mise/tasks/*.task.toml",
        ]);
    });

    it("its hk.pkl takes the shared steps from node_modules", () => {
        const pkl = readFileSync(join(skill, "assets", "hk.pkl"), "utf8");
        for (const line of [
            'import "../node_modules/@chewygumxx/hk-config/steps.pkl" as shared',
            "steps = cgxx.lint",
            "steps = cgxx.format",
            "stage = false",
            'check = "mise run check --staged"',
        ]) {
            expect([line, pkl.includes(line)]).toEqual([line, true]);
        }
    });

    it("its template holds no act", () => {
        const names = Object.keys(template());
        expect(names.filter((name) => name.startsWith("act"))).toEqual([]);
    });
});
