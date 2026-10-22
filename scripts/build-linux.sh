#!/usr/bin/env bash
# Builds Linux installers (Debian .deb, .AppImage) for Unbound.
#
# Run on Debian/Ubuntu, or anywhere with dpkg + fakeroot:
#   scripts/build-linux.sh
#
# Why a script instead of `npm run dist`: electron-builder needs fakeroot and
# xz-utils for the .deb, and it refuses to build AppImage on some hosts without
# FUSE. Both are cheap to check for and complain about clearly.
set -euo pipefail

cd "$(dirname "$0")/.."

missing=()
command -v dpkg >/dev/null || missing+=("dpkg")
command -v fakeroot >/dev/null || missing+=("fakeroot")
command -v xz >/dev/null || missing+=("xz-utils")

if [ ${#missing[@]} -gt 0 ]; then
  echo "Missing build tools: ${missing[*]}" >&2
  echo "Install with: sudo apt-get install -y fakeroot xz-utils" >&2
  exit 1
fi

npm run build
npx electron-builder --linux deb AppImage --publish never

echo
echo "Artifacts in dist/:"
ls -lh dist/*.deb dist/*.AppImage 2>/dev/null || true
