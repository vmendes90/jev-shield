# Contributing to Jev Shield 🛡️

Thank you for your interest in contributing to **Jev Shield**! We welcome bug reports, feature proposals, and pull requests from both human developers and autonomous AI coding agents.

---

## Code of Conduct

Please be respectful, constructive, and kind in all discussions and code reviews.

---

## Development Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v20.0 or higher
- [Google Chrome](https://www.google.com/chrome/) (or Chromium-based browser)
- A [TypeSafe AI API Key](https://typesafe.ai)

### 2. Getting the Code
```bash
git clone https://github.com/vmendes90/jev-shield.git
cd jev-shield
npm install
```

### 3. Building the Extension
```bash
npm run build
```
This runs `tsc && vite build`. Output is written directly into `dist/`.

### 4. Running Chrome with Extension Loaded
```bash
# Launch a dedicated Chrome test window loaded with Jev Shield in an isolated profile
npm run test:chrome

# Or target a specific test page directly
node scripts/launch_chrome.js "https://canyoublockit.com/testing/"
```

---

## Invariants & Critical Architecture Rules

Before writing code or opening a PR, please read [AGENTS.md](AGENTS.md) thoroughly. Key rules include:

1. **YouTube DeclarativeNetRequest**: NEVER add internal player endpoints (`/youtubei/v1/player/ad_break*` or `/pagead/*`) to `rules/ad_rules.json`. This causes intentional 10–15 second fake buffering stalls enforced by YouTube's player.
2. **YouTube Video Seeking**: NEVER set `video.currentTime = video.duration`. Doing so jumps to the end of the entire main video or starves MSE media buffers. Instead, use the 16x muted acceleration engine.
3. **Synthetic Clicks**: Always use `simulateClick(element)` (`pointerdown` ➔ `mousedown` ➔ `pointerup` ➔ `mouseup` ➔ `click`) rather than bare `.click()`.
4. **Media Safeguards**: Never collapse or apply `display: none` to `#movie_player`, `ytd-player`, or any element matching `isMediaOrPlayerElement()`.
5. **BYOK Security**: Never add telemetry, tracking, or remote key transmission. The user's API key must only ever communicate with `api.typesafe.ai`.

---

## Submitting Pull Requests

1. Fork the repository and create your branch from `main` or `master`.
2. Ensure your changes compile cleanly with `npm run build` (exit code 0).
3. Follow conventional commit messages (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).
4. Open a Pull Request with a clear description of the problem solved and manual testing steps.
