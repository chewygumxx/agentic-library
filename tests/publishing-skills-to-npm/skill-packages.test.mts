// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/publishing-skills-to-npm/skill-packages.test.mts
//
//

// skill-packages.mjs, run by node in a throwaway repository with npm
// stood in for: what check finds, what write derives, and what next
// suggests for each state of a package.

import { beforeEach, describe, expect, it } from "bun:test";
import {
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const top = join(import.meta.dir, "..", "..");
const script = join(
    top,
    "skills",
    "publishing-skills-to-npm",
    "scripts",
    "skill-packages.mjs",
);
const bin = join(import.meta.dir, "bin");
const { parseFrontmatter } = (await import(script)) as {
    parseFrontmatter: (text: string) => Record<string, unknown>;
};

let root: string;
let stub: string;

const repository = "git+https://github.com/owner/repo.git";
const config = {
    "include-component-in-tag": true,
    "include-v-in-tag": false,
    "tag-separator": "@",
    packages: {},
};

const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const put = (path: string, data: unknown) =>
    writeFileSync(join(root, path), `${JSON.stringify(data, null, 4)}\n`);

const skill = (name: string, front: string, dir = name) => {
    mkdirSync(join(root, "skills", dir, "references"), { recursive: true });
    writeFileSync(join(root, "skills", dir, "SKILL.md"), `---\n${front}---\n`);
    writeFileSync(join(root, "skills", dir, "references", "a.md"), "a\n");
};

const good = (name: string) =>
    `name: ${name}\ndescription: >-\n  Does a thing. Use when\n  doing it.\nlicense: MIT\n`;

// Without git's own variables, which a hook running these tests inherits:
// they would point every git here, and the script's, at the real
// repository, whose index and config they would then change.
const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

const git = (...args: string[]) => {
    const r = Bun.spawnSync(["git", ...args], { cwd: root, env });
    if (r.exitCode !== 0) throw new Error(r.stderr.toString());
};

const run = (...args: string[]) => {
    const r = Bun.spawnSync(["node", script, ...args], {
        cwd: root,
        env: { ...env, PATH: `${bin}:${env.PATH}`, STUB: stub },
    });
    return {
        status: r.exitCode,
        out: r.stdout.toString(),
        err: r.stderr.toString(),
    };
};

const published = (name: string, data: Record<string, unknown>) =>
    writeFileSync(
        join(stub, `${name.replace("/", "__")}.json`),
        JSON.stringify({ name, ...data }),
    );

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "skill-packages-"));
    stub = join(root, ".stub");
    mkdirSync(join(root, ".config"), { recursive: true });
    mkdirSync(stub);
    put("package.json", { name: "root", private: true, repository });
    put(".config/release-please.json", config);
    put(".config/release-please-manifest.json", {});
    skill("mapping-things", good("mapping-things"));
});

describe("frontmatter", () => {
    it("reads every skill here as a YAML parser does", () => {
        const skills = join(top, "skills");
        for (const name of readdirSync(skills)) {
            const text = readFileSync(join(skills, name, "SKILL.md"), "utf8");
            const yaml = text.match(/^---\n(.*?)\n---\n/s)?.[1] ?? "";
            const want = Bun.YAML.parse(yaml) as Record<string, unknown>;
            const got = parseFrontmatter(text);
            for (const key of ["name", "description", "license"]) {
                expect([name, key, got[key]]).toEqual([name, key, want[key]]);
            }
        }
    });

    it("reads quoted, literal and kept scalars, and skips a mapping", () => {
        const got = parseFrontmatter(
            "---\nname: 'it''s'\ndescription: \"a\\tb\"\nmetadata:\n  x: 1\nbody: |\n  one\n  two\n---\n",
        );
        expect(got).toEqual({
            name: "it's",
            description: "a\tb",
            metadata: null,
            body: "one\ntwo\n",
        });
    });

    it("refuses YAML it does not read rather than guess", () => {
        expect(() => parseFrontmatter("---\nname: [a, b]\n---\n")).toThrow(
            "does not read",
        );
        expect(() => parseFrontmatter("no frontmatter")).toThrow(
            "no frontmatter",
        );
    });
});

