#!/usr/bin/env sh
# vim:set expandtab shiftwidth=4 filetype=sh:
# SPDX-License-Identifier: GPL-3.0-only

#
#
# ~chewygumxx/agentic-library.git
# ::: :/skills/coordinating-agents/scripts/pane-lock.sh
#
#

# Sourced by the other scripts: `. "$here/pane-lock.sh"`. A pane takes one
# writer at a time, so a message cannot land among another's text and
# Enter. Status and pane come from `herdr agent get`, which takes an
# agent's name or its pane's id.

# die <exit code> <message>
die() {
    code=$1
    shift
    printf '%s: %s\n' "${0##*/}" "$*" >&2
    exit "$code"
}

# Prints the directory of state kept between runs, making it private.
state_dir() {
    dir=${XDG_STATE_HOME:-$HOME/.local/state}/coordinating-agents
    mkdir -p "$dir" || die 1 "cannot make $dir"
    chmod 700 "$dir"
    printf '%s\n' "$dir"
}

# Holds the pane's lock on fd 9 until the script exits. With a second
# argument, waits that many seconds at most, then exits 7, unwritten.
lock_pane() {
    [ -n "${XDG_RUNTIME_DIR:-}" ] || die 1 'XDG_RUNTIME_DIR is not set'
    dir=$XDG_RUNTIME_DIR/coordinating-agents
    mkdir -p "$dir" || die 1 "cannot make $dir"
    chmod 700 "$dir"
    name=$(printf '%s' "$1" | tr -c '[:alnum:]' _)
    exec 9>"$dir/$name.lock" || die 1 "cannot open the lock of pane $1"
    if [ -n "${2:-}" ]; then
        flock -w "$2" 9 || die 7 "pane $1 is locked: gave up after $2 s"
        return
    fi
    flock 9 || die 1 "cannot lock pane $1"
}

# deadline_* hold a send to $deadline_at, an epoch in milliseconds that
# --deadline-at sets. No deadline leaves a send unchanged. Exit 10 is
# before a write; send-prompt.sh uses 11 after text, where delivery is
# uncertain.
deadline_remaining() {
    [ -n "${deadline_at:-}" ] || return 1
    now_ms=$(date +%s%3N) || die 10 'cannot read the clock'
    case $now_ms in *[!0-9]* | '') die 10 'cannot read the clock' ;; *) ;; esac
    printf '%s\n' "$((deadline_at - now_ms))"
}

deadline_check() {
    [ -n "${deadline_at:-}" ] || return 0
    left=$(deadline_remaining) || die "$1" 'invalid deadline'
    [ "$left" -gt 0 ] || die "$1" 'deadline expired'
}

deadline_lock_wait() {
    left=$(deadline_remaining) || die 10 'invalid deadline'
    [ "$left" -gt 0 ] || die 10 'deadline expired'
    printf '%s\n' "$(((left + 999) / 1000))"
}

deadline_pause() {
    code=$1 pause=$2
    [ -n "${deadline_at:-}" ] || {
        sleep "$pause"
        return
    }
    deadline_check "$code"
    left=$(deadline_remaining) || die "$code" 'invalid deadline'
    case $pause in *[!0-9.]* | '') die 1 'invalid send pause' ;; *) ;; esac
    whole=${pause%%.*}
    [ -n "$whole" ] || whole=0
    needed=$((whole * 1000))
    [ "$pause" = "$whole" ] || needed=$((needed + 1000))
    [ "$needed" -lt "$left" ] || die "$code" 'deadline expires during the send pause'
    sleep "$pause"
}

# agent_field <agent> <jq filter on the agent>: fails for an absent
# agent, whose reply is an error without a result.
agent_field() {
    herdr agent get "$1" 2>/dev/null | jq -er ".result.agent | $2"
}

agent_pane() {
    agent_field "$1" .pane_id
}

agent_status() {
    agent_field "$1" .agent_status
}

# Prints the id of your own pane as it is now. $HERDR_PANE_ID keeps the id
# the pane started with, which moving the pane changes: `herdr pane get`
# follows that, and `herdr agent get` does not.
own_pane() {
    herdr pane get "${HERDR_PANE_ID:?}" 2>/dev/null |
        jq -er '.result.pane.pane_id'
}

# Prints your own agent's name, else its pane's id.
own_name() {
    own=$(own_pane) || return 1
    agent_field "$own" '.name // .pane_id'
}

# process_start <pid>: Linux's boot id and start ticks. The pid comes from
# herdr's own process-info, never from a model or worker report.
process_start() {
    boot=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null) || return 1
    stat=$(cat "/proc/$1/stat" 2>/dev/null) || return 1
    rest=${stat##*) }
    set -f
    # Split numeric /proc stat fields after comm removal; globbing is off.
    # shellcheck disable=SC2086
    set -- $rest
    set +f
    [ "$#" -ge 20 ] && [ "$1" != Z ] && [ "$1" != X ] || return 1
    printf '%s:%s\n' "$boot" "${20}"
}

# occupant_guard <agent> <pane> <session> <pid> <start>: called only after
# lock_pane. A session is preferred; otherwise compare the foreground
# process group's /proc start. Exit 9 before any pane write on a mismatch.
occupant_guard() {
    agent=$1 pane=$2 session=$3 pid=$4 started=$5
    if [ -n "$session" ]; then
        seen=$(agent_field "$agent" '.agent_session.value // ""') ||
            die 9 "agent $agent has no readable session"
        [ "$seen" = "$session" ] ||
            die 9 "agent $agent is another session in pane $pane"
    elif [ -n "$pid$started" ]; then
        info=$(herdr pane process-info --pane "$pane" 2>/dev/null |
            jq -er '.result.process_info.foreground_process_group_id |
                select(type == "number" and . > 0 and floor == .)') ||
            die 9 "pane $pane has no readable foreground process"
        [ "$info" = "$pid" ] ||
            die 9 "pane $pane has foreground process $info, not $pid"
        now_start=$(process_start "$info") ||
            die 9 "pane $pane foreground process start is unreadable"
        [ "$now_start" = "$started" ] ||
            die 9 "pane $pane foreground process was replaced"
    fi
}
