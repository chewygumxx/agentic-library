// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/publishing-skills-to-npm/next.test.mts
//
//

// skill-packages.mjs next: the commands it suggests for each state of a
// package, as npm, stood in for, reports it.

import { beforeEach, describe, expect, it } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
    json,
    pkgPath,
    published,
    repository,
    root,
    run,
    sandbox,
    stub,
} from "./harness.mts";

sandbox();

const name = "@s/skill-mapping-things";

describe("next", () => {
    beforeEach(() => {
        run("write", "--scope", "@s");
    });

    it("walks an unpublished package through its first publish", () => {
        const r = run("next", "mapping-things");
        expect(r.status).toBe(0);
        expect(r.out).toContain(
            "npm publish --workspace 'skills/mapping-things' --provenance=false",
        );
        expect(r.out).toContain("--repo 'owner/repo'");
        expect(r.out).toContain("--file 'publish.yaml' --allow-publish");
        expect(r.out).toContain("not that the scope's");
    });

    it("sends a hand-published package to validate its publisher", () => {
        published(name, {
            repository: { url: repository },
            versions: ["0.0.1"],
            "dist-tags": { latest: "0.0.1" },
            dist: {},
        });
        const r = run("next", "mapping-things");
        expect(r.out).toContain(`npm trust list '${name}'`);
        expect(r.out).toContain("gh release create 'skill-mapping-things@");
        expect(r.out).toContain("0.0.1, its version here, is already on npm");
    });

    it("leaves a package releasing with provenance to release-please", () => {
        published(name, {
            repository: { url: repository },
            versions: ["0.0.1", "0.0.2"],
            "dist-tags": { latest: "0.0.2" },
            dist: { attestations: { provenance: { predicateType: "x" } } },
        });
        const r = run("next", "mapping-things");
        expect(r.out).toContain("its latest, 0.0.2, has provenance");
        expect(r.out).toContain(`npm view '${name}@<version>'`);
    });

    it("refuses a name another repository holds", () => {
        published(name, {
            repository: { url: "git+https://github.com/else/where.git" },
        });
        const r = run("next", "mapping-things");
        expect(r.status).toBe(1);
        expect(r.out).toContain("choose another name");
    });

    it("says so when npm cannot answer", () => {
        writeFileSync(
            join(stub, "@s__skill-mapping-things.error"),
            "npm error code E401\n",
        );
        const r = run("next", "mapping-things");
        expect(r.status).toBe(1);
        expect(r.out).toContain("could not say what it holds");
        expect(r.out).toContain("E401");
    });

    it("sends a repository without its release path to make one first", () => {
        rmSync(join(root, ".github"), { recursive: true });
        const r = run("next", "mapping-things");
        expect(r.status).toBe(1);
        expect(r.out).toContain("The release path is not here yet");
    });

    it("tells a private skill how to opt in", () => {
        writeFileSync(
            pkgPath(),
            JSON.stringify({
                ...json(pkgPath()),
                private: true,
                publishConfig: undefined,
            }),
        );
        run("write");
        const r = run("next", "mapping-things");
        expect(r.status).toBe(0);
        expect(r.out).toContain("is private, so never published");
    });

    it("takes one skill", () => {
        expect(run("next").status).toBe(2);
    });
});
