// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/authoring-agent-skills/run-eval-world.mts
//
//

// What run-eval.mjs's tests share: a made-up home, client homes, case
// and skill under one root, and a run of the script over them with the
// stand-in clients in bin/. Needs bubblewrap; hasBwrap says if it is here.

import { spawnSync } from "node:child_process";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const script = join(
    import.meta.dir,
    "..",
    "..",
    "skills",
    "authoring-agent-skills",
    "scripts",
    "run-eval.mjs",
);
const stubs = join(import.meta.dir, "bin");
export const hasBwrap = !spawnSync("bwrap", ["--version"]).error;
// Node by its full path, found on the tests' own PATH, so a test that
// narrows the PATH a run sees still starts the script.
export const NODE = Bun.which("node") ?? "node";
export const SKILL = "processing-things";

// A fresh home, client homes, a case and a skill, all under one root.
export function world() {
    const root = mkdtempSync(join(tmpdir(), "run-eval-"));
    const home = join(root, "home");
    const claudeHome = join(home, ".claude");
    const codexHome = join(home, ".codex");
    for (const dir of [
        join(claudeHome, "skills"),
        join(codexHome, "skills"),
        join(root, "case", "files"),
        join(root, "skills", SKILL),
    ]) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(join(root, "case", "prompt.md"), "make a skill\n");
    writeFileSync(join(claudeHome, ".credentials.json"), "{}\n");
    writeFileSync(join(codexHome, "auth.json"), "{}\n");
    writeFileSync(join(root, "case", "files", "notes.md"), "notes\n");
    writeFileSync(
        join(root, "skills", SKILL, "SKILL.md"),
        `---\nname: ${SKILL}\ndescription: Processes things. Use when needed.\n---\n`,
    );
    const env: Record<string, string | undefined> = {
        ...process.env,
        HOME: home,
        CLAUDE_CONFIG_DIR: claudeHome,
        CODEX_HOME: codexHome,
        PATH: `${stubs}:${process.env.PATH}`,
        STUB_SKILL: SKILL,
    };
    return { root, home, claudeHome, codexHome, env };
}

export function run(
    w: ReturnType<typeof world>,
    options: { client?: string; arm?: string; mode?: string; extra?: string[] },
) {
    const out = join(
        w.root,
        "out",
        `${options.client ?? "claude"}-${options.arm ?? "with"}-${options.mode ?? "use"}`,
    );
    const result = spawnSync(
        NODE,
        [
            script,
            "--client",
            options.client ?? "claude",
            "--model",
            "m",
            "--case",
            join(w.root, "case"),
            "--arm",
            options.arm ?? "with",
            "--skill",
            join(w.root, "skills", SKILL),
            "--out",
            out,
            ...(options.extra ?? []),
        ],
        {
            encoding: "utf8",
            env: { ...w.env, STUB_MODE: options.mode ?? "use" },
        },
    );
    const file = join(out, "result.json");
    const record = existsSync(file)
        ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>)
        : null;
    return { ...result, out, record };
}
