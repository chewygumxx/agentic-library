#!/usr/bin/env node
// vim:set expandtab shiftwidth=4 filetype=javascript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/skills/authoring-agent-skills/scripts/run-eval.mjs
//
//

// Usage: run-eval.mjs --client <claude|codex> --model <m> --case <dir>
//          --arm <with|without> --skill <dir> --out <dir> [options]
//
// Runs one evaluation of a skill: one client, one model, one case, with
// the skill or without it, in a jail where the run can neither see the
// other arm, nor the skill's own repository, nor install a skill where
// a later run would find it. Records what happened in <out>/result.json.
// Run with --help for the rest.
//
// Node and bubblewrap (Linux); the clients' own CLIs. Read-only outside
// <out>, unless a client writes its own state, which it must.

import { spawn, spawnSync } from "node:child_process";
import {
    cpSync,
    createWriteStream,
    existsSync,
    lstatSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    readlinkSync,
    realpathSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const SELF_DIR = dirname(new URL(import.meta.url).pathname);

const USAGE = `usage: run-eval.mjs --client <claude|codex> --model <model> --case <dir>
         --arm <with|without> --skill <dir> --out <dir> [options]

Runs one evaluation: the case's prompt, given to one client and model,
in a fresh workspace holding the case's files, with the skill installed
as a project skill (--arm with) or absent (--arm without). Writes
<out>/result.json, transcript.jsonl, stderr.log and changes.txt.

A case directory holds prompt.md, the request as a person would type
it, and files/, copied into the workspace.

options:
  --effort <level>       Reasoning effort; default the client's own.
  --timeout-min <n>      Stop the run after n minutes; default 40.
  --profile <fresh|person>
                         fresh (default): the client's home is empty
                         but for its credentials, read-only; person: their
                         own client homes, settings, hooks, MCP servers
                         and skills, sessions hidden, skills read-only.
  --ro <path>            Also bind a path read-only into the jail;
                         repeatable, for tools the client runs.
  --rw <path>            Also bind a path writable; repeatable.
  --hide <path>          Also hide a path the run must not read, such
                         as a copy of the skill; repeatable.
  --probe                Check the jail and stop, running no model.
  --dry-run              Print the jail's command and stop.
  -h, --help             Show this help.

The jail: of the host, only the system directories (/usr, /etc and
the like) and PATH, read-only; an empty /tmp, runtime directory and
home, with only the client's profile and the tools on PATH bound back,
read-only, by their real paths; and <out>, writable. So the skill's
source, the case and other runs are out of sight wherever they lie, and
so is the session bus. The network is shared: the clients reach their
APIs, and could reach the host's network services. Before running, a
probe must find the client starting and signed in, the skills
directories unwritable, the skill's source, what lies beside <out> and
the runtime directory out of sight, and, in the without arm, the skill
nowhere; a failed probe refuses the run. With the person's profile, a
new SKILL.md in their client homes marks the run leaked.

status in result.json: ok; failed (the client exited non-zero);
limited (a usage limit stopped it: rerun after the reset); contaminated
(a without run whose transcript names the skill); leaked (it installed
a skill where another run could find it). Only ok runs count.

Exit codes: 0 recorded, whatever the status but limited; 75 limited;
2 bad arguments, or --out overlapping --skill or --case; 3 a probe
failed, nothing ran.

Tested with Claude Code 2.x (claude -p --output-format stream-json) and
Codex CLI 0.169 (codex exec --json); other versions may emit other
events, which shows as a run with no tokens or final message.

examples:
  run-eval.mjs --client claude --model claude-haiku-5-5 --effort high \\
      --case cases/fix-a-skill --arm with --skill skills/my-skill \\
      --out runs/haiku/fix-a-skill-0/with
  run-eval.mjs --client codex --model gpt-6.1-terra --case cases/x \\
      --arm without --skill skills/my-skill --out /tmp/r --probe`;

function fail(message, code = 2) {
    process.stderr.write(`run-eval: ${message}\n`);
    process.exit(code);
}

let o;
try {
    ({ values: o } = parseArgs({
        options: {
            client: { type: "string" },
            model: { type: "string" },
            effort: { type: "string" },
            case: { type: "string" },
            arm: { type: "string" },
            skill: { type: "string" },
            out: { type: "string" },
            "timeout-min": { type: "string" },
            profile: { type: "string" },
            ro: { type: "string", multiple: true },
            rw: { type: "string", multiple: true },
            hide: { type: "string", multiple: true },
            probe: { type: "boolean" },
            "dry-run": { type: "boolean" },
            help: { type: "boolean", short: "h" },
        },
    }));
} catch (error) {
    fail(`${error.message}; see --help`);
}
if (o.help) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
}
// Node before 18.11 ignores parseArgs' defaults: apply them here.
o.ro ??= [];
o.rw ??= [];
o.hide ??= [];
o["timeout-min"] ??= "40";
o.profile ??= "fresh";
for (const key of ["client", "model", "case", "arm", "skill", "out"]) {
    if (!o[key]) fail(`--${key} is required; see --help`);
}
if (!["claude", "codex"].includes(o.client)) {
    fail(`--client must be claude or codex, not ${o.client}`);
}
if (!["with", "without"].includes(o.arm)) {
    fail(`--arm must be with or without, not ${o.arm}`);
}
if (!["fresh", "person"].includes(o.profile)) {
    fail(`--profile must be fresh or person, not ${o.profile}`);
}
const caseDir = resolve(o.case);
const skillDir = resolve(o.skill);
const out = resolve(o.out);
if (!existsSync(join(caseDir, "prompt.md"))) {
    fail(`${o.case} holds no prompt.md`);
}
if (!existsSync(join(skillDir, "SKILL.md"))) {
    fail(`${o.skill} holds no SKILL.md`);
}
const name = basename(skillDir);
const bwrap = spawnSync("bwrap", ["--version"], { encoding: "utf8" });
if (bwrap.error) {
    fail(
        "bubblewrap (bwrap) is not installed: install it, or isolate runs another way, as references/evaluating.md says",
    );
}

