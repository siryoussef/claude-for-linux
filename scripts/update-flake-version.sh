#!/usr/bin/env bash
# update-flake-version.sh - Check for new Claude Desktop DMG and update flake.nix
#
# Usage:
#   ./scripts/update-flake-version.sh          # Check and update if newer
#   ./scripts/update-flake-version.sh --check   # Only check, don't modify files
#   ./scripts/update-flake-version.sh --force    # Update even if same version
#
# Exit codes:
#   0 - Updated successfully (or already up-to-date with --check)
#   1 - Error
#   2 - Already up-to-date (no changes made)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FLAKE_NIX="$SCRIPT_DIR/../flake.nix"

# --- Configuration ---
REDIRECT_URL="https://claude.ai/api/desktop/darwin/universal/dmg/latest/redirect"
USER_AGENT="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
CURL_TIMEOUT=15

# --- Parse arguments ---
CHECK_ONLY=false
FORCE=false
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=true ;;
    --force) FORCE=true ;;
    --help|-h)
      echo "Usage: $0 [--check] [--force]"
      echo ""
      echo "  --check   Only check for updates, don't modify flake.nix"
      echo "  --force   Update even if version hasn't changed"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

# --- Helpers ---
log()  { echo ":: $*"; }
warn() { echo ":: WARNING: $*" >&2; }
die()  { echo ":: ERROR: $*" >&2; exit 1; }

# --- Read current values from flake.nix ---
if [ ! -f "$FLAKE_NIX" ]; then
  die "flake.nix not found at $FLAKE_NIX"
fi

current_version=$(grep -oP 'claudeVersion = "\K[^"]+' "$FLAKE_NIX") \
  || die "Could not read claudeVersion from flake.nix"
current_hash=$(grep -oP 'claudeDmgHash = "\K[^"]+' "$FLAKE_NIX") \
  || die "Could not read claudeDmgHash from flake.nix"
current_url=$(grep -oP 'claudeDmgUrl = "\K[^"]+' "$FLAKE_NIX" | sed "s/\${claudeVersion}/$current_version/g") \
  || die "Could not read claudeDmgUrl from flake.nix"

log "Current version: $current_version"
log "Current URL:     $current_url"

# --- Resolve latest DMG URL via redirect ---
log "Checking for latest version..."

url_pattern='https://downloads\.claude\.ai/releases/darwin/universal/[0-9]+\.[0-9]+\.[0-9]+/[^[:space:]"'"'"']+'
latest_url=""

for attempt in 1 2 3; do
  # Strategy 1: Parse Location header from the 307 redirect (no download needed)
  if [ -z "$latest_url" ]; then
    location_header=$(curl -s -o /dev/null -D - \
      --max-time "$CURL_TIMEOUT" \
      -A "$USER_AGENT" "$REDIRECT_URL" 2>/dev/null) || true
    latest_url=$(echo "$location_header" | grep -oP "(?i)location:\\s*\\K$url_pattern" | head -1) || true
  fi

  # Strategy 2: Follow redirect and capture effective URL
  if [ -z "$latest_url" ]; then
    effective=$(curl -sL -o /dev/null -w "%{url_effective}" \
      --max-time "$CURL_TIMEOUT" --max-filesize 1 \
      -A "$USER_AGENT" "$REDIRECT_URL" 2>/dev/null) || true
    if [[ "$effective" =~ $url_pattern ]]; then
      latest_url="$effective"
    fi
  fi

  if [ -n "$latest_url" ]; then
    break
  fi

  if [ "$attempt" -lt 3 ]; then
    sleep_time=$((attempt * 2))
    warn "Attempt $attempt failed, retrying in ${sleep_time}s..."
    sleep "$sleep_time"
  fi
done

if [ -z "$latest_url" ]; then
  die "Could not resolve latest DMG URL from redirect endpoint"
fi

# --- Parse version from URL ---
# URL format: https://downloads.claude.ai/releases/darwin/universal/1.1.XXXX/Claude-<hash>.dmg
latest_version=$(echo "$latest_url" | grep -oP '/universal/\K[0-9]+\.[0-9]+\.[0-9]+') \
  || die "Could not extract version from URL: $latest_url"

log "Latest version:  $latest_version"
log "Latest URL:      $latest_url"

