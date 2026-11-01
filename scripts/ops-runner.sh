#!/bin/sh
# Railway "ops-runner" service (railway.ops.json): runs one maintenance script from src/scripts
# inside Railway, where the database is reachable, then exits. It never serves traffic.
#
# OPS_TASK (a service variable) names the script and its arguments, for example
#   src/scripts/seed-coral-request-site.ts --confirm=coral-safari-hurghada ...
# Unset or empty means idle. Anything that is not an existing src/scripts/*.ts file is refused,
# so the runner cannot execute arbitrary commands. Scripts keep their own guards (dry runs,
# --confirm and --database checks).
set -eu
set -f # no globbing of the task's arguments

task="${OPS_TASK:-}"
if [ -z "$task" ]; then
  echo "[ops-runner] idle: OPS_TASK is not set"
  exit 0
fi

# shellcheck disable=SC2086
set -- $task
script="$1"
shift

case "$script" in
  src/scripts/*.ts) ;;
  *) echo "[ops-runner] refused: OPS_TASK must start with src/scripts/<name>.ts"; exit 2 ;;
esac
case "$script" in
  *..*) echo "[ops-runner] refused: path must stay inside src/scripts"; exit 2 ;;
esac
if [ ! -f "$script" ]; then
  echo "[ops-runner] refused: $script does not exist"
  exit 2
fi

echo "[ops-runner] running: $script $*"
exec npx ts-node --transpile-only "$script" "$@"