// ------------------------------------------------------------ the jail

const home = homedir();
const at = (p) => join(home, p);
const claudeHome = process.env.CLAUDE_CONFIG_DIR || at(".claude");
const codexHome = process.env.CODEX_HOME || at(".codex");
const dataHome = process.env.XDG_DATA_HOME || at(".local/share");
const configHome = process.env.XDG_CONFIG_HOME || at(".config");
const real = (p) => {
    try {
        return realpathSync(p);
    } catch {
        return null;
    }
};
const unique = (list) => [...new Set(list.filter(Boolean))];
const within = (p, dir) => p === dir || p.startsWith(`${dir}/`);
const overlaps = (a, b) => within(a, b) || within(b, a);

// A path as it will be once made: its nearest existing ancestor's real
// path, then the rest, so a symlink above a new --out is followed.
const realOrMade = (p) => {
    const rest = [];
    let at = p;
    while (!existsSync(at) && dirname(at) !== at) {
        rest.unshift(basename(at));
        at = dirname(at);
    }
    return join(real(at) ?? at, ...rest);
};
// --out is emptied before the run: it must neither hold nor lie in the
// skill or the case; and no bind may show either to the run.
const outReal = realOrMade(out);
const skillReal = real(skillDir);
const caseReal = real(caseDir);
for (const [flag, dir] of [
    ["--skill", skillReal],
    ["--case", caseReal],
]) {
    if (overlaps(outReal, dir)) {
        fail(`--out and ${flag} overlap: keep ${o.out} apart from ${dir}`);
    }
}
for (const flag of ["ro", "rw"]) {
    for (const p of o[flag]) {
        const r = realOrMade(resolve(p));
        if (overlaps(r, skillReal) || overlaps(r, caseReal)) {
            fail(`--${flag} ${p} overlaps the skill or the case`);
        }
    }
}

