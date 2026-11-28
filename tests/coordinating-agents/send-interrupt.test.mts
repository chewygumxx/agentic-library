// vim:set expandtab shiftwidth=4 filetype=typescript:
// SPDX-License-Identifier: GPL-3.0-only

//
//
// ~chewygumxx/agentic-library.git
// ::: :/tests/coordinating-agents/send-interrupt.test.mts
//
//

// send-interrupt.sh: one Escape or ctrl+c, under the pane's lock and its guards.

import { describe, expect, it } from "bun:test";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
    calls,
    finish,
    interrupt,
    lockFile,
    root,
    run,
    sandbox,
    setStatus,
    start,
    touch,
    until,
    writes,
} from "./harness.mts";

// The calls that changed a pane: its text and its keys.
const mutations = async () =>
    (await writes()).filter(
        (call) => call[0] === "send-text" || call[0] === "send-keys",
    );

sandbox();

describe("send-interrupt.sh", () => {
    const guarded = ["--expect-pane", "w1:p2", "--expect-terminal", "term_1"];
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

    it("sends one Escape to the expected pane and terminal", async () => {
        await setStatus("working");
        const { code } = await run(interrupt, [...guarded, "bob"]);
        expect(code).toBe(0);
        expect(await writes()).toEqual([["send-keys", "w1:p2", "esc"]]);
    });

    it("waits for the pane's lock before the Escape", async () => {
        await setStatus("working");
        const release = await holdLock();
        const waiting = start(interrupt, [...guarded, "bob"]);
        await Bun.sleep(300);
        expect(await writes()).toEqual([]);
        await release();
        const { code } = await finish(waiting);
        expect(code).toBe(0);
        expect(await writes()).toEqual([["send-keys", "w1:p2", "esc"]]);
    });

    it("gives up on a held lock after --lock-wait, exit 7, unsent", async () => {
        const release = await holdLock();
        const began = Date.now();
        const { code, err } = await run(interrupt, [
            ...guarded,
            "--lock-wait",
            "1",
            "bob",
        ]);
        await release();
        expect(code).toBe(7);
        expect(err).toContain("locked");
        expect(Date.now() - began).toBeGreaterThanOrEqual(900);
        expect(await writes()).toEqual([]);
    });

    it("rereads the occupant under the lock: a new terminal is exit 8", async () => {
        const release = await holdLock();
        const waiting = start(interrupt, [...guarded, "bob"]);
        await Bun.sleep(300);
        await writeFile(join(root, "terminal"), "term_2");
        await release();
        const { code } = await finish(waiting);
        expect(code).toBe(8);
        expect(await writes()).toEqual([]);
    });

    it("refuses an expired deadline before the interrupt key", async () => {
        const { code } = await run(interrupt, [
            ...guarded,
            "--deadline-at",
            "1",
            "bob",
        ]);
        expect(code).toBe(10);
        expect(await mutations()).toEqual([]);
    });

    it("caps the pane-lock wait by the absolute deadline", async () => {
        const release = await holdLock();
        const date = join(root, "bin", "date");
        await writeFile(
            date,
            `#!/bin/sh\nif [ "\${1:-}" = "+%s%3N" ]; then echo 1000; else exec /bin/date "$@"; fi\n`,
        );
        await chmod(date, 0o755);
        const flock = join(root, "bin", "flock");
        await writeFile(
            flock,
            `#!/bin/sh\nlog-call flock "$@"\nexec ${Bun.which("flock")} "$@"\n`,
        );
        await chmod(flock, 0o755);
        const { code } = await run(interrupt, [
            ...guarded,
            "--lock-wait",
            "60",
            "--deadline-at",
            "1500",
            "bob",
        ]);
        await release();
        expect(code).toBe(7);
        expect(await mutations()).toEqual([]);
        expect((await calls()).find((call) => call[0] === "flock")).toEqual([
            "flock",
            "-w",
            "1",
            "9",
        ]);
    });

    it("guards a deliberate ctrl+c by session, not terminal alone", async () => {
        await setStatus("working");
        await writeFile(join(root, "session"), "session-a");
        const args = [
            ...guarded,
            "--expect-session",
            "session-a",
            "--key",
            "ctrl+c",
            "bob",
        ];
        expect((await run(interrupt, args)).code).toBe(0);
        expect(await writes()).toEqual([["send-keys", "w1:p2", "ctrl+c"]]);
        await writeFile(join(root, "session"), "session-b");
        expect((await run(interrupt, args)).code).toBe(9);
        expect(await writes()).toHaveLength(1);
    });

    it("refuses another pane (5), an absent agent (4) or a dialog (3)", async () => {
        await writeFile(join(root, "pane.bob"), "w1:p9");
        expect((await run(interrupt, [...guarded, "bob"])).code).toBe(5);
        await rm(join(root, "pane.bob"));
        await setStatus("blocked");
        expect((await run(interrupt, [...guarded, "bob"])).code).toBe(3);
        await touch("absent");
        expect((await run(interrupt, [...guarded, "bob"])).code).toBe(4);
        expect(await writes()).toEqual([]);
    });

    it("reports a failed Escape as exit 1, which may have landed", async () => {
        await touch("fail-keys");
        const { code } = await run(interrupt, [...guarded, "bob"]);
        expect(code).toBe(1);
    });

    it("says its usage on bad arguments, touching nothing", async () => {
        for (const args of [
            [],
            ["bob", "extra"],
            ["--expect-pane", "-x", "bob"],
            ["--expect-terminal", "a b", "bob"],
            ["--lock-wait", "0", "bob"],
            ["--lock-wait", "61", "bob"],
            ["--lock-wait", "1.5", "bob"],
            ["--bogus", "bob"],
        ]) {
            const { code, err } = await run(interrupt, args);
            expect(code).toBe(2);
            expect(err).toContain("usage");
        }
        expect(await calls()).toEqual([]);
    });
});
