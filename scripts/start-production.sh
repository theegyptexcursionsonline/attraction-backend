#!/usr/bin/env bash
set -euo pipefail
app_root=$(cd -- "$(dirname -- "$0")/.." && pwd)
runtime="$app_root/.runtime/node/bin/node"
if [ "$("$runtime" --version)" != 'v24.22.0' ]; then
  echo 'Production requires the verified Node v24.22.0 runtime' >&2
  exit 1
fi
cd "$app_root"
exec "$runtime" dist/app.js
