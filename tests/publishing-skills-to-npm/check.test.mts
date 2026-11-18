// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/publishing-skills-to-npm/check.test.mts
//
//

// skill-packages.mjs check: what it finds wrong with a package, its
// release entries and its name, offline, with --pack and with --online.

import { describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
    git,
    good,
    json,
    pkgPath,
    published,
    put,
    root,
    run,
    sandbox,
    skill,
    stub,
} from "./harness.mts";

sandbox();

const edit = (change: Record<string, unknown>) =>
    writeFileSync(pkgPath(), JSON.stringify({ ...json(pkgPath()), ...change }));

describe("check", () => {
    it("passes what write wrote", () => {
        run("write", "--scope", "@s");
        expect(run("check")).toMatchObject({ status: 0 });
    });

    it("finds a skill with no package", () => {
        const r = run("check", "--scope", "@s");
        expect(r.status).toBe(1);
        expect(r.out).toContain("no skills/mapping-things/package.json");
    });

    it("finds a manifest that drifted from its frontmatter", () => {
        run("write", "--scope", "@s");
        edit({ description: "x" });
        mkdirSync(join(root, "skills", "mapping-things", "scripts"));
        const r = run("check");
        expect(r.status).toBe(1);
        expect(r.out).toContain("package.json description");
        expect(r.out).toContain("not the entries beside it");
    });

    it("finds a release manifest out of step, and a path with no skill", () => {
        run("write", "--scope", "@s");
        mkdirSync(join(root, "skills", "gone"));
        put(".config/release-please-manifest.json", {
            "skills/mapping-things": "0.0.9",
            "skills/gone": "0.0.1",
        });
        const r = run("check");
        expect(r.out).toContain("says 0.0.9, package.json 0.0.1");
        expect(r.out).toContain("lists skills/gone, which has no SKILL.md");
    });

    it("finds tags publishing could not read back, overall or per package", () => {
        run("write", "--scope", "@s");
        const config = json(join(root, ".config/release-please.json"));
        put(".config/release-please.json", {
            ...config,
            "include-v-in-tag": true,
            packages: {
                "skills/mapping-things": {
                    component: "skill-mapping-things",
                    "tag-separator": "-",
                },
            },
        });
        const r = run("check");
        expect(r.out).toContain('"include-v-in-tag": false');
        expect(r.out).toContain("sets tag-separator for skills/mapping-things");
    });

    it("refuses what would run or redirect in the OIDC job", () => {
        run("write", "--scope", "@s");
        edit({
            scripts: { ...json(pkgPath()).scripts, prepare: "make" },
            publishConfig: {
                access: "public",
                registry: "https://elsewhere.example",
            },
        });
        const r = run("check");
        expect(r.out).toContain("runs prepare during npm publish");
        expect(r.out).toContain("publishConfig.registry");
    });

    it("refuses a private that is no boolean, and a prerelease", () => {
        run("write", "--scope", "@s");
        edit({ private: "true" });
        expect(run("check").out).toContain('private is "true"');
        edit({ private: undefined, version: "0.1.0-beta.1" });
        expect(run("check").out).toContain("is a prerelease");
        edit({ version: "01.2.3" });
        expect(run("check").out).toContain("is not semver");
    });

    it("takes a tracked licence as the skill's own, ignored or not", () => {
        git("init", "-q");
        writeFileSync(join(root, ".gitignore"), "skills/*/LICENSE\n");
        writeFileSync(
            join(root, "skills", "mapping-things", "LICENSE"),
            "own\n",
        );
        git("add", "-f", "skills/mapping-things/LICENSE");
        run("write", "--scope", "@s");
        expect(json(pkgPath()).scripts).toBeUndefined();
        expect(run("check").status).toBe(0);
    });

    it("finds no licence at all to ship", () => {
        run("write", "--scope", "@s");
        Bun.spawnSync(["rm", join(root, "LICENSE")]);
        expect(run("check").out).toContain("none at the root for prepack");
    });

    it("errs on a name unlike its directory or the specification", () => {
        skill("other", good("mapping-other"));
        skill("Bad-Name", good("Bad-Name"));
        const r = run("check", "--scope", "@s");
        expect(r.out).toContain("is not its directory's, other");
        expect(r.out).toContain("not lowercase letters");
    });

    it("warns, alone, of a name that is no gerund", () => {
        skill("pdf-tools", good("pdf-tools"));
        run("write", "--scope", "@s");
        const r = run("check");
        expect(r.status).toBe(0);
        expect(r.out).toContain("warning: pdf-tools: name pdf-tools");
    });

    it("warns of a root listing a skill no longer here", () => {
        run("write", "--scope", "@s");
        const top = json(join(root, "package.json"));
        put("package.json", {
            ...top,
            devDependencies: {
                ...top.devDependencies,
                "@s/skill-gone": "workspace:*",
            },
        });
        expect(run("check").out).toContain(
            "lists @s/skill-gone, which no skill",
        );
    });

    it("asks for a scope it cannot infer, and refuses flags not its own", () => {
        expect(run("check").err).toContain("pass --scope");
        expect(run("check", "--scope", "@s", "--dry-run").status).toBe(2);
        expect(run("write", "--scope", "@s", "--online").status).toBe(2);
    });

    it("with --pack, finds a tracked file npm would not pack", () => {
        git("init", "-q");
        run("write", "--scope", "@s");
        git("add", "-A");
        writeFileSync(
            join(stub, "pack.json"),
            JSON.stringify([
                { files: [{ path: "SKILL.md" }, { path: "package.json" }] },
            ]),
        );
        const r = run("check", "--pack");
        expect(r.status).toBe(1);
        expect(r.out).toContain(
            "npm would not pack skills/mapping-things/references/a.md",
        );
    });

    it("online, warns rather than errs when npm cannot answer", () => {
        run("write", "--scope", "@s");
        writeFileSync(
            join(stub, "@s__skill-mapping-things.error"),
            "npm error code ENOTFOUND\n",
        );
        const r = run("check", "--online");
        expect(r.status).toBe(0);
        expect(r.out).toContain("could not say whether");
        expect(r.out).toContain("ENOTFOUND");
    });

    it("online, finds a name another repository published", () => {
        run("write", "--scope", "@s");
        published("@s/skill-mapping-things", {
            repository: { url: "git+https://github.com/else/where.git" },
        });
        expect(run("check").status).toBe(0);
        const r = run("check", "--online");
        expect(r.status).toBe(1);
        expect(r.out).toContain("already on npm from");
    });
});
