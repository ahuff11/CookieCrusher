const DEFAULT_SETTINGS = {
  enabled: true,
  perSiteDisabled: {},
  debugLogging: false
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const updates = {};

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (existing[key] === undefined) {
      updates[key] = value;
    }
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.sync.set(updates);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "RUN_SCAN_ACTIVE_TAB") {
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];

    if (!activeTab?.id) {
      sendResponse({ ok: false, error: "No active tab found." });
      return;
    }

    chrome.tabs.sendMessage(activeTab.id, { type: "RUN_SCAN_NOW" }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      sendResponse({ ok: true, result: response || null });
    });
  });

  return true;
});
