// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/coordinating-agents/send-prompt-guards.test.mts
//
//

// send-prompt.sh, guarded: the pane, the state and the occupant it is pinned to, and its deadline.

import { describe, expect, it } from "bun:test";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
    calls,
    finish,
    lockFile,
    root,
    run,
    sandbox,
    send,
    setStatus,
    start,
    touch,
    until,
    writes,
} from "./harness.mts";

const processStart = async (pid: number) => {
    const boot = (
        await readFile("/proc/sys/kernel/random/boot_id", "utf8")
    ).trim();
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    return `${boot}:${stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]}`;
};

// The calls that changed a pane: its text and its keys.
const mutations = async () =>
    (await writes()).filter(
        (call) => call[0] === "send-text" || call[0] === "send-keys",
    );

sandbox();

describe("send-prompt.sh, guarded", () => {
    const guarded = ["--from", "a", "--expect-pane", "w1:p2", "--require-idle"];
    const ready = ["--from", "a", "--expect-pane", "w1:p2", "--require-ready"];
    const holdLock = async () => {
        await mkdir(join(root, "run", "coordinating-agents"), {
            recursive: true,
        });
        const holder = Bun.spawn(
            ["flock", lockFile(), "sh", "-c", "read -r _"],
            { stdin: "pipe", stdout: "ignore", stderr: "ignore" },
        );
        await until(async () => {
            const probe = Bun.spawn(["flock", "-n", lockFile(), "true"]);
            return (await probe.exited) !== 0;
        });
        return async () => {
            holder.stdin.write("\n");
            holder.stdin.end();
            await holder.exited;
        };
    };

    it("sends to an idle agent in the expected pane, as a send now", async () => {
        const { code } = await run(send, [...guarded, "bob"], "hi");
        expect(code).toBe(0);
        expect(await writes()).toEqual([
            ["send-text", "w1:p2", "[from a] hi"],
            ["send-keys", "w1:p2", "enter"],
        ]);
    });

    it("accepts idle and done with --require-ready", async () => {
        for (const status of ["idle", "done"]) {
            await setStatus(status);
            const { code } = await run(send, [...ready, "bob"], "hi");
            expect(code).toBe(0);
        }
        expect(await mutations()).toHaveLength(4);
    });

    it("refuses unsafe states with --require-ready, sending nothing", async () => {
        for (const status of ["working", "unknown"]) {
            await setStatus(status);
            const { code, err } = await run(send, [...ready, "bob"], "hi");
            expect(code).toBe(6);
            expect(err).toContain(status);
        }
        await setStatus("blocked");
        expect((await run(send, [...ready, "bob"], "hi")).code).toBe(3);
        expect(await writes()).toEqual([]);
    });

    it("rechecks and accepts done under the lock with --require-ready", async () => {
        const release = await holdLock();
        const waiting = start(send, [...ready, "bob"], "hi");
        await Bun.sleep(300);
        await setStatus("done");
        await release();
        const { code } = await finish(waiting);
        expect(code).toBe(0);
        expect(await mutations()).toHaveLength(2);
    });

    it("refuses an agent in another pane, exit 5, sending nothing", async () => {
        await writeFile(join(root, "pane.bob"), "w1:p9");
        const { code, err } = await run(send, [...guarded, "bob"], "hi");
        expect(code).toBe(5);
        expect(err).toContain("w1:p9");
        expect(await writes()).toEqual([]);
    });

    it("refuses a pane that moved while it waited for the lock", async () => {
        const release = await holdLock();
        const waiting = start(send, [...guarded, "bob"], "hi");
        await Bun.sleep(300);
        expect(await writes()).toEqual([]);
        await writeFile(join(root, "pane.bob"), "w1:p9");
        await release();
        const { code } = await finish(waiting);
        expect(code).toBe(5);
        expect(await writes()).toEqual([]);
    });

    it("refuses a working or unknown agent with --require-idle, exit 6", async () => {
        for (const status of ["working", "unknown", "done"]) {
            await setStatus(status);
            const { code, err } = await run(send, [...guarded, "bob"], "hi");
            expect(code).toBe(6);
            expect(err).toContain(status);
        }
        expect(await writes()).toEqual([]);
    });

    it("still refuses a blocked agent with exit 3", async () => {
        await setStatus("blocked");
        const { code } = await run(send, [...guarded, "bob"], "hi");
        expect(code).toBe(3);
        expect(await writes()).toEqual([]);
    });

    it("rereads the state under the lock, refusing work begun meanwhile", async () => {
        const release = await holdLock();
        const waiting = start(send, [...guarded, "bob"], "hi");
        await Bun.sleep(300);
        await setStatus("working");
        await release();
        const { code } = await finish(waiting);
        expect(code).toBe(6);
        expect(await writes()).toEqual([]);
    });

    it("takes each flag alone", async () => {
        await setStatus("working");
        const pane = ["--from", "a", "--expect-pane", "w1:p2", "bob"];
        expect((await run(send, pane, "hi")).code).toBe(0);
        await setStatus("idle");
        await writeFile(join(root, "pane.bob"), "w1:p9");
        const idle = ["--from", "a", "--require-idle", "bob"];
        expect((await run(send, idle, "hi")).code).toBe(0);
        expect((await writes()).map((call) => call.slice(0, 2))).toEqual([
            ["send-text", "w1:p2"],
            ["send-keys", "w1:p2"],
            ["send-text", "w1:p9"],
            ["send-keys", "w1:p9"],
        ]);
    });

    it("keeps a send now without the flags unguarded, as before", async () => {
        await setStatus("working");
        await writeFile(join(root, "pane.bob"), "w1:p9");
        const { code } = await run(send, ["--from", "a", "bob"], "hi");
        expect(code).toBe(0);
        expect((await writes())[0]).toEqual([
            "send-text",
            "w1:p9",
            "[from a] hi",
        ]);
    });

    it("is immediate only: refused with --at, --in or --deliver", async () => {
        for (const args of [
            ["--from", "a", "--in", "2min", "--require-idle", "bob"],
            [
                "--from",
                "a",
                "--at",
                "2099-01-01",
                "--expect-pane",
                "w1:p2",
                "bob",
            ],
            ["--deliver", "bob-1", "--require-idle"],
            ["--from", "a", "--in", "2min", "--require-ready", "bob"],
            ["--deliver", "bob-1", "--require-ready"],
            ["--expect-pane", "w1:p2", "--deliver", "bob-1"],
        ]) {
            const { code, err } = await run(send, args, "hi");
            expect(code).toBe(2);
            expect(err).toContain("usage");
        }
        expect(await calls()).toEqual([]);
    });

    it("refuses --require-idle and --require-ready together", async () => {
        const { code, err } = await run(
            send,
            ["--from", "a", "--require-idle", "--require-ready", "bob"],
            "hi",
        );
        expect(code).toBe(2);
        expect(err).toContain("usage");
        expect(await calls()).toEqual([]);
    });

    it("rechecks the pinned session under the pane lock", async () => {
        await writeFile(join(root, "session"), "session-a");
        const guardedSession = [
            ...guarded,
            "--expect-session",
            "session-a",
            "bob",
        ];
        expect((await run(send, guardedSession, "hi")).code).toBe(0);
        const release = await holdLock();
        const waiting = start(send, guardedSession, "hi");
        await Bun.sleep(300);
        await writeFile(join(root, "session"), "session-b");
        await release();
        const { code } = await finish(waiting);
        expect(code).toBe(9);
        expect((await mutations()).slice(2)).toEqual([]);
    });

    it("rechecks a process pin under the lock before writing", async () => {
        const sleeper = Bun.spawn(["sleep", "30"]);
        try {
            await writeFile(join(root, "pgid"), String(sleeper.pid));
            const startedAt = await processStart(sleeper.pid);
            const args = [
                ...guarded,
                "--expect-process",
                String(sleeper.pid),
                startedAt,
                "bob",
            ];
            expect((await run(send, args, "hi")).code).toBe(0);
            const other = Bun.spawn(["sleep", "30"]);
            try {
                await writeFile(join(root, "pgid"), String(other.pid));
                expect((await run(send, args, "hi")).code).toBe(9);
                expect((await mutations()).slice(2)).toEqual([]);
            } finally {
                other.kill();
                await other.exited;
            }
        } finally {
            sleeper.kill();
            await sleeper.exited;
        }
    });

    it("refuses a pane id that is not a word", async () => {
        for (const pane of ["-x", "w1 p2", ""]) {
            const args = ["--from", "a", "--expect-pane", pane, "bob"];
            expect((await run(send, args, "hi")).code).toBe(2);
        }
        expect(await calls()).toEqual([]);
    });

    it("refuses an expired deadline before writing text", async () => {
        const { code } = await run(
            send,
            ["--from", "a", "--deadline-at", "1", "bob"],
            "hi",
        );
        expect(code).toBe(10);
        expect(await mutations()).toEqual([]);
    });

    it("never writes Enter after expiry once text may have landed", async () => {
        await touch("expire-on-text");
        const date = join(root, "bin", "date");
        await writeFile(
            date,
            `#!/bin/sh\nif [ "\${1:-}" = "+%s%3N" ]; then\n  if [ -e "$STUB/expired" ]; then echo 2000; else echo 1000; fi\nelse\n  exec /bin/date "$@"\nfi\n`,
        );
        await chmod(date, 0o755);
        const { code } = await run(
            send,
            ["--from", "a", "--deadline-at", "1500", "bob"],
            "hi",
        );
        expect(code).toBe(11);
        expect(await mutations()).toEqual([
            ["send-text", "w1:p2", "[from a] hi"],
        ]);
    });
});