// A fresh profile, by default: each client's home is empty but for the
// person's credentials, bound so that a refreshed token reaches their own
// copy, with none of their settings, hooks, MCP servers, memory, sessions
// or skills, any of which may differ between runs or name the skill.
// --profile person keeps their client homes, sessions hidden and skills
// read-only, to evaluate against their own setup.
const fresh = o.profile === "fresh";
const jailClaude = fresh ? at(".run-eval/claude") : claudeHome;
const jailCodex = fresh ? at(".run-eval/codex") : codexHome;
// Only this client's, read-only: nothing a run does reaches the
// person's login. A run that must refresh its token cannot keep the new
// one; for long batches, give the client a long-lived token in the
// environment instead.
const credentials = fresh
    ? [
          o.client === "claude"
              ? [join(claudeHome, ".credentials.json"), jailClaude]
              : [join(codexHome, "auth.json"), jailCodex],
      ].filter(([p]) => existsSync(p))
    : [];

// Where each client finds skills, as their documentation gives it.
// Project skills are the workspace's own; the rest, with the person's
// profile, are theirs, kept read-only so a baseline keeps what they have.
const SKILL_ROOTS = [
    ...(fresh
        ? []
        : [
              join(claudeHome, "skills"),
              at(".claude/skills"),
              join(claudeHome, "plugins"),
              join(codexHome, "skills"),
              join(codexHome, "plugins"),
              at(".agents/skills"),
          ]),
    "/etc/codex/skills",
];
const skillRoots = unique(SKILL_ROOTS.filter(existsSync).map(real));

// What the clients run from, read-only: each PATH entry under the home
// and each client's own binary, by its real path; for one in the home's
// data directory or a dot-directory, the tool's whole directory there,
// and its configuration, as a version manager needs. Never a directory
// holding a client's home, the skill, the case or the output: then only
// the entry itself, or nothing.
const guarded = unique([
    real(claudeHome),
    real(codexHome),
    skillReal,
    caseReal,
    outReal,
]);
const safe = (p) => !guarded.some((g) => within(g, p));
const toolRoot = (p) => {
    if (within(p, dataHome) && p !== dataHome) {
        return join(dataHome, relative(dataHome, p).split("/")[0]);
    }
    const top = relative(home, p).split("/")[0];
    if (top.startsWith(".") && ![".local", ".config"].includes(top)) {
        return join(home, top);
    }
    return p;
};
const pathDirs = (process.env.PATH ?? "").split(":").filter(Boolean);
const clientBinary = pathDirs
    .map((d) => join(d, o.client))
    .find((p) => existsSync(p));
// Symlinks are bound by their targets, as a mount cannot land on one,
// and recreated where they are not already inside a bound directory.
const isLink = (p) => {
    try {
        return lstatSync(p).isSymbolicLink();
    } catch {
        return false;
    }
};
const tools = unique(
    [...pathDirs, real(clientBinary ?? "")]
        .filter((p) => p && within(p, home) && p !== home)
        .flatMap((p) => (isLink(p) ? [real(p)] : [p, real(p)])),
).flatMap((p) => {
    const root = toolRoot(p);
    if (root !== p && safe(root)) {
        const config = within(root, dataHome)
            ? join(configHome, basename(root))
            : null;
        return [root, config];
    }
    return safe(p) ? [p] : [];
});
const links = pathDirs
    .filter((p) => within(p, home) && isLink(p) && real(p))
    .filter((p) => !tools.some((t) => t !== p && within(p, t)))
    .flatMap((p) => ["--symlink", real(p), p]);
