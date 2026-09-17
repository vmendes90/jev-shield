# 🤖 AGENTS.md — Contributor & AI Agent Guidelines

Welcome to **Jev Shield**. This document defines the architectural principles, codebase conventions, operational rules, and critical pitfalls that any AI coding agent or human developer **must understand and adhere to** when contributing to this repository.

---

## 1. Project Overview & Philosophy

**Jev Shield** is an open-source Google Chrome extension (Manifest V3) designed to block native ads, sponsored feed items, and video ads. It combines:
1. **Semantic Classification (TypeSafe Jev Model)**: Evaluates textual DOM candidates with the `noul` primitive to semantically recognize sponsored and native promotional posts that share identical DOM structures and first-party origins with organic content.
2. **Dual-Layer Media Engine**: Bypasses modern anti-adblock detection and server-side ad insertion (SSAI) on video platforms (notably YouTube) without triggering black-screen buffer penalties.
3. **Strict Bring-Your-Own-Key (BYOK) Security**: Zero telemetry. User API keys and preferences are stored exclusively on the client machine in `chrome.storage.local`.

---

## 2. Critical Architectural Invariants (DO NOT BREAK)

### 🔴 Rule 1: Never Block Internal YouTube Player Endpoints in `declarativeNetRequest`
* **Forbidden**: Do NOT add `||youtube.com/youtubei/v1/player/ad_break*` or `||youtube.com/pagead/*` to `rules/ad_rules.json`.
* **Reason**: When the browser cancels internal player endpoints with `net::ERR_BLOCKED_BY_CLIENT`, YouTube's player catches the failure and enforces an intentional **10–15 second "fake buffering" timeout stall** before resuming video playback.
* **Allowed**: Only block external ad tracking and ad delivery domains (e.g. `||googleads.g.doubleclick.net`, `||googlesyndication.com`, `||adservice.google.com`).

### 🔴 Rule 2: Never Set `video.currentTime = video.duration` on YouTube
* **Forbidden**: Do NOT attempt to fast-forward ads by setting `video.currentTime = video.duration` or dispatching synthetic `ended` events.
* **Reason**:
  1. In YouTube's MSE player, `video.duration` often reports the duration of the entire main video (e.g. 1067s / 17 min), NOT the ad. Seeking to `video.duration` jumps to the very end of the video.
  2. Seeking to the last millisecond of an ad segment starves the MediaSource buffer, rendering a black frame and freezing playback.
* **Allowed Solution**: Set `video.playbackRate = 16.0` and `video.muted = true`. At 16x speed, a 15-second ad finishes in ~0.9 seconds. Because the browser legitimately decodes the frames at 16x, the video buffer never stalls, frames transition smoothly, and YouTube receives a natural, unpenalized media transition into the main video.

### 🔴 Rule 3: Always Use Full Pointer & Mouse Event Sequences for Clicks
* **Forbidden**: Do NOT rely on simple `btn.click()`.
* **Reason**: YouTube uses Polymer button components and monitors synthetic event properties (`event.isTrusted`). A bare `.click()` call is frequently ignored.
* **Allowed Solution**: Use `simulateClick(element)` which dispatches the complete interaction lifecycle:
  `['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']` with `{ bubbles: true, cancelable: true, view: window, buttons: 1 }`.

### 🔴 Rule 4: Respect World Isolation (`MAIN` vs `ISOLATED`)
* **`world: "MAIN"` (`src/content/yt-engine.ts`)**:
  - Injected at `document_start` on `*://*.youtube.com/*`.
  - Runs directly in the webpage's JavaScript context.
  - Used for pruning `ytInitialPlayerResponse`, intercepting `/youtubei/v1/player` fetches, and executing 16x ad acceleration.
  - **Cannot** access `chrome.*` extension APIs directly.
* **`world: "ISOLATED"` (`src/content/index.ts`, `src/content/youtube.ts`)**:
  - Runs in the extension's sandbox.
  - Has full access to `chrome.runtime` and `chrome.storage`.
  - Manages `MutationObserver`, candidate element extraction, badge injection, and service worker messaging.

### 🔴 Rule 5: Never Hide or Collapse Media Player Containers
* **Forbidden**: Do NOT apply `display: none` or `.jev-collapsed-ad` to `#movie_player`, `ytd-player`, `.html5-video-player`, `<video>`, or `<audio>` elements.
* **Guard**: Always verify candidates against `isMediaOrPlayerElement(el)` in `src/content/extractor.ts` before applying any blocking actions.

