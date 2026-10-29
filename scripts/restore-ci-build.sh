#!/bin/sh
# Put a downloaded CI build back where vite preview looks.
# Run this after npm ci. npm ci deletes node_modules/.nitro.
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$root"
src="$root/artifacts/ci-build"
test -f "$src/nitro-meta/last-build.json"
rm -rf .vercel/output .output node_modules/.nitro
mkdir -p .vercel node_modules
if [ -d "$src/vercel-output" ]; then
  cp -a "$src/vercel-output" .vercel/output
fi
if [ -d "$src/dot-output" ]; then
  cp -a "$src/dot-output" .output
fi
cp -a "$src/nitro-meta" node_modules/.nitro
echo "restored CI build for vite preview"