const readOnly = unique([
    ...tools,
    ...(fresh ? [] : [at(".config"), at(".npmrc")]),
    ...o.ro.map((p) => resolve(p)),
]).filter((p) => p && existsSync(p));
// What the clients write, with the person's profile: their own state,
// caches.
const writable = unique([
    ...(fresh
        ? []
        : [
              claudeHome,
              at(".claude.json"),
              codexHome,
              at(".cache"),
              at(".local/state"),
          ]),
    ...o.rw.map((p) => resolve(p)),
]).filter(existsSync);
// Past sessions, file backups and prompt history name, and may hold
// copies of, the skill under test: hidden, directories behind an empty
// mount and files behind /dev/null. With a fresh profile, the person's
// client homes, wherever a bind would show them.
const bound = [...readOnly, ...writable];
const hidden = unique([
    ...(fresh
        ? [claudeHome, codexHome, at(".claude.json")].filter((p) =>
              bound.some((b) => within(p, b)),
          )
        : [
              ...[
                  "projects",
                  "file-history",
                  "paste-cache",
                  "plans",
                  "sessions",
                  "shell-snapshots",
                  "tasks",
                  "jobs",
                  "backups",
                  "session-env",
                  "history.jsonl",
              ].map((p) => join(claudeHome, p)),
              ...[
                  "sessions",
                  "archived_sessions",
                  "memories",
                  "shell_snapshots",
                  "history.jsonl",
                  "session_index.jsonl",
              ].map((p) => join(codexHome, p)),
          ]),
    ...o.hide.map((p) => resolve(p)),
]).filter(existsSync);
const hide = (p) =>
    statSync(p).isDirectory() ? ["--tmpfs", p] : ["--bind", "/dev/null", p];

// Of the host, only what the clients run from, read-only: no other
// home, no /tmp, /var, /srv, /mnt or /run, where the skill's source, the
// case or another run's output may lie, and no session bus, through
// which a run could start a process outside the jail.
const SYSTEM = [
    "/usr",
    "/bin",
    "/sbin",
    "/lib",
    "/lib32",
    "/lib64",
    "/libx32",
    "/etc",
    "/opt",
    "/nix",
    "/gnu",
    "/snap",
];
const outsideHome = (p) => !within(p, home);
const system = SYSTEM.filter(existsSync).flatMap((p) =>
    lstatSync(p).isSymbolicLink()
        ? ["--symlink", readlinkSync(p), p]
        : ["--ro-bind", p, p],
);
// Where /etc/resolv.conf leads, as under systemd-resolved, for DNS; and
// PATH entries outside the home, such as a version manager's.
const extra = unique([
    real("/etc/resolv.conf"),
    ...pathDirs.filter((p) => p.startsWith("/") && outsideHome(p)).map(real),
])
    .filter((p) => !SYSTEM.some((s) => within(p, s)) && safe(p))
    .flatMap((p) => ["--ro-bind", p, p]);
const runtimeDir = process.env.XDG_RUNTIME_DIR;
const scratch = unique(["/tmp", "/var/tmp", runtimeDir]);

const ws = join(out, "workspace");
// The skill as installed in the with arm, read-only, so a run cannot
// change what it is measured with.
const frozen =
    o.arm === "with"
        ? [".claude/skills", ".agents/skills"].map((d) => join(ws, d, name))
        : [];
const jail = (cwd) => [
    "--unshare-pid",
    "--new-session",
    "--die-with-parent",
    ...system,
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    ...scratch.flatMap((p) => ["--tmpfs", p]),
    ...extra,
    "--tmpfs",
    home,
    ...readOnly.flatMap((p) => ["--ro-bind", p, p]),
    ...links,
    ...writable.flatMap((p) => ["--bind", p, p]),
    ...hidden.flatMap(hide),
    ...(fresh ? ["--dir", jailClaude, "--dir", jailCodex] : []),
    ...credentials.flatMap(([p, dir]) => [
        "--ro-bind",
        p,
        join(dir, basename(p)),
    ]),
    ...skillRoots.flatMap((p) => ["--ro-bind", p, p]),
    "--bind",
    out,
    out,
    ...frozen.flatMap((p) => ["--ro-bind", p, p]),
    "--remount-ro",
    "/",
    "--chdir",
    cwd,
    "--",
];

// ------------------------------------------------------- the workspace

