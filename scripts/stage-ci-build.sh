#!/bin/sh
# Pack the Vite/Nitro preview output for the other CI jobs.
# vite preview reads node_modules/.nitro/last-build.json, then nitro.json.
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$root"
out="$root/artifacts/ci-build"
rm -rf "$out"
mkdir -p "$out"
if [ -d .vercel/output ]; then
  cp -a .vercel/output "$out/vercel-output"
fi
if [ -d .output ]; then
  cp -a .output "$out/dot-output"
fi
if [ -d node_modules/.nitro ]; then
  cp -a node_modules/.nitro "$out/nitro-meta"
fi
test -f "$out/nitro-meta/last-build.json"
if [ ! -d "$out/vercel-output" ] && [ ! -d "$out/dot-output" ]; then
  echo "Vite build did not write .vercel/output or .output" >&2
  exit 1
fi
if ! find "$out" -name nitro.json -print -quit | grep -q .; then
  echo "Vite build did not write nitro.json" >&2
  exit 1
fi
echo "staged CI build in artifacts/ci-build"
