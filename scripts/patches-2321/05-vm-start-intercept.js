#!/usr/bin/env node
/**
 * Patch 05: VM Start Intercept (for Claude Desktop 1.1.2321)
 *
 * Intercepts ppt() (the VM start function) to create a bubblewrap session
 * on Linux instead of starting a macOS VM.
 * Old equivalent: v8 patch on $rt()
 *
 * Key changes from v8:
 * - Function is now ppt(t,e,r,n) instead of $rt(t,e,r)
 * - Status dispatch is now W1(Ku.Ready) instead of AE(jf.Ready)
 * - Uses Proxy for ChildProcess to add writeStdin method
 */
const fs = require('fs');
const path = require('path');

const EXTRACTED_DIR = process.argv[2] || '/tmp/app-extracted';
const INDEX_JS_PATH = path.join(EXTRACTED_DIR, '.vite/build/index.js');

console.log('=== Patch 05: VM Start Intercept (2321) ===\n');

let indexContent = fs.readFileSync(INDEX_JS_PATH, 'utf8');
try { fs.writeFileSync(INDEX_JS_PATH + '.05-backup', indexContent); } catch (e) { /* read-only fs */ }

// Find and wrap the ppt() VM start function
const original = 'async function ppt(t,e,r,n){var h,d,g,v,m,p;const i=Gw(),a=Date.now(),s=new Uht,o=$i();it.info(`[VM:start] Beginning startup';

const replacement = `async function ppt(t,e,r,n){
  // LINUX: Create bubblewrap session instead of macOS VM
  if(process.platform==="linux"&&global.__linuxCowork&&!global.__linuxCowork.vmInstance){
    console.log("[Cowork Linux] Creating bubblewrap session");
    const {manager}=global.__linuxCowork;
    try {
      const {randomUUID} = require('crypto');
      const sessionId = randomUUID();
      manager.createSession(sessionId);
      console.log("[Cowork Linux] Session created:", sessionId);

      const vmInstance = {
        sessionId,
        isConnected: () => true,
        isGuestConnected: () => Promise.resolve(true),
        isProcessRunning: (name) => {
          console.log("[Cowork Linux] isProcessRunning:", name);
          return Promise.resolve(name === "__heartbeat_ping__");
        },
        startVM: async () => {
          console.log("[Cowork Linux] startVM (no-op)");
          return Promise.resolve();
        },
        stopVM: async () => {
          console.log("[Cowork Linux] stopVM");
          return Promise.resolve();
        },
        installSdk: async () => {
          console.log("[Cowork Linux] installSdk (no-op)");
          return Promise.resolve();
        },
        setEventCallbacks: (onStdout, onStderr, onExit) => {
          console.log("[Cowork Linux] setEventCallbacks registered");
        },
        executeCommand: (cmd) => {
          console.log("[Cowork Linux] executeCommand:", cmd);
          return manager.spawnSandboxed(sessionId, cmd.command, cmd.args || []);
        },
        addMount: (hostPath, guestPath) => {
          console.log("[Cowork Linux] addMount:", hostPath, "->", guestPath);
          return manager.addMount(sessionId, hostPath);
        },
        dispose: () => {
          console.log("[Cowork Linux] Disposing session");
          manager.destroySession(sessionId);
          delete global.__linuxCowork.vmInstance;
        },
        addApprovedOauthToken: () => Promise.resolve(),
        spawn: (command, args, options) => {
          console.log("[Cowork Linux] spawn:", command, args);
          const procInfo = manager.spawnSandboxed(sessionId, command, args || []);
          const child = procInfo.child;
          return new Proxy(child, {
            get(target, prop) {
              if (prop === 'writeStdin') {
                return (data) => { if (target.stdin) target.stdin.write(data); };
              }
              if (prop === 'processId') return procInfo.id;
              const val = target[prop];
              return typeof val === 'function' ? val.bind(target) : val;
            }
          });
        },
        exec: (command) => {
          console.log("[Cowork Linux] exec:", command);
          return manager.spawnSandboxed(sessionId, '/bin/sh', ['-c', command]);
        },
        mkdir: () => Promise.resolve(),
        readFile: (p, encoding) => {
          const fs = require('fs');
          return Promise.resolve(fs.readFileSync(p, encoding || 'utf8'));
        },
        writeFile: (p, data, encoding) => {
          const fs = require('fs');
          fs.writeFileSync(p, data, encoding || 'utf8');
          return Promise.resolve();
        },
        rm: () => Promise.resolve(),
        configure: async () => {},
        createVM: async () => {},
        getVmProcessId: () => 'cowork-linux-' + sessionId.slice(0,8),
        connect: async () => {},
        disconnect: async () => { manager.destroySession(sessionId); },
      };

      global.__linuxCowork.vmInstance = vmInstance;
      console.log("[Cowork Linux] VM instance stored");

      // Signal UI that we're ready
      try {
        console.log("[Cowork Linux] Dispatching Ready status to UI");
        W1(Ku.Ready);
      } catch(statusErr) {
        console.log("[Cowork Linux] Status dispatch note:", statusErr.message);
      }

      console.log("[Cowork Linux] Returning vmInstance (skipping macOS VM logic)");
      return vmInstance;
    } catch(e) {
      console.error("[Cowork Linux] Session creation failed:", e);
    }
  }

  // Original function continues for macOS
  var h,d,g,v,m,p;const i=Gw(),a=Date.now(),s=new Uht,o=$i();it.info(\`[VM:start] Beginning startup`;

if (indexContent.includes(original)) {
  indexContent = indexContent.replace(original, replacement);
  console.log('  Patched ppt() VM start function for Linux\n');
} else {
  console.log('  WARNING: ppt() pattern not found\n');
}

fs.writeFileSync(INDEX_JS_PATH, indexContent);
console.log('Patch 05 applied\n');
