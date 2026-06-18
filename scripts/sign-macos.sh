#!/usr/bin/env bash
#
# Ad-hoc sign the macOS .app bundle so it can be distributed to other Macs
# without triggering the misleading "damaged and can't be opened" Gatekeeper
# error.
#
# Ad-hoc signing (signing with "-" instead of a Developer ID certificate)
# does NOT require an Apple Developer account. The recipient will still see a
# one-time "unidentified developer" prompt the first time, which they bypass
# via right-click → Open → Open anyway. But they will NOT see the "damaged"
# error, because the bundle has a valid (if untrusted) signature.
#
# Usage (run on the build Mac after `npm run tauri build`):
#   ./scripts/sign-macos.sh
#
# Then distribute the produced .app (zip it for transfer) or the .dmg.

set -euo pipefail

APP="src-tauri/target/release/bundle/macos/Gitea Desktop.app"

if [ ! -d "$APP" ]; then
  echo "❌ App bundle not found at: $APP"
  echo "   Run 'npm run tauri build' first."
  exit 1
fi

echo "Signing: $APP"

# Sign every helper/binary inside the bundle first (deepest-first), then the
# app itself. --options runtime enables the hardened runtime, which is what
# notarization would require later — harmless for ad-hoc, and it makes the
# bundle consistent. --force replaces any existing linker-added ad-hoc sig.
#
# We sign all Mach-O executables under Contents/MacOS plus any bundled
# frameworks/helpers, then the top-level .app last.
find "$APP/Contents/MacOS" -type f -print0 2>/dev/null | while IFS= read -r -d '' bin; do
  if file "$bin" | grep -q Mach-O; then
    codesign --force --options runtime --sign - "$bin" 2>/dev/null || true
  fi
done

# Sign the app bundle itself (must be last).
codesign --force --options runtime --sign - "$APP"

# Verify.
echo ""
echo "=== verification ==="
codesign --verify --strict --verbose=2 "$APP" 2>&1 | head -5
echo ""
echo "Signature:"
codesign -dv "$APP" 2>&1 | grep -E "Identifier|Format|Signature|flags" | head -4

echo ""
echo "✅ Ad-hoc signed. Distribute via zip:"
echo "   cd \"src-tauri/target/release/bundle/macos\" && zip -r -y \"Gitea Desktop.zip\" \"Gitea Desktop.app\""
echo ""
echo "On the receiving Mac, the first launch shows 'unidentified developer'."
echo "Right-click the app → Open → Open anyway. (No 'damaged' error.)"
