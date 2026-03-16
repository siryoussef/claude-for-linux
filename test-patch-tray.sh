#!/bin/bash
# Test the patch-tray-icons.js script manually

set -e

echo "=== Testing patch-tray-icons.js ==="

# Create test directory
TEST_DIR="/tmp/patch-test-$$"
mkdir -p "$TEST_DIR/.vite/build"

# Test case 1: Exact pattern match (version 2685 style)
echo "[Test 1] Testing exact pattern match..."
cat > "$TEST_DIR/.vite/build/index.js" <<'JSEOF'
// Test file with exact pattern from version 2685
function nSt(){return Pe.app.isPackaged?_a.resourcesPath:Te.resolve(__dirname,"..","..","resources")}
Hi?e=Pe.nativeTheme.shouldUseDarkColors?"Tray-Win32-Dark.ico":"Tray-Win32.ico":e="TrayIconTemplate.png"
JSEOF

echo "  Before patch:"
cat "$TEST_DIR/.vite/build/index.js"

node ./scripts/patch-tray-icons.js "$TEST_DIR"

echo "  After patch:"
cat "$TEST_DIR/.vite/build/index.js"

# Verify
if grep -q 'process.platform==="linux"' "$TEST_DIR/.vite/build/index.js" && \
   grep -q 'TrayIconTemplate-Dark.png' "$TEST_DIR/.vite/build/index.js"; then
  echo "  ✅ Test 1 passed"
else
  echo "  ❌ Test 1 failed"
  exit 1
fi

# Test case 2: Relaxed pattern (unknown version structure)
echo ""
echo "[Test 2] Testing relaxed pattern match..."
cat > "$TEST_DIR/.vite/build/index.js" <<'JSEOF'
// Test file with slightly different structure
function xYz(){return AB.app.isPackaged?CD.resourcesPath:EF.resolve(__dirname,"..","..","resources")}
someVar?e=AB.nativeTheme.shouldUseDarkColors?"Custom-Dark.ico":"Custom-Light.ico":e="TrayIconTemplate.png"
JSEOF

echo "  Before patch:"
cat "$TEST_DIR/.vite/build/index.js"

node ./scripts/patch-tray-icons.js "$TEST_DIR"

echo "  After patch:"
cat "$TEST_DIR/.vite/build/index.js"

# Verify
if grep -q 'process.platform==="linux"' "$TEST_DIR/.vite/build/index.js" && \
   grep -q 'TrayIconTemplate-Dark.png' "$TEST_DIR/.vite/build/index.js"; then
  echo "  ✅ Test 2 passed"
else
  echo "  ❌ Test 2 failed"
  exit 1
fi

# Cleanup
rm -rf "$TEST_DIR"

echo ""
echo "=== All tests passed ==="
