
;(function() {
  if (process.platform !== "linux") return;
  function fixPlatformText(node) {
    if (node.nodeType === 3) {
      var t = node.textContent;
      if (t && (t.includes("for Windows") || t.includes("for Mac"))) {
        node.textContent = t.replace(/for Windows/g, "for Linux").replace(/for Mac/g, "for Linux");
      }
    } else if (node.childNodes) {
      for (var i = 0; i < node.childNodes.length; i++) {
        fixPlatformText(node.childNodes[i]);
      }
    }
  }
  function scanDocument() {
    if (document.body) fixPlatformText(document.body);
    if (document.title && (document.title.includes("for Windows") || document.title.includes("for Mac"))) {
      document.title = document.title.replace(/for Windows/g, "for Linux").replace(/for Mac/g, "for Linux");
    }
  }
  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.addedNodes) {
        for (var j = 0; j < m.addedNodes.length; j++) {
          fixPlatformText(m.addedNodes[j]);
        }
      }
      if (m.type === "characterData" && m.target.nodeType === 3) {
        var t = m.target.textContent;
        if (t && (t.includes("for Windows") || t.includes("for Mac"))) {
          m.target.textContent = t.replace(/for Windows/g, "for Linux").replace(/for Mac/g, "for Linux");
        }
      }
    }
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() {
      scanDocument();
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
  } else {
    scanDocument();
    if (document.body) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  window.addEventListener("load", scanDocument);
})();