const prompt = readFileSync(join(caseDir, "prompt.md"), "utf8").trim();
rmSync(out, { recursive: true, force: true });
mkdirSync(ws, { recursive: true });
if (existsSync(join(caseDir, "files"))) {
    cpSync(join(caseDir, "files"), ws, { recursive: true });
}
if (o.arm === "with") {
    for (const dir of [".claude/skills", ".agents/skills"]) {
        cpSync(skillDir, join(ws, dir, name), { recursive: true });
    }
}
// Run inside a git hook, as in a pre-commit check, git exports GIT_DIR,
// GIT_INDEX_FILE and more, pointing at the hook's repository: a scratch
// repository's git would act on it instead, and a commit there would run
// its hooks again, recursively. So git here gets none of them, and no
// hooks.
const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
);
const git = (...args) =>
    spawnSync("git", ["-c", "core.hooksPath=/dev/null", "-C", ws, ...args], {
        encoding: "utf8",
        env: cleanEnv,
    });
git("init", "-q");
git("add", "-A");
git(
    "-c",
    "user.name=eval",
    "-c",
    "user.email=eval@localhost",
    "commit",
    "-qm",
    "fixture",
);

// The client must not report into the caller's terminal multiplexer,
// run its git against the caller's repository, nor look for the
// session bus or SSH agent the jail hides; with a fresh profile, it
// finds its home in the jail.
const env = {
    ...Object.fromEntries(
        Object.entries(cleanEnv).filter(
            ([k]) =>
                !/^(HERDR_|TMUX|ZELLIJ|STY$|DBUS_SESSION_BUS_ADDRESS$|SSH_AUTH_SOCK$)/.test(
                    k,
                ),
        ),
    ),
    CLAUDE_CONFIG_DIR: jailClaude,
    CODEX_HOME: jailCodex,
};

// -------------------------------------------------------------- probe

// Where a client could find a skill: its skills roots, its own state,
// and the workspace. The probe looks there, and with the person's
// profile, the leak check too.
const clientHomes = fresh ? [] : [claudeHome, codexHome].filter(existsSync);
const searched = unique([...skillRoots, jailClaude, jailCodex, ws]);

// Inside the jail: the client starts and is signed in; every skills
// root refuses a write; the skill's source, unless the person installed
// it, what lies beside the run's output, and the host's runtime
// directory are out of sight; and in the without arm, nothing the run
// can read names the skill outside the person's skills, which may hold
// it only if they installed it.
const installed = skillRoots.some((r) => skillReal.startsWith(`${r}/`));
const beside = join(dirname(out), `.run-eval-beside-${process.pid}`);
const signedIn =
    o.client === "claude"
        ? `claude auth status 2>/dev/null | grep -q '"loggedIn": *true'`
        : "codex login status >/dev/null 2>&1";
const probeScript = [
    "status=0",
    `if ! ${o.client} --version >/dev/null 2>&1; then echo "${o.client} does not start in the jail: bind what it needs with --ro"; exit 1; fi`,
    `if ! ${signedIn}; then echo "${o.client} is not signed in inside the jail: sign it in, or give it a key in the environment"; status=1; fi`,
    installed
        ? "true"
        : `if [ -e ${sh(skillReal)} ]; then echo "the run can read the skill's source: ${skillReal}"; status=1; fi`,
    `if [ -e ${sh(caseReal)} ]; then echo "the run can read the case's source: ${caseReal}"; status=1; fi`,
    ...frozen.map(
        (p) =>
            `if touch ${sh(join(p, ".run-eval-probe"))} 2>/dev/null; then echo "the installed skill is writable: ${p}"; status=1; fi`,
    ),
    `if [ -e ${sh(beside)} ]; then echo "the run can see beside its output: ${dirname(out)}"; status=1; fi`,
    runtimeDir
        ? `if [ -n "$(ls -A ${sh(runtimeDir)} 2>/dev/null)" ]; then echo "the run can reach the host's runtime directory: ${runtimeDir}"; status=1; fi`
        : "true",
    ...skillRoots.map(
        (r) =>
            `if touch ${sh(join(r, ".run-eval-probe"))} 2>/dev/null; then rm -f ${sh(join(r, ".run-eval-probe"))}; echo "writable: ${r}"; status=1; fi`,
    ),
    o.arm === "without"
        ? `found=$(grep -rlsIF --exclude-dir=.git ${sh(`name: ${name}`)} ${searched.map(sh).join(" ")} 2>/dev/null | head -5); if [ -n "$found" ]; then echo "baseline can read the skill: $found"; status=1; fi`
        : "true",
    "exit $status",
].join("\n");

