// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/publishing-skills-to-npm/harness.mts
//
//

// What the skill-packages.mjs tests share: a throwaway repository per
// test, the script run in it by node with npm stood in for, and git run
// there without the variables a hook would aim at this repository.

import { afterEach, beforeEach } from "bun:test";
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const top = join(import.meta.dir, "..", "..");
export const script = join(
    top,
    "skills",
    "publishing-skills-to-npm",
    "scripts",
    "skill-packages.mjs",
);
// The npm stand-in, which bin/npm documents, reads its cues from $STUB.
const bin = join(import.meta.dir, "bin");

export const repository = "git+https://github.com/owner/repo.git";

export let root: string;
export let stub: string;

// Without git's own variables, which a hook running these tests inherits:
// they would aim every git here, and the script's, at the real repository,
// whose index and config they would then change.
const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
) as Record<string, string>;

export const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));

export const put = (path: string, data: unknown) =>
    writeFileSync(join(root, path), `${JSON.stringify(data, null, 4)}\n`);

export const pkgPath = (skill = "mapping-things") =>
    join(root, "skills", skill, "package.json");

export const skill = (name: string, front: string, dir = name) => {
    mkdirSync(join(root, "skills", dir, "references"), { recursive: true });
    writeFileSync(join(root, "skills", dir, "SKILL.md"), `---\n${front}---\n`);
    writeFileSync(join(root, "skills", dir, "references", "a.md"), "a\n");
};

export const good = (name: string) =>
    `name: ${name}\ndescription: >-\n  Does a thing. Use when\n  doing it.\nlicense: MIT\n`;

export const git = (...args: string[]) => {
    const r = Bun.spawnSync(["git", ...args], { cwd: root, env });
    if (r.exitCode !== 0) throw new Error(r.stderr.toString());
};

export const run = (...args: string[]) => {
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

// What `npm view <name> --json` prints for a name.
export const published = (name: string, data: Record<string, unknown>) =>
    writeFileSync(
        join(stub, `${name.replace("/", "__")}.json`),
        JSON.stringify({ name, ...data }),
    );

// Gives each test of the calling file its own repository: a root with a
// GitHub repository and a Bun lockfile, release-please's empty config and
// manifest, the publishing workflow, and one skill. A test file calls it
// once, at its top: Bun loads this module once for every file, so hooks
// registered here at load would reach only the first.
export function sandbox() {
    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), "skill-packages-"));
        stub = join(root, ".stub");
        mkdirSync(join(root, ".config"), { recursive: true });
        mkdirSync(join(root, ".github", "workflows"), { recursive: true });
        mkdirSync(stub);
        put("package.json", { name: "root", private: true, repository });
        writeFileSync(join(root, "bun.lock"), "{}\n");
        writeFileSync(join(root, "LICENSE"), "MIT\n");
        writeFileSync(join(root, ".github", "workflows", "publish.yaml"), "");
        put(".config/release-please.json", {
            "include-component-in-tag": true,
            "include-v-in-tag": false,
            "tag-separator": "@",
            packages: {},
        });
        put(".config/release-please-manifest.json", {});
        skill("mapping-things", good("mapping-things"));
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });
}
