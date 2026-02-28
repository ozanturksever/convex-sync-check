#!/usr/bin/env bash
set -euo pipefail

TOTP_SECRET_ID="ff78c8cc-ab04-4bf6-9ac1-8491768d1d65"
TOTP_SCRIPT="/Users/ozant/nix-ozan/scripts/get-totp.sh"

cd "$(dirname "$0")/.."

VERSION_TYPE="${1:-}"

usage() {
  echo "Usage: $0 <patch|minor|major>"
  echo ""
  echo "  patch   0.1.0 → 0.1.1"
  echo "  minor   0.1.0 → 0.2.0"
  echo "  major   0.1.0 → 1.0.0"
  echo ""
  echo "This script will:"
  echo "  1. Ensure clean working tree and up-to-date main branch"
  echo "  2. Run tests and typecheck"
  echo "  3. Bump version in package.json"
  echo "  4. Build the project"
  echo "  5. Commit, tag, and push"
  echo "  6. Publish to npm"
  echo "  7. Create GitHub release"
  exit 1
}

if [[ -z "$VERSION_TYPE" ]] || [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
  usage
fi

# Ensure clean working tree
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working tree is not clean. Commit or stash changes first." >&2
  exit 1
fi

# Ensure on main branch
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "Error: Must be on main branch (currently on $BRANCH)." >&2
  exit 1
fi

# Pull latest
echo "Pulling latest from origin..."
git pull --rebase origin main

CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Run tests
echo ""
echo "=== Running tests ==="
npm test

# Run typecheck
echo ""
echo "=== Running typecheck ==="
npm run typecheck

# Bump version (npm version updates package.json + package-lock.json, no git tag)
echo ""
echo "=== Bumping version ($VERSION_TYPE) ==="
NEW_VERSION=$(npm version "$VERSION_TYPE" --no-git-tag-version)
# npm version returns "vX.Y.Z", strip the v
NEW_VERSION="${NEW_VERSION#v}"
echo "New version: $NEW_VERSION"

# Build
echo ""
echo "=== Building ==="
npm run build

# Commit and tag
echo ""
echo "=== Committing and tagging ==="
git add package.json package-lock.json
git commit -m "$(cat <<EOF
release: v${NEW_VERSION}
EOF
)"
git tag -a "v${NEW_VERSION}" -m "v${NEW_VERSION}"

# Push
echo ""
echo "=== Pushing to origin ==="
git push origin main --follow-tags

# Publish to npm
echo ""
echo "=== Publishing to npm ==="
OTP=$("$TOTP_SCRIPT" "$TOTP_SECRET_ID")
npm publish --access public --otp "$OTP"

# Create GitHub release
echo ""
echo "=== Creating GitHub release ==="
PREV_TAG=$(git tag --sort=-v:refname | head -2 | tail -1)
if [ "$PREV_TAG" = "v${NEW_VERSION}" ]; then
  # First release, no previous tag
  CHANGELOG=$(git log --oneline --no-decorate HEAD)
else
  CHANGELOG=$(git log --oneline --no-decorate "${PREV_TAG}..v${NEW_VERSION}")
fi

gh release create "v${NEW_VERSION}" \
  --title "v${NEW_VERSION}" \
  --notes "$(cat <<EOF
## Changes

${CHANGELOG}

## Install

\`\`\`bash
npx @fatagnus/convex-sync-check
\`\`\`
EOF
)"

echo ""
echo "=== Released v${NEW_VERSION} ==="
echo "  npm: https://www.npmjs.com/package/@fatagnus/convex-sync-check"
echo "  gh:  $(gh release view "v${NEW_VERSION}" --json url -q .url)"
