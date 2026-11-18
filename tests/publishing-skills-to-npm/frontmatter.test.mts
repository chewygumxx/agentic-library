// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/publishing-skills-to-npm/frontmatter.test.mts
//
//

// skill-packages.mjs's frontmatter reader: what it reads must be what a
// YAML parser reads, and what it cannot read exactly it must refuse.

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { script, top } from "./harness.mts";

const { parseFrontmatter } = (await import(script)) as {
    parseFrontmatter: (text: string) => Record<string, unknown>;
};

const yaml = (text: string) =>
    Bun.YAML.parse(text.match(/^---\n(.*?)\n---\n/s)?.[1] ?? "") as Record<
        string,
        unknown
    >;

describe("frontmatter", () => {
    it("reads every skill here as a YAML parser does", () => {
        const skills = join(top, "skills");
        for (const name of readdirSync(skills)) {
            const text = readFileSync(join(skills, name, "SKILL.md"), "utf8");
            const got = parseFrontmatter(text);
            const want = yaml(text);
            for (const key of ["name", "description", "license"]) {
                expect([name, key, got[key]]).toEqual([name, key, want[key]]);
            }
        }
    });

    it.each([
        [
            "a plain scalar wrapped",
            "description: Does a thing\n  over two lines.\n",
        ],
        [
            "a plain scalar in paragraphs",
            "description: One\n  two\n\n  three\n",
        ],
        ["a folded scalar", "description: >-\n  one\n  two\n\n  three\n"],
        ["a literal scalar", "description: |\n  one\n  two\n"],
        ["a kept scalar", "description: |+\n  one\n\nname: x\n"],
        ["quotes", "name: 'it''s'\ndescription: \"a\\tb\"\n"],
    ])("reads %s as YAML does", (_, body) => {
        const text = `---\n${body}---\n`;
        const got = parseFrontmatter(text);
        const want = yaml(text);
        for (const key of Object.keys(want))
            expect(got[key]).toEqual(want[key]);
    });

    it("skips a mapping, and a value it cannot read that nothing uses", () => {
        const got = parseFrontmatter(
            "---\nname: x\nmetadata:\n  a: 1\ntags: [a, b]\n---\n",
        );
        expect(got).toEqual({ name: "x", metadata: null, tags: undefined });
    });

    it.each([
        [
            "an indentation indicator",
            "description: >2-\n  a\n",
            "indentation indicator",
        ],
        [
            "a more-indented folded line",
            "description: >-\n  a\n    b\n",
            "more-indented",
        ],
        [
            "a quoted value continued",
            "description: 'a\n  b'\n",
            "continues onto another line",
        ],
        ["a flow value", "name: [a, b]\n", "does not read"],
        ["a boolean", "name: true\n", "no string"],
        ["a number", "license: 42\n", "no string"],
    ])("refuses %s in a key it uses", (_, body, message) => {
        expect(() => parseFrontmatter(`---\n${body}---\n`)).toThrow(message);
    });

    it("refuses a file with no frontmatter", () => {
        expect(() => parseFrontmatter("no frontmatter")).toThrow(
            "no frontmatter",
        );
    });
});
