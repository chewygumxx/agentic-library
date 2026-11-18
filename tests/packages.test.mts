// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/packages.test.mts
//
//

// What keeps each skill's npm package true to the skill: its manifest
// repeats the frontmatter, which nothing else holds in step, ships every
// file beside it, and is a workspace this repository syncs its own skills
// from.

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Manifest = {
    name?: string;
    description?: string;
    license?: string;
    homepage?: string;
    private?: boolean;
    repository?: { type?: string; url?: string; directory?: string };
    files?: string[];
    scripts?: Record<string, string>;
    publishConfig?: Record<string, unknown>;
    workspaces?: string[];
    devDependencies?: Record<string, string>;
};

const top = join(import.meta.dir, "..");
const root = join(top, "skills");
const skills = readdirSync(root);
const json = (path: string) =>
    JSON.parse(readFileSync(path, "utf8")) as Manifest;
const project = json(join(top, "package.json"));
const manifest = (skill: string) => json(join(root, skill, "package.json"));

const frontmatter = (skill: string) => {
    const text = readFileSync(join(root, skill, "SKILL.md"), "utf8");
    const yaml = text.match(/^---\n(.*?)\n---\n/s)?.[1] ?? "";
    return Bun.YAML.parse(yaml) as { description?: string; license?: string };
};

it("makes each skill a workspace", () => {
    expect(project.workspaces).toContain("skills/*");
});

describe.each(skills)("%s", (skill) => {
    const pkg = manifest(skill);

    it("is named @chewygumxx/skill-<skill>", () => {
        expect(pkg.name).toBe(`@chewygumxx/skill-${skill}`);
    });

    it("repeats its frontmatter's description and licence", () => {
        const front = frontmatter(skill);
        expect(pkg.description).toBe(front.description ?? "");
        expect(pkg.license).toBe(front.license ?? "");
        expect(pkg.license).toBe(project.license ?? "");
    });

    it("points to its own directory of this repository", () => {
        expect(pkg.repository).toEqual({
            type: "git",
            url: "git+https://github.com/chewygumxx/agentic-library.git",
            directory: `skills/${skill}`,
        });
        expect(pkg.homepage).toBe(
            `https://github.com/chewygumxx/agentic-library/blob/main/skills/${skill}/SKILL.md`,
        );
    });

    // npm ships package.json and LICENSE whatever files says.
    it("ships every file beside it", () => {
        const entries = readdirSync(join(root, skill))
            .filter((entry) => !["package.json", "LICENSE"].includes(entry))
            .sort();
        expect([...(pkg.files ?? [])].sort()).toEqual(entries);
    });

    // npm ships a LICENSE from the package's own directory alone.
    it("copies in the licence to pack, and removes it after", () => {
        expect(pkg.scripts).toEqual({
            prepack: "cp ../../LICENSE LICENSE",
            postpack: "rm LICENSE",
        });
    });

    it("publishes publicly with provenance, unless private", () => {
        if (pkg.private) {
            expect(pkg.publishConfig).toBeUndefined();
            return;
        }
        expect(pkg.publishConfig).toEqual({
            access: "public",
            provenance: true,
        });
    });

    it("is synced into this repository from its workspace", () => {
        expect(project.devDependencies?.[pkg.name ?? ""]).toBe("workspace:*");
    });
});
