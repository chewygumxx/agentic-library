#!/usr/bin/env -S usage bash
# shellcheck shell=bash
# SPDX-License-Identifier: GPL-3.0-only

#
#
# ~chewygumxx/agentic-library.git
# ::: :/skills/writing-usage-specs/scripts/greet.sh
#
#

#USAGE name "greet"
#USAGE about "Print a greeting"
#USAGE flag "--greeting <word>" default="hello" help="Greeting to print" {
#USAGE   choices "hello" "welcome"
#USAGE }
#USAGE flag "--excited" negate="--no-excited" default=#false help="Add an exclamation mark"
#USAGE arg "<name>" help="Name to greet"

set -eu

punctuation=
if [[ ${usage_excited:-} == true ]]; then
    punctuation='!'
fi
printf '%s, %s%s\n' "${usage_greeting:?Run this script with Usage}" \
    "${usage_name?Usage must set usage_name}" "$punctuation"
