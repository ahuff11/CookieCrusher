(() => {
  const SETTINGS_DEFAULTS = {
    enabled: true,
    perSiteDisabled: {},
    debugLogging: false
  };

  const REJECT_PATTERNS = [
    "reject all",
    "reject",
    "decline",
    "disagree",
    "deny",
    "only necessary",
    "necessary only",
    "essential only",
    "opt out"
  ];

  const AVOID_PATTERNS = ["accept", "agree", "allow all", "ok", "got it"];

  const MANAGE_PATTERNS = [
    "manage",
    "preferences",
    "settings",
    "customize",
    "options",
    "privacy choices"
  ];

  const SAVE_PATTERNS = ["save", "confirm", "apply", "submit", "done"];

  const CONSENT_CONTAINER_KEYWORDS = [
    "cookie",
    "consent",
    "gdpr",
    "cmp",
    "privacy",
    "onetrust",
    "cookiebot"
  ];

  const STATE = {
    observer: null,
    settings: { ...SETTINGS_DEFAULTS },
    hasClickedReject: false,
    pendingScan: null,
    lastScanTime: 0,
    minScanIntervalMs: 750,
    locationHref: location.href
  };

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function debugLog(...args) {
    if (STATE.settings.debugLogging) {
      console.debug("[CookieCrusher]", ...args);
    }
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) {
      return false;
    }

    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number.parseFloat(style.opacity) === 0
    ) {
      return false;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    return true;
  }

  function isDisabled(el) {
    return (
      el.matches("[disabled], [aria-disabled='true']") ||
      el.getAttribute("disabled") !== null
    );
  }

  function getElementText(el) {
    const parts = [
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
      el.getAttribute("value"),
      el.getAttribute("data-testid"),
      el.getAttribute("data-test"),
      el.getAttribute("data-action"),
      el.getAttribute("name")
    ]
      .filter(Boolean)
      .map(normalizeText);

    return normalizeText(parts.join(" "));
  }

  function scoreRejectCandidate(el) {
    if (!el || !isVisible(el) || isDisabled(el)) {
      return Number.NEGATIVE_INFINITY;
    }

    const text = getElementText(el);
    if (!text) {
      return Number.NEGATIVE_INFINITY;
    }

    let score = 0;

    for (const badPattern of AVOID_PATTERNS) {
      if (text.includes(badPattern)) {
        score -= 25;
      }
    }

    for (const rejectPattern of REJECT_PATTERNS) {
      if (text.includes(rejectPattern)) {
        score += 40;
      }
    }

    if (text.includes("all")) {
      score += 6;
    }

    if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") {
      score += 5;
    }

    if (el.matches("[data-testid*='reject' i], [id*='reject' i], [class*='reject' i]")) {
      score += 20;
    }

    return score;
  }

  function elementHasConsentHint(el) {
    const attributeText = normalizeText(
      [
        el.id,
        el.className,
        el.getAttribute("aria-label"),
        el.getAttribute("role"),
        el.getAttribute("data-testid"),
        el.getAttribute("data-test")
      ]
        .filter(Boolean)
        .join(" ")
    );

    const bodyText = normalizeText(el.textContent).slice(0, 2000);

    return CONSENT_CONTAINER_KEYWORDS.some(
      (keyword) => attributeText.includes(keyword) || bodyText.includes(keyword)
    );
  }

  function findConsentContainers() {
    const containers = new Set();

    const keywordSelectors = CONSENT_CONTAINER_KEYWORDS.flatMap((keyword) => [
      `[id*='${keyword}' i]`,
      `[class*='${keyword}' i]`,
      `[data-testid*='${keyword}' i]`
    ]).join(", ");

    document.querySelectorAll(keywordSelectors).forEach((el) => {
      if (isVisible(el)) {
        containers.add(el);
      }
    });

    document.querySelectorAll("[role='dialog'], [aria-modal='true']").forEach((el) => {
      if (isVisible(el) && elementHasConsentHint(el)) {
        containers.add(el);
      }
    });

    return [...containers].filter(elementHasConsentHint);
  }

  function findBestRejectButton(container) {
    if (!container) {
      return null;
    }

    const candidates = container.querySelectorAll(
      "button, a, [role='button'], input[type='button'], input[type='submit']"
    );

    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of candidates) {
      const score = scoreRejectCandidate(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    if (best && bestScore > 0) {
      return best;
    }

    return null;
  }

  function findButtonByPatterns(root, patterns) {
    const controls = root.querySelectorAll(
      "button, a, [role='button'], input[type='button'], input[type='submit']"
    );

    for (const control of controls) {
      if (!isVisible(control) || isDisabled(control)) {
        continue;
      }

      const text = getElementText(control);
      if (patterns.some((pattern) => text.includes(pattern))) {
        return control;
      }
    }

    return null;
  }

  function clickElement(el) {
    if (!el || !isVisible(el) || isDisabled(el)) {
      return false;
    }

    el.click();
    debugLog("Clicked element:", el, "text:", getElementText(el));
    return true;
  }

  async function tryManageFlow(container) {
    const manageButton = findButtonByPatterns(container, MANAGE_PATTERNS);
    if (!manageButton) {
      return false;
    }

    if (!clickElement(manageButton)) {
      return false;
    }

    await wait(350);

    const overlayRoot = document.body;
    const rejectButton = findBestRejectButton(overlayRoot);
    if (rejectButton && clickElement(rejectButton)) {
      return true;
    }

    const toggles = overlayRoot.querySelectorAll(
      "input[type='checkbox'], [role='switch'][aria-checked='true']"
    );

    let changedToggle = false;
    toggles.forEach((toggle) => {
      if (!isVisible(toggle) || isDisabled(toggle)) {
        return;
      }

      const labelText = normalizeText(
        [toggle.getAttribute("name"), toggle.getAttribute("id"), toggle.getAttribute("aria-label")]
          .filter(Boolean)
          .join(" ")
      );

      if (labelText.includes("necessary") || labelText.includes("essential")) {
        return;
      }

      if (toggle instanceof HTMLInputElement && toggle.checked) {
        toggle.click();
        changedToggle = true;
      } else if (toggle.getAttribute("role") === "switch" && toggle.getAttribute("aria-checked") === "true") {
        toggle.click();
        changedToggle = true;
      }
    });

    const saveButton = findButtonByPatterns(overlayRoot, SAVE_PATTERNS);
    if (changedToggle && saveButton) {
      return clickElement(saveButton);
    }

    return false;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function scanAndReject({ force = false } = {}) {
    if (!force && STATE.hasClickedReject) {
      debugLog("Skipping scan: already clicked once on this page.");
      return { attempted: false, clicked: false, reason: "already_clicked" };
    }

    await loadSettings();

    const host = location.hostname;
    if (!STATE.settings.enabled) {
      return { attempted: false, clicked: false, reason: "globally_disabled" };
    }

    if (STATE.settings.perSiteDisabled?.[host]) {
      return { attempted: false, clicked: false, reason: "site_disabled" };
    }

    const containers = findConsentContainers();
    debugLog("Consent container count:", containers.length);

    for (const container of containers) {
      const rejectButton = findBestRejectButton(container);
      if (rejectButton && clickElement(rejectButton)) {
        STATE.hasClickedReject = true;
        return { attempted: true, clicked: true, strategy: "direct_reject" };
      }

      const managed = await tryManageFlow(container);
      if (managed) {
        STATE.hasClickedReject = true;
        return { attempted: true, clicked: true, strategy: "manage_flow" };
      }
    }

    return { attempted: true, clicked: false, reason: "no_candidate_found" };
  }

  async function loadSettings() {
    const stored = await chrome.storage.sync.get(Object.keys(SETTINGS_DEFAULTS));
    STATE.settings = {
      ...SETTINGS_DEFAULTS,
      ...stored,
      perSiteDisabled: stored.perSiteDisabled || {}
    };
  }

  function scheduleScan(reason = "mutation") {
    const now = Date.now();
    const elapsed = now - STATE.lastScanTime;
    const waitMs = Math.max(STATE.minScanIntervalMs - elapsed, 0);

    if (STATE.pendingScan) {
      return;
    }

    STATE.pendingScan = setTimeout(async () => {
      STATE.pendingScan = null;
      STATE.lastScanTime = Date.now();
      debugLog("Running scheduled scan. Reason:", reason);
      await scanAndReject();
    }, waitMs);
  }

  function setupMutationObserver() {
    if (STATE.observer) {
      STATE.observer.disconnect();
    }

    STATE.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList" || mutation.type === "attributes") {
          scheduleScan("mutation_observer");
          return;
        }
      }
    });

    STATE.observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "id", "style", "aria-hidden", "aria-modal"]
    });
  }

  function monitorSpaNavigation() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    function handleUrlChange(source) {
      if (location.href !== STATE.locationHref) {
        STATE.locationHref = location.href;
        STATE.hasClickedReject = false;
        debugLog("Detected SPA navigation via", source, "->", location.href);
        scheduleScan("spa_navigation");
      }
    }

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      handleUrlChange("pushState");
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      handleUrlChange("replaceState");
    };

    window.addEventListener("popstate", () => handleUrlChange("popstate"));
    window.addEventListener("hashchange", () => handleUrlChange("hashchange"));
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "RUN_SCAN_NOW") {
      scanAndReject({ force: true })
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === "SETTINGS_UPDATED") {
      loadSettings().then(() => {
        debugLog("Settings updated via message.");
      });
    }

    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") {
      return;
    }

    if (changes.enabled || changes.perSiteDisabled || changes.debugLogging) {
      loadSettings().then(() => {
        debugLog("Settings refreshed from storage change.");
        scheduleScan("settings_changed");
      });
    }
  });

  (async function init() {
    await loadSettings();
    setupMutationObserver();
    monitorSpaNavigation();
    await scanAndReject();
  })();
})();
