#!/usr/bin/env bash
set -euo pipefail

TOTP_SECRET_ID="ff78c8cc-ab04-4bf6-9ac1-8491768d1d65"
TOTP_SCRIPT="/Users/ozant/nix-ozan/scripts/get-totp.sh"

cd "$(dirname "$0")/.."

# Ensure clean working tree
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working tree is not clean. Commit or stash changes first." >&2
  exit 1
fi

# Run tests
echo "Running tests..."
npm test

# Run typecheck
echo "Running typecheck..."
npm run typecheck

# Build
echo "Building..."
npm run build

# Get OTP
echo "Fetching TOTP..."
OTP=$("$TOTP_SCRIPT" "$TOTP_SECRET_ID")

# Publish
echo "Publishing to npm..."
npm publish --access public --otp "$OTP"

echo "Done! Published $(node -p "require('./package.json').name + '@' + require('./package.json').version")"
