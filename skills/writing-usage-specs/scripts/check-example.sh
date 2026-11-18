#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only

#
#
# ~chewygumxx/agentic-library.git
# ::: :/skills/writing-usage-specs/scripts/check-example.sh
#
#

set -eu

fail() {
    printf 'Example check failed: %s\n' "$*" >&2
    exit 1
}

for tool in usage jq; do
    command -v "$tool" >/dev/null || fail "$tool is required on PATH"
done

example=$(dirname -- "${BASH_SOURCE[0]}")/greet.sh
unset usage_excited usage_greeting usage_name

usage lint -W "$example"

report=$(usage explain -f "$example" --format json -- greet --greeting welcome Ada)
jq -e '
    .refused == null and (.errors == []) and
    any(.values[]; .kind == "flag" and .name == "greeting" and .value == "welcome") and
    any(.values[]; .kind == "arg" and .name == "name" and .value == "Ada")
' <<<"$report" >/dev/null || fail "unexpected bindings: $report"

report=$(usage explain -f "$example" --format json -- greet --greeting goodbye Ada)
jq -e '.refused | contains("Invalid choice")' <<<"$report" >/dev/null ||
    fail "expected choice rejection in the report: $report"

report=$(usage explain -f "$example" --format json -- greet)
jq -e '.refused == null and any(.errors[]; contains("Missing required arg"))' <<<"$report" >/dev/null ||
    fail "expected missing argument in the report: $report"

candidates=$(usage complete-word -f "$example" -- greet --greeting '')
[[ $candidates == $'hello\nwelcome' ]] || fail "unexpected candidates: $candidates"

normal=$("$example" Ada)
[[ $normal == 'hello, Ada' ]] || fail "unexpected greeting: $normal"

inherited=$(usage_excited=true "$example" Ada)
[[ $inherited == 'hello, Ada' ]] || fail "omitted switch inherited true: $inherited"

excited=$("$example" --greeting welcome --excited Ada)
[[ $excited == 'welcome, Ada!' ]] || fail "unexpected excited greeting: $excited"

negated=$(usage_excited=true "$example" --no-excited Ada)
[[ $negated == 'hello, Ada' ]] || fail "negated switch stayed true: $negated"

help=$("$example" --help)
[[ $help == *--greeting* ]] || fail "help did not list --greeting"

status=0
rejection=$("$example" --greeting goodbye Ada 2>&1) || status=$?
[[ $status == 1 && $rejection == *'Invalid choice'* ]] ||
    fail "expected invalid-choice error with status 1, got status $status: $rejection"

printf 'Usage example checks passed.\n'