function sh(text) {
    return `'${String(text).replace(/'/g, `'\\''`)}'`;
}

if (o["dry-run"]) {
    process.stdout.write(
        `bwrap ${jail(ws)
            .map((a) => (/[\s'"$]/.test(a) ? sh(a) : a))
            .join(" ")} <client command>\n`,
    );
    process.exit(0);
}
writeFileSync(beside, "");
const probe = spawnSync("bwrap", [...jail(ws), "sh", "-c", probeScript], {
    encoding: "utf8",
    env,
});
rmSync(beside, { force: true });
if (probe.status !== 0) {
    process.stderr.write(probe.stdout + probe.stderr);
    fail(
        "the jail's probe failed; nothing ran. Bind what the client needs (--ro); hide what it found the skill in (--hide), or remove the skill from there; make a writable skills directory read-only (--ro).",
        3,
    );
}
if (o.probe) {
    process.stdout.write(
        `probe passed: ${o.client} signed in, ${o.profile} profile; ${skillRoots.length} skills directories read-only; ${o.arm === "without" ? "the skill is out of sight" : "the skill is installed in the workspace"}\n`,
    );
    process.exit(0);
}

// -------------------------------------------------------------- run

const skillFilesBefore = new Set(skillFilesIn(clientHomes));
const effort = o.effort ? ["--effort", o.effort] : [];
const command =
    o.client === "claude"
        ? [
              "claude",
              "-p",
              prompt,
              "--model",
              o.model,
              ...effort,
              "--output-format",
              "stream-json",
              "--verbose",
              "--dangerously-skip-permissions",
          ]
        : [
              "codex",
              "exec",
              "--json",
              "--ephemeral",
              "-m",
              o.model,
              ...(o.effort ? ["-c", `model_reasoning_effort=${o.effort}`] : []),
              "--dangerously-bypass-approvals-and-sandbox",
              "--skip-git-repo-check",
              "-C",
              ws,
              prompt,
          ];
const started = Date.now();
const transcript = createWriteStream(join(out, "transcript.jsonl"));
const errors = createWriteStream(join(out, "stderr.log"));
const child = spawn("bwrap", [...jail(ws), ...command], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.pipe(transcript);
child.stderr.pipe(errors);
const timer = setTimeout(
    () => child.kill("SIGTERM"),
    Number(o["timeout-min"]) * 60_000,
);
const code = await new Promise((done) =>
    child.on("close", (c, signal) => done(c ?? (signal ? 124 : 1))),
);
clearTimeout(timer);
await Promise.all(
    [transcript, errors].map((s) => new Promise((r) => s.end(r))),
);
const duration_ms = Date.now() - started;

// ----------------------------------------------------------- record

const raw = readFileSync(join(out, "transcript.jsonl"), "utf8");
const events = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
        try {
            return JSON.parse(line);
        } catch {
            return null;
        }
    })
    .filter(Boolean);
const stderr = readFileSync(join(out, "stderr.log"), "utf8");

let tokens = 0;
let final = null;
let cost = null;
let limited = false;
let loaded = false;
if (o.client === "claude") {
    const result = events.findLast((e) => e.type === "result");
    if (result) {
        const u = result.usage ?? {};
        tokens =
            (u.input_tokens ?? 0) +
            (u.output_tokens ?? 0) +
            (u.cache_creation_input_tokens ?? 0) +
            (u.cache_read_input_tokens ?? 0);
        cost = result.total_cost_usd ?? null;
        final = result.result ?? null;
        // A usage limit is an error result whose text is the notice.
        limited =
            Boolean(result.is_error) &&
            (result.api_error === "usage_limit_reached" ||
                result.api_error_status === 429);
    }
    // Loaded: the Skill tool named it, or a tool call read a file in it.
    loaded = events.some((e) =>
        (e.message?.content ?? []).some(
            (b) =>
                b.type === "tool_use" &&
                ((b.name === "Skill" && b.input?.skill === name) ||
                    JSON.stringify(b.input ?? {}).includes(`skills/${name}/`)),
        ),
    );
} else {
    for (const e of events) {
        if (e.type === "turn.completed" && e.usage) {
            tokens +=
                (e.usage.input_tokens ?? 0) + (e.usage.output_tokens ?? 0);
        }
    }
    final =
        events.findLast((e) => e.item?.type === "agent_message")?.item?.text ??
        null;
    limited =
        !final &&
        /usage limit|rate limit|hit your limit|limit reached|quota/i.test(
            `${raw}\n${stderr}`,
        );
    // Loaded: a command it ran read a file in the skill.
    loaded = events.some((e) =>
        String(e.item?.command ?? "").includes(`skills/${name}/`),
    );
}

const contaminated = o.arm === "without" && `${raw}\n${stderr}`.includes(name);
const leakedFiles = skillFilesIn(clientHomes).filter(
    (f) => !skillFilesBefore.has(f),
);

// Each skill the run wrote or left in its workspace, and the checker's
// verdict on it.
const checker = join(SELF_DIR, "check-skill.mjs");
const written = [];
const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if ([".git", "node_modules"].includes(entry.name)) continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (relative(ws, path).endsWith(`skills/${name}`)) continue;
            walk(path);
        } else if (entry.name === "SKILL.md") {
            written.push(dir);
        }
    }
};
walk(ws);
const skills = written.map((dir) => {
    const run = spawnSync(
        process.execPath,
        [checker, "--target", "portable", "--json", dir],
        { encoding: "utf8" },
    );
    let findings = [];
    try {
        findings = JSON.parse(run.stdout);
    } catch {}
    return {
        dir: relative(ws, dir),
        errors: findings.filter((f) => f.level === "error").map((f) => f.code),
        warnings: findings
            .filter((f) => f.level === "warning")
            .map((f) => f.code),
    };
});
writeFileSync(
    join(out, "changes.txt"),
    git("status", "--short").stdout + git("diff", "--stat", "HEAD").stdout,
);

const status = limited
    ? "limited"
    : leakedFiles.length
      ? "leaked"
      : contaminated
        ? "contaminated"
        : code === 0
          ? "ok"
          : "failed";
const record = {
    client: o.client,
    model: o.model,
    effort: o.effort ?? null,
    case: basename(caseDir),
    arm: o.arm,
    skill: name,
    status,
    exit_code: code,
    duration_ms,
    tokens,
    cost_usd: cost,
    loaded_skill: loaded,
    leaked: leakedFiles,
    skills_written: skills,
    final_message: final,
};
writeFileSync(join(out, "result.json"), `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(
    `${o.client} ${o.model} ${record.case} ${o.arm}: ${status}, ${Math.round(duration_ms / 1000)} s, ${tokens} tokens\n`,
);
process.exit(limited ? 75 : 0);

// Every SKILL.md under the given directories, so a run that installs a
// skill where another would find it shows.
function skillFilesIn(dirs) {
    const found = [];
    const visit = (dir, depth) => {
        if (depth > 6) return;
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (
                ["node_modules", ".git", "projects", "sessions"].includes(
                    entry.name,
                )
            )
                continue;
            const path = join(dir, entry.name);
            if (entry.isDirectory()) visit(path, depth + 1);
            else if (entry.name === "SKILL.md") found.push(path);
        }
    };
    for (const dir of dirs) {
        if (dir === out || !statSync(dir).isDirectory()) continue;
        visit(dir, 0);
    }
    return found;
}
