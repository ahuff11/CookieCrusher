# CookieCrusher (Chrome Extension)

CookieCrusher is a Manifest V3 Chrome extension that tries to automatically decline cookie consent prompts by finding and clicking **Reject / Decline / Necessary only** actions.

## Features

- MV3 extension with:
  - service worker (`service_worker.js`)
  - content script (`content_script.js`)
  - popup UI (`popup.html`, `popup.js`)
- Settings persisted in `chrome.storage.sync`:
  - `enabled` (default `true`)
  - `perSiteDisabled` (hostname map)
  - `debugLogging` (default `false`)
- MutationObserver with throttled scanning (max once every ~750ms)
- Conservative safety checks:
  - limits actions to likely consent dialogs/containers
  - only clicks visible, enabled controls
  - avoids "accept/agree" actions
- Supports manual **Run now** from popup.

## Install (Load unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select this project folder (`CookieCrusher`).

## Usage

1. Visit a site with a cookie banner.
2. Click the CookieCrusher extension icon.
3. Use popup controls:
   - **Enabled globally**: turn scanning on/off everywhere.
   - **Disable on this site**: exclude current hostname.
   - **Debug logging**: enable console logging from the content script.
   - **Run now**: force an immediate scan for the current tab.

## Troubleshooting

- **No action detected**
  - Some sites use unusual consent UIs; click **Run now** after the banner fully loads.
  - Open DevTools Console and enable **Debug logging** in popup for diagnostics.

- **Site-specific breakage**
  - Use **Disable on this site** from popup.

- **SPA websites**
  - CookieCrusher monitors URL changes (`pushState`, `replaceState`, `popstate`, `hashchange`) and rescans automatically.

## Notes

- The extension uses only local scripts (no remote libraries).
- Heuristics are intentionally conservative to reduce accidental clicks on non-consent controls.