### 🔴 Rule 6: Storage Partitioning Principles
* **`chrome.storage.session`**: Transient state. Holds the 32-bit FNV-1a snippet hash cache and the 2-minute error back-off cooldown timer. Survives service worker 30-second idle shutdowns without wearing out SSD disk I/O.
* **`chrome.storage.local`**: Persistent state. Stores user settings (`apiKey`, `threshold`, `isEnabled`, `revealBadge`, `whitelistedDomains`), lifetime metrics, domain block counters, and recent activity logs.

### 🔴 Rule 7: Enforce Bounding-Box Pre-Filtering
* Before processing any DOM candidate with regex or sending it to the TypeSafe API, evaluate `isVisibleCandidateBox(el)`. Discard any element with `rect.height <= 40 || rect.width <= 40` to avoid burning CPU cycles and tokens on invisible tracking pixels or hidden wrappers.

---

## 3. Directory Manifest

```text
jev-shield/
├── manifest.json            # Chrome MV3 manifest with permissions & content script definitions
├── vite.config.ts           # Bundler config using @crxjs/vite-plugin
├── tsconfig.json            # Strict TypeScript configuration
├── package.json             # Scripts & dependencies (@typesafe-ai/sdk, vite, crxjs)
├── rules/
│   └── ad_rules.json        # DeclarativeNetRequest rules (kept in sync with public/rules/)
├── scripts/
│   └── launch_chrome.js     # Standalone script to launch Chrome with Jev Shield loaded
├── public/
│   ├── icons/               # Extension icons (16.png, 48.png, 128.png)
│   └── rules/ad_rules.json  # Public rule asset for Vite distribution
├── src/
│   ├── types/
│   │   └── index.ts         # Central TypeScript interfaces (Contracts & Messages)
│   ├── content/
│   │   ├── extractor.ts     # Bounding-box pre-filtering, promo token heuristics, FNV-1a hashing
│   │   ├── youtube.ts       # Isolated content script: feed cleaner & simulateClick handler
│   │   ├── yt-engine.ts     # MAIN-world scriptlet: player ad pruning & 16x acceleration loop
│   │   └── index.ts         # Primary content script: MutationObserver & badge insertion
│   ├── background/
│   │   ├── typesafe.ts      # TypeSafe API client, noul evaluation, 2-minute back-off
│   │   └── index.ts         # Service worker: session cache, stats, domain map, badge counter
│   └── popup/
│       ├── index.html       # 3-tab popup markup (Dashboard, Activity Log, Settings)
│       ├── popup.css        # Clean UI styling
│       └── popup.ts         # Popup event handlers, settings persistence, tab navigation
```

---

## 4. Development & Build Commands

### Compiling & Bundling
```bash
npm run build
```
Executes `tsc && vite build`. Outputs optimized assets and extension manifest directly into `dist/`.

### Dedicated Chrome Testing
```bash
# Launch dedicated Chrome window with Jev Shield pre-loaded into .test-profile
npm run test:chrome

# Or target a specific YouTube video directly
node scripts/launch_chrome.js "https://www.youtube.com/watch?v=9EkMD8BoRVw"
```

### Loading Unpacked in Chrome
1. Navigate to `chrome://extensions`.
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** and select `C:\Users\valte\Desktop\Code\jev-shield\dist`.
4. When testing updates, click the **Reload icon (🔄)** on the Jev Shield card and refresh the target page (`Ctrl + F5`).

---

## 5. Coding Standards for AI Agents

1. **TypeScript Strictness**: Keep TypeScript strict mode clean. Never suppress type errors with `@ts-ignore` unless interfacing with browser internals that lack type definitions.
2. **Deterministic Hashing**: Use the 32-bit FNV-1a algorithm (`hashSnippet`) in `extractor.ts` for text snippets to minimize memory footprint in `chrome.storage.session`.
3. **Debounced Observers**: Always debounce `MutationObserver` callbacks (default: 350ms) to ensure smooth scrolling in high-density infinite feeds.
4. **Clean Git Hygiene**: Commit changes in small, logical chunks with conventional commit prefixes (`feat:`, `fix:`, `refactor:`, `docs:`).
5. **Always Verify Builds**: Run `npm run build` and confirm exit code 0 before reporting task completion to the user.
