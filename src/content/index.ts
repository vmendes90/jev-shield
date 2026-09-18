import { CandidateElement, EvaluationResult, UserSettings } from '../types';
import { findCandidatesInContainer, findDisplayAdElements, isMediaOrPlayerElement, isVisibleCandidateBox } from './extractor';
import { startYouTubeProtector } from './youtube';

let currentSettings: UserSettings = {
  apiKey: '',
  threshold: 0.85,
  isEnabled: true,
  revealBadge: true,
  whitelistedDomains: [],
};

// Map to hold pending candidate DOM elements by candidate ID
const pendingElements = new Map<string, HTMLElement>();
let isInitialized = false;
let debounceTimer: number | null = null;

/**
 * Inject isolated styles for Jev Shield badges and UI overlays.
 */
function injectStyles(): void {
  if (document.getElementById('jev-shield-styles')) return;

  const style = document.createElement('style');
  style.id = 'jev-shield-styles';
  style.textContent = `
    .jev-collapsed-ad {
      display: none !important;
    }
    .jev-badge-container {
      margin: 8px 0 !important;
      padding: 6px 12px !important;
      background: #f8fafc !important;
      border: 1px dashed #cbd5e1 !important;
      border-radius: 6px !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-size: 12px !important;
      color: #64748b !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      box-sizing: border-box !important;
    }
    .jev-badge-label {
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      font-weight: 500 !important;
    }
    .jev-badge-score {
      background: #e2e8f0 !important;
      color: #334155 !important;
      padding: 1px 6px !important;
      border-radius: 4px !important;
      font-size: 11px !important;
    }
    .jev-reveal-btn {
      background: none !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 4px !important;
      padding: 2px 8px !important;
      font-size: 11px !important;
      color: #475569 !important;
      cursor: pointer !important;
      transition: all 0.15s ease !important;
    }
    .jev-reveal-btn:hover {
      background: #e2e8f0 !important;
      color: #0f172a !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

/**
 * Checks if the current page should be protected.
 */
function isDomainActive(): boolean {
  if (!currentSettings.isEnabled) return false;
  const currentHost = window.location.hostname;
  return !currentSettings.whitelistedDomains.some(
    (d) => d === currentHost || currentHost.endsWith('.' + d)
  );
}

/**
 * Applies the blocking action to an element confirmed as an ad.
 */
function applyAdBlock(el: HTMLElement, result: EvaluationResult): void {
  // Absolute safeguard: Never collapse or hide a video or audio player
  if (isMediaOrPlayerElement(el)) {
    console.warn('[Jev Shield] Safeguard: Prevented collapsing video player container');
    el.dataset.jevChecked = 'true';
    delete el.dataset.jevPending;
    return;
  }

  el.dataset.jevAd = 'true';
  el.dataset.jevChecked = 'true';
  delete el.dataset.jevPending;

  if (currentSettings.revealBadge) {
    el.classList.add('jev-collapsed-ad');

    // Create a compact reveal badge
    const badge = document.createElement('div');
    badge.className = 'jev-badge-container';
    badge.setAttribute('data-jev-badge', result.id);

    const percentage = Math.round(result.probability * 100);
    badge.innerHTML = `
      <span class="jev-badge-label">
        🛡️ <span>Native Ad hidden by Jev</span>
        <span class="jev-badge-score">${percentage}% ad</span>
      </span>
      <button class="jev-reveal-btn" type="button">Show</button>
    `;

    const revealBtn = badge.querySelector('.jev-reveal-btn') as HTMLButtonElement;
    revealBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = el.classList.contains('jev-collapsed-ad');
      if (isHidden) {
        el.classList.remove('jev-collapsed-ad');
        revealBtn.textContent = 'Hide';
      } else {
        el.classList.add('jev-collapsed-ad');
        revealBtn.textContent = 'Show';
      }
    });

    el.parentNode?.insertBefore(badge, el);
  } else {
    el.style.display = 'none';
  }
}

/**
 * Applies neutral result to an element confirmed as organic content.
 */
function applyOrganicContent(el: HTMLElement): void {
  el.dataset.jevAd = 'false';
  el.dataset.jevChecked = 'true';
  delete el.dataset.jevPending;
}

/**
 * Dispatches candidate batch to the background service worker.
 */
async function processCandidateBatch(items: { element: HTMLElement; candidate: CandidateElement }[]): Promise<void> {
  if (items.length === 0 || !isDomainActive()) return;

  const payload: CandidateElement[] = [];

  for (const { element, candidate } of items) {
    if (element.dataset.jevChecked || element.dataset.jevPending) continue;
    element.dataset.jevPending = 'true';
    pendingElements.set(candidate.id, element);
    payload.push(candidate);
  }

  if (payload.length === 0) return;

  try {
    const results: EvaluationResult[] = await chrome.runtime.sendMessage({
      type: 'EVALUATE_CANDIDATES',
      candidates: payload,
    });

    if (!Array.isArray(results)) return;

    for (const res of results) {
      const el = pendingElements.get(res.id);
      if (!el) continue;

      if (res.isAd) {
        applyAdBlock(el, res);
      } else {
        applyOrganicContent(el);
      }
      pendingElements.delete(res.id);
    }
  } catch (err) {
    console.debug('[Jev Shield] Candidate evaluation request paused:', err);
  }
}

/**
 * Detects and collapses traditional display banner ads, ad iframes, and sponsored widgets.
 */
function cleanDisplayAds(root: ParentNode = document): void {
  if (!isDomainActive()) return;

  const displayAds = findDisplayAdElements(root);
  if (displayAds.length === 0) return;

  let blockedCount = 0;
  for (const el of displayAds) {
    if (el.dataset.jevChecked === 'true') continue;

    el.dataset.jevChecked = 'true';
    el.dataset.jevAd = 'true';
    el.classList.add('jev-collapsed-ad');
    el.style.setProperty('display', 'none', 'important');
    blockedCount++;
  }

  if (blockedCount > 0) {
    void chrome.runtime.sendMessage({
      type: 'RECORD_MANUAL_BLOCK',
      domain: window.location.hostname,
      count: blockedCount,
    }).catch(() => {});
  }
}

/**
 * Scans a subtree or the document for candidates.
 */
function scanForAds(root: ParentNode = document): void {
  if (!isDomainActive()) return;
  cleanDisplayAds(root);
  const candidates = findCandidatesInContainer(root);
  if (candidates.length > 0) {
    void processCandidateBatch(candidates);
  }
}

/**
 * Sets up a debounced MutationObserver to detect infinite scrolling / dynamic feed cards.
 */
function setupMutationObserver(): void {
  const observer = new MutationObserver((mutations) => {
    if (!isDomainActive()) return;

    let hasNewNodes = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            // Quick check to avoid observing our own badges or hidden elements
            if (el.dataset?.jevBadge || el.dataset?.jevChecked) continue;
            if (isVisibleCandidateBox(el)) {
              hasNewNodes = true;
              break;
            }
          }
        }
      }
      if (hasNewNodes) break;
    }

    if (hasNewNodes) {
      cleanDisplayAds(document);
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        scanForAds(document);
      }, 350);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Initializes the content script.
 */
async function init(): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;

  injectStyles();

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (response?.settings) {
      currentSettings = response.settings;
    }
  } catch (e) {
    console.debug('[Jev Shield] Could not fetch initial settings:', e);
  }

  if (isDomainActive()) {
    cleanDisplayAds(document);
    scanForAds(document);
    setupMutationObserver();
    startYouTubeProtector();
  }
}

// Listen for settings changes sent from popup
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SETTINGS_UPDATED' && message.settings) {
    currentSettings = message.settings;
    if (isDomainActive()) {
      cleanDisplayAds(document);
      scanForAds(document);
    }
  }
});

// Run initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void init());
} else {
  void init();
}
