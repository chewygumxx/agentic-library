// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/publishing-skills-to-npm/write.test.mts
//
//

// skill-packages.mjs write: what it derives, what it keeps, and that it
// writes everything or nothing.

import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
    good,
    json,
    pkgPath,
    put,
    repository,
    root,
    run,
    sandbox,
    skill,
} from "./harness.mts";

sandbox();

const config = () => json(join(root, ".config/release-please.json"));
const manifest = () => json(join(root, ".config/release-please-manifest.json"));

describe("write", () => {
    it("derives the package, the release entries and the root's", () => {
        expect(run("write", "--scope", "@s").status).toBe(0);
        expect(json(pkgPath())).toEqual({
            name: "@s/skill-mapping-things",
            version: "0.0.1",
            description: "Does a thing. Use when doing it.",
            keywords: ["agent-skills"],
            homepage:
                "https://github.com/owner/repo/blob/main/skills/mapping-things/SKILL.md",
            repository: {
                type: "git",
                url: repository,
                directory: "skills/mapping-things",
            },
            license: "MIT",
            files: ["SKILL.md", "references"],
            scripts: {
                prepack: "cp ../../LICENSE LICENSE",
                postpack: "rm LICENSE",
            },
            publishConfig: { access: "public", provenance: true },
        });
        const top = json(join(root, "package.json"));
        expect(top.workspaces).toEqual(["skills/*"]);
        expect(top.devDependencies).toEqual({
            "@s/skill-mapping-things": "workspace:*",
        });
        expect(config().packages).toEqual({
            "skills/mapping-things": { component: "skill-mapping-things" },
        });
        expect(manifest()).toEqual({ "skills/mapping-things": "0.0.1" });
    });

    it("changes nothing a second time, and infers the scope", () => {
        run("write", "--scope", "@s");
        const r = run("write");
        expect([r.status, r.out]).toEqual([0, "nothing to write\n"]);
    });

    it("says, dry, what it would write, and writes nothing", () => {
        const r = run("write", "--scope", "@s", "--dry-run");
        expect(r.out).toContain(
            "would write skills/mapping-things/package.json",
        );
        expect(r.out).toContain("dry run: nothing written");
        expect(existsSync(pkgPath())).toBe(false);
    });

    it("writes nothing at all when one skill is wrong", () => {
        skill("claude-tools", good("claude-tools"));
        const r = run("write", "--scope", "@s");
        expect(r.status).toBe(1);
        expect(r.out).toContain("reserves");
        expect(r.out).toContain("nothing written");
        expect(existsSync(pkgPath())).toBe(false);
        expect(json(join(root, "package.json")).workspaces).toBeUndefined();
    });

    it("keeps a version and a private package's privacy", () => {
        run("write", "--scope", "@s");
        writeFileSync(
            pkgPath(),
            JSON.stringify({
                ...json(pkgPath()),
                version: "0.3.1",
                private: true,
            }),
        );
        put(".config/release-please-manifest.json", {});
        expect(run("write").status).toBe(0);
        const pkg = json(pkgPath());
        expect([pkg.version, pkg.private, pkg.publishConfig]).toEqual([
            "0.3.1",
            true,
            undefined,
        ]);
        expect(config().packages).toEqual({});
        expect(run("check").status).toBe(0);
    });

    it("will not roll release-please's manifest back", () => {
        run("write", "--scope", "@s");
        put(".config/release-please-manifest.json", {
            "skills/mapping-things": "0.0.4",
        });
        const r = run("write");
        expect(r.status).toBe(1);
        expect(r.out).toContain("will not overwrite it");
        expect(manifest()).toEqual({ "skills/mapping-things": "0.0.4" });
    });

    it("drops the release entries of a skill whose SKILL.md is gone", () => {
        skill("mapping-gone", good("mapping-gone"));
        run("write", "--scope", "@s");
        rmSync(join(root, "skills", "mapping-gone", "SKILL.md"));
        const r = run("write");
        expect(r.out).toContain("dropped release-please's skills/mapping-gone");
        expect(Object.keys(manifest())).toEqual(["skills/mapping-things"]);
    });

    it("keeps a custom pack hook rather than replace it", () => {
        run("write", "--scope", "@s");
        writeFileSync(
            pkgPath(),
            JSON.stringify({
                ...json(pkgPath()),
                scripts: { prepack: "make docs", postpack: "rm LICENSE" },
            }),
        );
        const r = run("write");
        expect(r.status).toBe(1);
        expect(r.out).toContain("prepack is its own");
    });

    it("copies the licence from as deep as the skills sit", () => {
        mkdirSync(join(root, "lib", "skills"), { recursive: true });
        Bun.spawnSync(["mv", join(root, "skills"), join(root, "lib")]);
        expect(
            run("write", "--scope", "@s", "--skills", "lib/skills").status,
        ).toBe(0);
        const pkg = json(
            join(root, "lib", "skills", "mapping-things", "package.json"),
        );
        expect(pkg.scripts.prepack).toBe("cp ../../../LICENSE LICENSE");
    });

    it("links a workspace by * where npm installs", () => {
        rmSync(join(root, "bun.lock"));
        writeFileSync(join(root, "package-lock.json"), "{}\n");
        run("write", "--scope", "@s");
        expect(json(join(root, "package.json")).devDependencies).toEqual({
            "@s/skill-mapping-things": "*",
        });
        expect(run("check").status).toBe(0);
    });

    it("asks which package manager, where nothing says", () => {
        rmSync(join(root, "bun.lock"));
        expect(run("write", "--scope", "@s").err).toContain(
            "--package-manager",
        );
        expect(
            run("write", "--scope", "@s", "--package-manager", "npm").status,
        ).toBe(0);
    });
});
