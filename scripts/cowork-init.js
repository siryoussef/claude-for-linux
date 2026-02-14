
;(function(){
  // Linux Cowork Implementation
  // CRITICAL: Check process type FIRST to prevent renderer crashes
  if (process.type !== 'browser') return;
  if (process.platform !== 'linux') return;

  console.log('[Cowork] Linux Cowork initialization starting...');

  try {
    const {CoworkSessionManager, VMCompatibilityAdapter} =
      require('claude-cowork-linux');

    global.__linuxCowork = {
      manager: new CoworkSessionManager(),
      adapter: VMCompatibilityAdapter,
      version: '2.0.0-linux',
      platform: 'bubblewrap'
    };

    console.log('[Cowork] Linux Cowork enabled via bubblewrap');

    const {CoworkSessionManager: CSM} = require('claude-cowork-linux');
    if (CSM.isAvailable && CSM.isAvailable()) {
      console.log('[Cowork] Bubblewrap available:', CSM.getVersion ? CSM.getVersion() : 'unknown');
    } else {
      console.warn('[Cowork] Bubblewrap not found at expected path');
    }
  } catch(e) {
    console.error('[Cowork] Failed to load Linux Cowork:', e.message);
  }
})();
