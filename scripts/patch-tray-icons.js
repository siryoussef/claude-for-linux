#!/usr/bin/env node
/**
 * Dynamic Tray Icon Linux Patch
 *
 * Discovers and patches two functions for tray icon support on Linux:
 *
 * 1. Resource path function - returns real filesystem path on Linux
 *    Original: function X(){return Y.app.isPackaged?Z.resourcesPath:Y.resolve(__dirname,"..","..","resources")}
 *    Patched:  function X(){return process.platform==="linux"?Y.join(Y.dirname(Y.app.getAppPath()),"resources"):Y.app.isPackaged?Z.resourcesPath:Y.resolve(__dirname,"..","..","resources")}
 *
 * 2. Icon filename selection - uses PNG icons on Linux
 *    Original: Hi?e=Y.nativeTheme.shouldUseDarkColors?"Tray-Win32-Dark.ico":"Tray-Win32.ico":e="TrayIconTemplate.png"
 *    Patched:  process.platform==="linux"?(e=Y.nativeTheme.shouldUseDarkColors?"TrayIconTemplate-Dark.png":"TrayIconTemplate.png"):Hi?...
 *
 * Version-resilient — discovers patterns at build time using semantic matching.
 */
const fs = require('fs');
const path = require('path');

const EXTRACTED_DIR = process.argv[2] || '/tmp/app-extracted';
const INDEX_JS_PATH = path.join(EXTRACTED_DIR, '.vite/build/index.js');

console.log('=== Dynamic Patch: Tray Icon Linux ===\n');

let content = fs.readFileSync(INDEX_JS_PATH, 'utf8');

// --- Part A: Resource path function ---
// Pattern: function WORD(){return WORD.app.isPackaged?WORD.resourcesPath:WORD.resolve(__dirname,"..","..","resources")}
// We need to discover the variable names dynamically

console.log('[Patch 08a] Finding resource path function...');

// Match: function X(){return Y.app.isPackaged?Z.resourcesPath:Y.resolve(__dirname,"..","..","resources")}
// The pattern has a stable structure with 3 variable references
const resourcePathRegex = /function (\w+)\(\)\{return (\w+)\.app\.isPackaged\?(\w+)\.resourcesPath:(\w+)\.resolve\(__dirname,"\.","\.","resources"\)\}/g;

const resourcePathMatches = [...content.matchAll(resourcePathRegex)];

