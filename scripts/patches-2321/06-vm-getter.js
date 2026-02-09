#!/usr/bin/env node
/**
 * Patch 06: VM Getter Override (for Claude Desktop 1.1.2321)
 *
 * Patches Ai() to return our Linux VM instance.
 * Also patches fwe() to not short-circuit on non-darwin.
 * Old equivalent: v10 patch on vi(), v11 patch on Swift module
 */
const fs = require('fs');
const path = require('path');

const EXTRACTED_DIR = process.argv[2] || '/tmp/app-extracted';
const INDEX_JS_PATH = path.join(EXTRACTED_DIR, '.vite/build/index.js');

console.log('=== Patch 06: VM Getter Override (2321) ===\n');

let indexContent = fs.readFileSync(INDEX_JS_PATH, 'utf8');
try { fs.writeFileSync(INDEX_JS_PATH + '.06-backup', indexContent); } catch (e) { /* read-only fs */ }

// Patch 6a: Ai() - return our VM instance on Linux
const originalAi = 'async function Ai(){const t=await uwe();return(t==null?void 0:t.vm)??null}';
const replacementAi = `async function Ai(){if(process.platform==="linux"&&global.__linuxCowork&&global.__linuxCowork.vmInstance){console.log("[Cowork Linux] Ai() returning Linux VM");return global.__linuxCowork.vmInstance}const t=await uwe();return(t==null?void 0:t.vm)??null}`;

if (indexContent.includes(originalAi)) {
  indexContent = indexContent.replace(originalAi, replacementAi);
  console.log('  Patched Ai() for Linux VM\n');
} else {
  console.log('  WARNING: Ai() pattern not found\n');
}

// Patch 6b: fwe() - don't return null on Linux
// Original: async function fwe(){return process.platform!=="darwin"?null:await uwe()}
const originalFwe = 'async function fwe(){return process.platform!=="darwin"?null:await uwe()}';
const replacementFwe = 'async function fwe(){return process.platform!=="darwin"&&process.platform!=="linux"?null:await uwe()}';

if (indexContent.includes(originalFwe)) {
  indexContent = indexContent.replace(originalFwe, replacementFwe);
  console.log('  Patched fwe() for Linux\n');
} else {
  console.log('  WARNING: fwe() pattern not found\n');
}

fs.writeFileSync(INDEX_JS_PATH, indexContent);
console.log('Patch 06 applied\n');
