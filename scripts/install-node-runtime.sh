#!/usr/bin/env bash
set -euo pipefail

# Nixpacks selects a Node major, not a patch. Keep the tested V8 repair pinned
# to the official distribution bytes before installing dependencies or starting.
version=24.22.0
case "$(uname -s):$(uname -m)" in
  Linux:x86_64) arch=x64; digest=cc2f601cee82d9a5a233302fe307abc600727035fd7d2c3a3571755989e95008 ;;
  Linux:aarch64|Linux:arm64) arch=arm64; digest=fef00bb4d36e1c50104a9775a10359beee98f162b4104dd12472c75065c6a143 ;;
  *) echo 'Unsupported production runtime platform' >&2; exit 1 ;;
esac

runtime_root="${1:-/app/.runtime}"
case "$runtime_root" in /*) ;; *) echo 'Runtime directory must be absolute' >&2; exit 1 ;; esac
mkdir -p "$runtime_root"
# A fresh image installs once. Never overwrite an unexpected existing runtime.
if [ -e "$runtime_root/node" ]; then
  echo 'Runtime destination already exists' >&2
  exit 1
fi
staging=$(mktemp -d "$runtime_root/.node-install.XXXXXX")
trap 'rm -rf "$staging"' EXIT
archive="node-v${version}-linux-${arch}.tar.xz"
curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \
  --connect-timeout 15 --max-time 180 --retry 2 \
  "https://nodejs.org/dist/v${version}/${archive}" --output "$staging/$archive"
(cd "$staging" && printf '%s  %s\n' "$digest" "$archive" | sha256sum --check --status)
mkdir "$staging/extracted"
tar -xJf "$staging/$archive" -C "$staging/extracted" --strip-components=1
if [ "$("$staging/extracted/bin/node" --version)" != "v$version" ]; then
  echo 'Downloaded runtime version does not match the pinned version' >&2
  exit 1
fi
mv "$staging/extracted" "$runtime_root/node"
echo "Installed verified Node v$version"