if (resourcePathMatches.length === 0) {
  console.log('  WARNING: Exact resource path pattern not found, trying relaxed pattern...');

  // Relaxed pattern: function that returns resources path with resolve(__dirname, "..", "..", "resources")
  // We need to capture the entire function including the closing brace
  const relaxedRegex = /function (\w+)\(\)\{return (\w+)\.app\.isPackaged\?(\w+)\.resourcesPath:(\w+)\.resolve\(__dirname,"[^"]*","[^"]*","[^"]*"\)\}/g;
  const relaxedMatches = [...content.matchAll(relaxedRegex)];

  if (relaxedMatches.length === 0) {
    console.error('  ERROR: Could not find resource path function');
    process.exit(1);
  }

  if (relaxedMatches.length > 1) {
    console.log(`  WARNING: Found ${relaxedMatches.length} candidates, using first match`);
  }

  const match = relaxedMatches[0];
  const funcName = match[1];
  const appVar = match[2];
  const resourcesVar = match[3];
  const resolveVar = match[4];

  const originalFunc = match[0];
  const patchedFunc = `function ${funcName}(){return process.platform==="linux"?${resolveVar}.join(${resolveVar}.dirname(${appVar}.app.getAppPath()),"resources"):${appVar}.app.isPackaged?${resourcesVar}.resourcesPath:${resolveVar}.resolve(__dirname,"..","..","resources")}`;

  if (!content.includes(originalFunc)) {
    console.error('  ERROR: Could not locate original function for replacement');
    process.exit(1);
  }

  content = content.replace(originalFunc, patchedFunc);
  console.log(`  Found resource path function: ${funcName}()`);
  console.log('  Patched resource path function for Linux');
} else {
  if (resourcePathMatches.length > 1) {
    console.log(`  WARNING: Found ${resourcePathMatches.length} matches, using first`);
  }

  const match = resourcePathMatches[0];
  const funcName = match[1];
  const appVar = match[2];
  const resourcesVar = match[3];
  const resolveVar = match[4];

  const originalFunc = match[0];
  const patchedFunc = `function ${funcName}(){return process.platform==="linux"?${resolveVar}.join(${resolveVar}.dirname(${appVar}.app.getAppPath()),"resources"):${appVar}.app.isPackaged?${resourcesVar}.resourcesPath:${resolveVar}.resolve(__dirname,"..","..","resources")}`;

  content = content.replace(originalFunc, patchedFunc);
  console.log(`  Found resource path function: ${funcName}()`);
  console.log('  Patched resource path function for Linux');
}

// --- Part B: Icon filename selection ---
console.log('\n[Patch 08b] Finding icon filename selection...');

// Pattern: WORD?e=WORD.nativeTheme.shouldUseDarkColors?"Tray-Win32-Dark.ico":"Tray-Win32.ico":e="TrayIconTemplate.png"
// This is typically part of a larger expression for tray icon creation

const iconPatternRegex = /(\w+)\?e=(\w+)\.nativeTheme\.shouldUseDarkColors\?"Tray-Win32-Dark\.ico":"Tray-Win32\.ico":e="TrayIconTemplate\.png"/;
const iconMatch = content.match(iconPatternRegex);

if (!iconMatch) {
  console.log('  WARNING: Exact icon pattern not found, trying relaxed pattern...');

  // Relaxed: look for the ternary with Tray-Win32 and TrayIconTemplate
  const relaxedIconRegex = /(\w+)\?e=(\w+)\.nativeTheme\.shouldUseDarkColors\?"[^"]+\.ico":"[^"]+\.ico":e="TrayIconTemplate\.png"/;
  const relaxedIconMatch = content.match(relaxedIconRegex);

  if (!relaxedIconMatch) {
    console.error('  ERROR: Could not find icon filename selection');
    process.exit(1);
  }

  const conditionVar = relaxedIconMatch[1];
  const nativeThemeVar = relaxedIconMatch[2];
  const originalIcon = relaxedIconMatch[0];

  // Extract the actual icon filenames from the original
  const darkIconMatch = originalIcon.match(/"([^"]*\.ico)"/);
  const lightIconMatch = originalIcon.match(/:"([^"]*\.ico)"/);

  const darkIcon = darkIconMatch ? darkIconMatch[1] : 'Tray-Win32-Dark.ico';
  const lightIcon = lightIconMatch ? lightIconMatch[1] : 'Tray-Win32.ico';

  const patchedIcon = `process.platform==="linux"?(e=${nativeThemeVar}.nativeTheme.shouldUseDarkColors?"TrayIconTemplate-Dark.png":"TrayIconTemplate.png"):${originalIcon}`;

  content = content.replace(originalIcon, patchedIcon);
  console.log(`  Found icon selection with condition var: ${conditionVar}`);
  console.log('  Patched icon filename selection for Linux');
} else {
  const conditionVar = iconMatch[1];
  const nativeThemeVar = iconMatch[2];
  const originalIcon = iconMatch[0];

  const patchedIcon = `process.platform==="linux"?(e=${nativeThemeVar}.nativeTheme.shouldUseDarkColors?"TrayIconTemplate-Dark.png":"TrayIconTemplate.png"):${originalIcon}`;

  content = content.replace(originalIcon, patchedIcon);
  console.log(`  Found icon selection with condition var: ${conditionVar}`);
  console.log('  Patched icon filename selection for Linux');
}

// Write the patched content before verification
fs.writeFileSync(INDEX_JS_PATH, content);

// Verify patches
console.log('\nVerifying patches...');
const patchedContent = fs.readFileSync(INDEX_JS_PATH, 'utf8');

if (!patchedContent.includes('process.platform==="linux"') || !patchedContent.includes('TrayIconTemplate-Dark.png')) {
  console.error('  ERROR: Verification failed — patches not properly applied');
  process.exit(1);
}

console.log('  All tray icon patches verified\n');
console.log('=== Patch 08 applied successfully ===\n');
