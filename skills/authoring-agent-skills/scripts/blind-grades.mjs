#!/usr/bin/env node
// vim:set expandtab shiftwidth=4 filetype=javascript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/skills/authoring-agent-skills/scripts/blind-grades.mjs
//
//

// Usage: blind-grades.mjs <blind|unblind> <runs-dir> <blind-dir> [--json]
//
// Hides which arm of an evaluation each output came from, so a grader
// grades the output and not the arm; then puts the grades back and
// totals them. Works on the runs run-eval.mjs records. Run with --help.
//
// Node alone, no dependencies.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const USAGE = `usage: blind-grades.mjs <blind|unblind> <runs-dir> <blind-dir> [--json]

blind    Copies every ok run under <runs-dir> (each a directory holding
         run-eval.mjs's result.json) to <blind-dir>/<case>/<random id>/:
         skill/ (each skill it wrote, under its own directory name),
         workspace/, changes.txt, git-log.txt (its commits, with diffs)
         and final-message.md, with the run's own path replaced. The
         map from ids to runs goes to <runs-dir>/blind-map.json, which
         graders must not see. Replaces <blind-dir>.
unblind  Reads each <blind-dir>/<case>/<id>/grading.json, writes it to
         its run as grading.json, takes any assertion naming check-skill
         from the run's own record, and prints totals: by arm, by model
         and arm, by case and arm, and each assertion whose rate differs
         between the arms. --json prints them as JSON.

A grader writes, in each output's directory, grading.json:
  { "assertion_results": [ { "text", "passed", "evidence" } ] }

Exit codes: 0 done; 1 a run lacks its grading (unblind); 2 bad usage.`;

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
}
const json = args.includes("--json");
const [command, runsArg, blindArg] = args.filter((a) => a !== "--json");
if (!["blind", "unblind"].includes(command) || !runsArg || !blindArg) {
    process.stderr.write(
        "blind-grades: give blind or unblind, a runs directory and a blind directory; see --help\n",
    );
    process.exit(2);
}
const runsDir = resolve(runsArg);
const blindDir = resolve(blindArg);
const mapFile = join(runsDir, "blind-map.json");
// Inside the runs, a grader could walk up to the map; around them, see
// the arms' directory names.
const nested = (a, b) => a === b || a.startsWith(`${b}/`);
if (nested(blindDir, runsDir) || nested(runsDir, blindDir)) {
    process.stderr.write(
        "blind-grades: keep the blind directory outside the runs directory, and the runs outside it\n",
    );
    process.exit(2);
}

// Every run's directory: one holding result.json.
function runs(dir) {
    const found = [];
    const visit = (d) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
            const p = join(d, e.name);
            if (e.isDirectory()) {
                if (["workspace", ".git"].includes(e.name) || p === blindDir)
                    continue;
                visit(p);
            } else if (e.name === "result.json") {
                found.push(d);
            }
        }
    };
    visit(dir);
    return found.sort();
}

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
// Run inside a git hook, git exports GIT_DIR and GIT_INDEX_FILE, which
// would point a run's own git at the hook's repository instead.
const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
);

if (command === "blind") {
    rmSync(blindDir, { recursive: true, force: true });
    const map = {};
    const counts = {};
    for (const run of runs(runsDir)) {
        const res = read(join(run, "result.json"));
        if (res.status !== "ok") continue;
        const id = randomBytes(5).toString("hex");
        const out = join(blindDir, res.case, id);
        const ws = join(run, "workspace");
        mkdirSync(out, { recursive: true });
        // Each skill keeps its own directory name, as a renamed one fails
        // the name check; its parent path is flattened above it.
        for (const s of res.skills_written ?? []) {
            const parent = dirname(s.dir).replace(/\//g, "__") || "root";
            cpSync(
                join(ws, s.dir),
                join(out, "skill", parent, basename(s.dir)),
                { recursive: true },
            );
        }
        cpSync(ws, join(out, "workspace"), {
            recursive: true,
            filter: (src) =>
                !/\/(\.git|node_modules)(\/|$)/.test(src) &&
                !src.includes(`/skills/${res.skill}`),
        });
        // A path that names the arm, as a final message's links to its
        // own files do, or the skill under test, cited from a with run,
        // would unblind the copy.
        const scrub = (text) =>
            text
                .split(ws)
                .join("<workspace>")
                .split(run)
                .join("<run>")
                .split(res.skill)
                .join("<redacted>");
        writeFileSync(
            join(out, "changes.txt"),
            scrub(readFileSync(join(run, "changes.txt"), "utf8")),
        );
        writeFileSync(
            join(out, "final-message.md"),
            scrub(res.final_message ?? ""),
        );
        const root = spawnSync(
            "git",
            ["-C", ws, "rev-list", "--max-parents=0", "HEAD"],
            { encoding: "utf8", env: cleanEnv },
        ).stdout.trim();
        const log = root
            ? spawnSync(
                  "git",
                  [
                      "-C",
                      ws,
                      "log",
                      "--stat",
                      "-p",
                      "--format=commit %h%n%n    %B",
                      `${root}..HEAD`,
                  ],
                  { encoding: "utf8", env: cleanEnv },
              ).stdout
            : "";
        writeFileSync(
            join(out, "git-log.txt"),
            scrub(log) || "(no commits after the fixture)\n",
        );
        map[id] = relative(runsDir, run);
        counts[res.case] = (counts[res.case] ?? 0) + 1;
    }
    writeFileSync(mapFile, `${JSON.stringify(map, null, 2)}\n`);
    for (const [c, n] of Object.entries(counts).sort())
        process.stdout.write(`${c}: ${n}\n`);
    process.stdout.write(`map: ${mapFile} (keep it from graders)\n`);
    process.exit(0);
}

// ------------------------------------------------------------ unblind

if (!existsSync(mapFile)) {
    process.stderr.write(`blind-grades: no ${mapFile}; blind first\n`);
    process.exit(2);
}
const map = read(mapFile);
const rows = [];
const missing = [];
for (const [id, rel] of Object.entries(map)) {
    const run = join(runsDir, rel);
    const res = read(join(run, "result.json"));
    const gradingFile = join(blindDir, res.case, id, "grading.json");
    if (!existsSync(gradingFile)) {
        missing.push(`${res.case}/${id} (${rel})`);
        continue;
    }
    const grading = read(gradingFile);
    // The checker's verdict comes from the run's own workspace, where the
    // skill's directory name is its own.
    for (const a of grading.assertion_results) {
        if (/check-skill/.test(a.text)) {
            const skills = res.skills_written ?? [];
            a.passed =
                skills.length > 0 && skills.every((s) => s.errors.length === 0);
            a.evidence = `from result.json: ${skills.map((s) => `${s.dir}, ${s.errors.length} errors`).join("; ") || "no skill written"}`;
        }
    }
    const passed = grading.assertion_results.filter((a) => a.passed).length;
    const total = grading.assertion_results.length;
    grading.summary = {
        passed,
        failed: total - passed,
        total,
        pass_rate: total ? passed / total : 0,
    };
    writeFileSync(
        join(run, "grading.json"),
        `${JSON.stringify({ blind_id: id, ...grading }, null, 2)}\n`,
    );
    rows.push({ ...res, arm: res.arm ?? res.config, grading, passed, total });
}

const totals = (key) => {
    const out = {};
    for (const r of rows) {
        const k = key(r);
        out[k] ??= { passed: 0, total: 0, tokens: 0, ms: 0, runs: 0 };
        out[k].passed += r.passed;
        out[k].total += r.total;
        out[k].tokens += r.tokens ?? 0;
        out[k].ms += r.duration_ms ?? 0;
        out[k].runs += 1;
    }
    for (const v of Object.values(out)) {
        v.rate = v.total ? v.passed / v.total : 0;
        v.mean_tokens = Math.round(v.tokens / v.runs);
        v.mean_seconds = Math.round(v.ms / v.runs / 1000);
    }
    return out;
};
const byAssertion = {};
for (const r of rows) {
    r.grading.assertion_results.forEach((a, i) => {
        const k = `${r.case} A${i + 1}`;
        byAssertion[k] ??= { text: a.text, with: [0, 0], without: [0, 0] };
        const side =
            byAssertion[k][
                r.arm === "with" || r.arm === "with_skill" ? "with" : "without"
            ];
        side[0] += a.passed ? 1 : 0;
        side[1] += 1;
    });
}
const differing = Object.fromEntries(
    Object.entries(byAssertion).filter(
        ([, v]) =>
            v.with[1] &&
            v.without[1] &&
            v.with[0] / v.with[1] !== v.without[0] / v.without[1],
    ),
);
const report = {
    by_arm: totals((r) => r.arm),
    by_model_and_arm: totals((r) => `${r.model} ${r.arm}`),
    by_case_and_arm: totals((r) => `${r.case} ${r.arm}`),
    differing_assertions: differing,
    missing_grading: missing,
};
if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
    for (const [title, t] of [
        ["by arm", report.by_arm],
        ["by model and arm", report.by_model_and_arm],
        ["by case and arm", report.by_case_and_arm],
    ]) {
        process.stdout.write(`\n${title}\n`);
        for (const [k, v] of Object.entries(t).sort()) {
            process.stdout.write(
                `  ${k.padEnd(44)} ${v.rate.toFixed(3)} (${v.passed}/${v.total})  ${v.mean_tokens} tokens  ${v.mean_seconds} s  n=${v.runs}\n`,
            );
        }
    }
    process.stdout.write("\nassertions whose rate differs, with / without\n");
    for (const [k, v] of Object.entries(differing).sort()) {
        process.stdout.write(
            `  ${k.padEnd(28)} ${v.with[0]}/${v.with[1]} vs ${v.without[0]}/${v.without[1]}  ${v.text.slice(0, 60)}\n`,
        );
    }
    for (const m of missing)
        process.stderr.write(`blind-grades: no grading for ${m}\n`);
}
process.exit(missing.length ? 1 : 0);
