#!/usr/bin/env python3
# vim:set expandtab shiftwidth=4 filetype=python:
# SPDX-License-Identifier: GPL-3.0-only

#
#
# ~chewygumxx/agentic-library.git
# ::: :/skills/managing-worktrunk-worktrees/scripts/switch-path.py
#
#

"""Print the path of a successful Worktrunk switch for a headless caller."""

import argparse
import json
import subprocess
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repository", help="directory inside the Git repository")
    parser.add_argument("branch", help="branch or other explicit switch target")
    parser.add_argument("--create", action="store_true", help="create a new branch")
    parser.add_argument("--base", help="base ref when creating a branch")
    parser.add_argument("--wt", default="wt", help="Worktrunk executable (such as git-wt)")
    args = parser.parse_args()
    if args.branch.startswith("-") and args.branch != "-":
        parser.error("switch target must be a branch, path, or Worktrunk shortcut")

    repository = str(Path(args.repository).absolute())
    command = [args.wt, "-C", repository, "switch", "--no-cd", "--format=json"]
    if args.create:
        command.append("--create")
    if args.base is not None:
        command.append(f"--base={args.base}")
    command.append(args.branch)

    try:
        result = subprocess.run(command, stdout=subprocess.PIPE, encoding="utf-8")
    except OSError as error:
        print(f"Could not run {args.wt}: {error}", file=sys.stderr)
        return 1

    payload = None
    if result.stdout.strip():
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError:
            print("Could not read Worktrunk switch JSON.", file=sys.stderr)
    path = payload.get("path") if isinstance(payload, dict) else None

    if result.returncode:
        if isinstance(path, str) and path:
            print(f"Worktrunk reported a checkout at {path}", file=sys.stderr)
        if result.returncode < 0:
            return 128 - result.returncode
        return result.returncode

    if not isinstance(path, str) or not path or not Path(path).is_dir():
        print("Worktrunk did not return an existing checkout path.", file=sys.stderr)
        return 1

    print(path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
