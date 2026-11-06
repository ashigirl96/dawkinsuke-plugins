#!/bin/sh
# Checks a model table: every role has a line, and every entry is
# inherit-parent, auto, or a model ID with an optional effort.
# Prints `sheet ok`, or `sheet invalid: <problems>` and exits 1.
# Usage: check-sheet.sh <sheet>
set -eu
sheet=$1
if [ ! -f "$sheet" ] || [ ! -r "$sheet" ]; then
  echo "sheet invalid: cannot read $sheet"
  exit 1
fi
dir=$(cd "$(dirname "$0")" && pwd)
if ! normalized=$(sh "$dir/read-sheet.sh" "$sheet"); then
  echo "sheet invalid: cannot decode $sheet"
  exit 1
fi
printf '%s\n' "$normalized" | LC_ALL=C awk -f "$dir/sheet.awk" -f "$dir/check-sheet.awk"
