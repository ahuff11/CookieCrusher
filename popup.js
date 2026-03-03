const SETTINGS_DEFAULTS = {
  enabled: true,
  perSiteDisabled: {},
  debugLogging: false
};

const ui = {
  siteLabel: document.getElementById("siteLabel"),
  enabledToggle: document.getElementById("enabledToggle"),
  siteToggle: document.getElementById("siteToggle"),
  debugToggle: document.getElementById("debugToggle"),
  runNowButton: document.getElementById("runNowButton"),
  status: document.getElementById("status")
};

const state = {
  hostname: "",
  tabId: null,
  settings: { ...SETTINGS_DEFAULTS }
};

function setStatus(message, isError = false) {
  ui.status.textContent = message;
  ui.status.classList.toggle("error", isError);
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(Object.keys(SETTINGS_DEFAULTS));
  state.settings = {
    ...SETTINGS_DEFAULTS,
    ...stored,
    perSiteDisabled: stored.perSiteDisabled || {}
  };
}

function refreshUI() {
  ui.siteLabel.textContent = state.hostname
    ? `Current site: ${state.hostname}`
    : "Current site: unavailable";

  ui.enabledToggle.checked = Boolean(state.settings.enabled);
  ui.debugToggle.checked = Boolean(state.settings.debugLogging);
  ui.siteToggle.checked = Boolean(state.settings.perSiteDisabled[state.hostname]);
  ui.siteToggle.disabled = !state.hostname;
}

async function saveSettings() {
  await chrome.storage.sync.set(state.settings);
  chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED" });
}

async function toggleGlobalEnabled() {
  state.settings.enabled = ui.enabledToggle.checked;
  await saveSettings();
  setStatus(`Global scanning ${state.settings.enabled ? "enabled" : "disabled"}.`);
}

async function toggleSiteDisabled() {
  if (!state.hostname) {
    return;
  }

  state.settings.perSiteDisabled[state.hostname] = ui.siteToggle.checked;
  await saveSettings();

  setStatus(
    ui.siteToggle.checked
      ? `Disabled on ${state.hostname}.`
      : `Enabled on ${state.hostname}.`
  );
}

async function toggleDebugLogging() {
  state.settings.debugLogging = ui.debugToggle.checked;
  await saveSettings();
  setStatus(`Debug logging ${state.settings.debugLogging ? "enabled" : "disabled"}.`);
}

async function runNow() {
  setStatus("Running scan...");

  try {
    const response = await chrome.runtime.sendMessage({ type: "RUN_SCAN_ACTIVE_TAB" });
    if (!response?.ok) {
      throw new Error(response?.error || "Failed to trigger scan.");
    }

    const result = response.result || {};
    if (result.clicked) {
      setStatus("Reject action clicked.");
    } else if (result.reason) {
      setStatus(`No action: ${result.reason}.`);
    } else {
      setStatus("Scan finished.");
    }
  } catch (error) {
    setStatus(`Run failed: ${error.message}`, true);
  }
}

async function init() {
  const tab = await getActiveTab();
  state.tabId = tab?.id || null;

  try {
    const url = tab?.url ? new URL(tab.url) : null;
    state.hostname = url?.hostname || "";
  } catch {
    state.hostname = "";
  }

  await loadSettings();
  refreshUI();

  ui.enabledToggle.addEventListener("change", toggleGlobalEnabled);
  ui.siteToggle.addEventListener("change", toggleSiteDisabled);
  ui.debugToggle.addEventListener("change", toggleDebugLogging);
  ui.runNowButton.addEventListener("click", runNow);
}

init().catch((error) => {
  setStatus(`Initialization failed: ${error.message}`, true);
});
