#!/usr/bin/env bash

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

yarn typecheck > "$tmp/typecheck.log" 2>&1 &
pid_typecheck=$!

yarn lint > "$tmp/lint.log" 2>&1 &
pid_lint=$!

yarn prettier --check . > "$tmp/prettier.log" 2>&1 &
pid_prettier=$!

failed=0

wait $pid_typecheck || { echo "❌ typecheck failed"; echo ""; cat "$tmp/typecheck.log"; echo ""; failed=1; }
wait $pid_lint || { echo "❌ lint failed"; echo ""; cat "$tmp/lint.log"; echo ""; failed=1; }
wait $pid_prettier || { echo "❌ prettier failed"; echo ""; cat "$tmp/prettier.log"; echo ""; failed=1; }

if [ $failed -ne 0 ]; then
  echo "‼️ run yarn fix to automatically fix issues ‼️"
  exit 1
fi

echo "✅ all checks passed"