describe("write", () => {
    it("derives the package, the release entries and the root's", () => {
        const r = run("write", "--scope", "@s");
        expect(r.status).toBe(0);
        expect(
            json(join(root, "skills", "mapping-things", "package.json")),
        ).toEqual({
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
        expect(
            json(join(root, ".config/release-please.json")).packages,
        ).toEqual({
            "skills/mapping-things": { component: "skill-mapping-things" },
        });
        expect(
            json(join(root, ".config/release-please-manifest.json")),
        ).toEqual({ "skills/mapping-things": "0.0.1" });
    });

    it("changes nothing a second time, and infers the scope", () => {
        run("write", "--scope", "@s");
        const r = run("write");
        expect([r.status, r.out]).toEqual([0, "nothing to write\n"]);
    });

    it("keeps a version and a private package's privacy", () => {
        run("write", "--scope", "@s");
        const path = join(root, "skills", "mapping-things", "package.json");
        writeFileSync(
            path,
            JSON.stringify({ ...json(path), version: "0.3.1", private: true }),
        );
        expect(run("write").status).toBe(0);
        const pkg = json(path);
        expect([pkg.version, pkg.private, pkg.publishConfig]).toEqual([
            "0.3.1",
            true,
            undefined,
        ]);
        expect(
            json(join(root, ".config/release-please.json")).packages,
        ).toEqual({});
        expect(run("check").status).toBe(0);
    });

    it("says, dry, what it would write, and writes nothing", () => {
        const r = run("write", "--scope", "@s", "--dry-run");
        expect(r.out).toContain(
            "would write skills/mapping-things/package.json",
        );
        expect(r.out).toContain("dry run: nothing written");
        expect(
            readdirSync(join(root, "skills", "mapping-things")),
        ).not.toContain("package.json");
    });

    it("links a workspace by * where npm installs", () => {
        writeFileSync(join(root, "package-lock.json"), "{}\n");
        run("write", "--scope", "@s");
        expect(json(join(root, "package.json")).devDependencies).toEqual({
            "@s/skill-mapping-things": "*",
        });
        expect(run("check").status).toBe(0);
    });

    it("keeps a skill's own licence from the copy", () => {
        git("init", "-q");
        writeFileSync(
            join(root, "skills", "mapping-things", "LICENSE"),
            "Its own\n",
        );
        run("write", "--scope", "@s");
        const pkg = json(
            join(root, "skills", "mapping-things", "package.json"),
        );
        expect(pkg.scripts).toBeUndefined();
        expect(run("check").status).toBe(0);
        writeFileSync(
            join(root, "skills", "mapping-things", "package.json"),
            JSON.stringify({
                ...pkg,
                scripts: { prepack: "cp ../../LICENSE LICENSE" },
            }),
        );
        expect(run("check").out).toContain("own LICENSE would be overwritten");
    });

    it("writes nothing for a skill whose name is wrong", () => {
        skill("claude-tools", good("claude-tools"));
        const r = run("write", "--scope", "@s", "claude-tools");
        expect(r.status).toBe(1);
        expect(r.out).toContain("reserves");
        expect(readdirSync(join(root, "skills", "claude-tools"))).not.toContain(
            "package.json",
        );
    });
});

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
        const path = join(root, "skills", "mapping-things", "package.json");
        writeFileSync(
            path,
            JSON.stringify({ ...json(path), description: "x" }),
        );
        mkdirSync(join(root, "skills", "mapping-things", "scripts"));
        const r = run("check");
        expect(r.status).toBe(1);
        expect(r.out).toContain("package.json description");
        expect(r.out).toContain("not the entries beside it");
    });

    it("finds a release manifest out of step", () => {
        run("write", "--scope", "@s");
        put(".config/release-please-manifest.json", {
            "skills/mapping-things": "0.0.9",
            "skills/gone": "0.0.1",
        });
        const r = run("check");
        expect(r.out).toContain("says 0.0.9, package.json 0.0.1");
        expect(r.out).toContain("lists skills/gone, which is no skill");
    });

    it("finds tags publishing could not read back", () => {
        run("write", "--scope", "@s");
        put(".config/release-please.json", {
            ...json(join(root, ".config/release-please.json")),
            "include-v-in-tag": true,
        });
        expect(run("check").out).toContain('"include-v-in-tag": false');
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

    it("warns of a description that says only when", () => {
        skill(
            "mapping-when",
            "name: mapping-when\ndescription: Use when mapping.\n",
        );
        run("write", "--scope", "@s");
        expect(run("check").out).toContain("not first what it does");
    });

    it("asks for a scope it cannot infer", () => {
        const r = run("check");
        expect(r.status).toBe(2);
        expect(r.err).toContain("pass --scope");
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

describe("next", () => {
    beforeEach(() => {
        run("write", "--scope", "@s");
    });

    it("walks an unpublished package through its first publish", () => {
        const r = run("next", "mapping-things");
        expect(r.status).toBe(0);
        expect(r.out).toContain(
            "npm publish --workspace skills/mapping-things --provenance=false",
        );
        expect(r.out).toContain("--repo owner/repo");
        expect(r.out).toContain("--file publish.yaml --allow-publish");
    });

    it("sends a hand-published package to validate its publisher", () => {
        published("@s/skill-mapping-things", {
            repository: { url: repository },
            "dist-tags": { latest: "0.0.1" },
            dist: {},
        });
        const r = run("next", "mapping-things");
        expect(r.out).toContain("npm trust list @s/skill-mapping-things");
        expect(r.out).toContain("gh release create 'skill-mapping-things@");
    });

    it("leaves a package releasing with provenance to release-please", () => {
        published("@s/skill-mapping-things", {
            repository: { url: repository },
            "dist-tags": { latest: "0.0.2" },
            dist: { attestations: { provenance: { predicateType: "x" } } },
        });
        expect(run("next", "mapping-things").out).toContain(
            "releases through CI: latest 0.0.2, with provenance",
        );
    });

    it("refuses a name another repository holds", () => {
        published("@s/skill-mapping-things", {
            repository: { url: "git+https://github.com/else/where.git" },
        });
        const r = run("next", "mapping-things");
        expect(r.status).toBe(1);
        expect(r.out).toContain("choose another name");
    });

    it("takes one skill", () => {
        expect(run("next").status).toBe(2);
    });
});