# --- Compare ---
if [ "$current_version" = "$latest_version" ] && [ "$FORCE" = false ]; then
  log "Already up-to-date (v$current_version)"
  exit 2
fi

if [ "$current_version" = "$latest_version" ]; then
  log "Same version but --force specified, continuing..."
fi

log "Update available: $current_version -> $latest_version"

if [ "$CHECK_ONLY" = true ]; then
  echo ""
  echo "UPDATE_AVAILABLE=true"
  echo "CURRENT_VERSION=$current_version"
  echo "LATEST_VERSION=$latest_version"
  echo "LATEST_URL=$latest_url"
  exit 0
fi

# --- Compute SRI hash ---
log "Downloading DMG to compute hash (this downloads ~200MB)..."

if command -v nix-prefetch-url &>/dev/null; then
  # nix-prefetch-url returns a sha256 in base32; convert to SRI
  nix_hash=$(nix-prefetch-url --type sha256 "$latest_url" 2>/dev/null) \
    || die "nix-prefetch-url failed for $latest_url"
  sri_hash=$(nix-hash --type sha256 --to-sri "$nix_hash") \
    || die "Failed to convert hash to SRI format"

elif command -v nix &>/dev/null; then
  # nix store prefetch-file outputs JSON with the hash
  prefetch_output=$(nix store prefetch-file --json "$latest_url" 2>/dev/null) \
    || die "nix store prefetch-file failed for $latest_url"
  sri_hash=$(echo "$prefetch_output" | grep -oP '"hash":\s*"\K[^"]+') \
    || die "Could not parse hash from nix store prefetch-file output"

else
  # Fallback: curl + sha256sum + base64 (works without Nix installed)
  warn "Nix not found, using curl + sha256sum fallback"
  tmpfile=$(mktemp)
  trap 'rm -f "$tmpfile"' EXIT
  curl -fL --progress-bar -A "$USER_AGENT" -o "$tmpfile" "$latest_url" \
    || die "Failed to download $latest_url"
  raw_sha256=$(sha256sum "$tmpfile" | cut -d' ' -f1) \
    || die "sha256sum failed"
  # Convert hex to binary then base64 for SRI
  sri_hash="sha256-$(echo "$raw_sha256" | xxd -r -p | base64 -w0)" \
    || die "Failed to convert hash to SRI format"
  rm -f "$tmpfile"
  trap - EXIT
fi

log "SRI hash: $sri_hash"

# --- Construct new URL template ---
# The flake.nix uses ${claudeVersion} interpolation, so we need to extract the
# filename part and reconstruct the template
dmg_filename=$(basename "$latest_url")
new_url_template="https://downloads.claude.ai/releases/darwin/universal/\${claudeVersion}/$dmg_filename"

log "URL template: $new_url_template"

# --- Update flake.nix ---
log "Updating flake.nix..."

# Use sed to replace the three values atomically
sed -i \
  -e "s|claudeVersion = \"[^\"]*\"|claudeVersion = \"$latest_version\"|" \
  -e "s|claudeDmgHash = \"[^\"]*\"|claudeDmgHash = \"$sri_hash\"|" \
  -e "s|claudeDmgUrl = \"[^\"]*\"|claudeDmgUrl = \"$new_url_template\"|" \
  "$FLAKE_NIX"

# Verify the update
new_version=$(grep -oP 'claudeVersion = "\K[^"]+' "$FLAKE_NIX")
new_hash=$(grep -oP 'claudeDmgHash = "\K[^"]+' "$FLAKE_NIX")

if [ "$new_version" != "$latest_version" ]; then
  die "Version update verification failed: expected $latest_version, got $new_version"
fi

if [ "$new_hash" != "$sri_hash" ]; then
  die "Hash update verification failed"
fi

log "flake.nix updated successfully"
echo ""
echo "UPDATED=true"
echo "OLD_VERSION=$current_version"
echo "NEW_VERSION=$latest_version"
echo "NEW_HASH=$sri_hash"
echo "NEW_URL=$latest_url"
echo ""
log "Next steps:"
log "  1. Review: git diff flake.nix"
log "  2. Test:   nix build ."
log "  3. Commit: git add flake.nix && git commit -m 'Update Claude Desktop to v$latest_version'"
