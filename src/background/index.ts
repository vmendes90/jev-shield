import { CandidateElement, EvaluationResult, ExtensionMessage, ExtensionStats, UserSettings } from '../types';
import { evaluateBatchWithJev, getCooldownState } from './typesafe';

const DEFAULT_SETTINGS: UserSettings = {
  apiKey: '',
  threshold: 0.85,
  isEnabled: true,
  revealBadge: true,
  whitelistedDomains: [],
};

const DEFAULT_STATS: ExtensionStats = {
  totalEvaluated: 0,
  totalBlocked: 0,
};

/**
 * Retrieves user settings from local storage.
 */
async function getSettings(): Promise<UserSettings> {
  const data = await chrome.storage.local.get('userSettings');
  return { ...DEFAULT_SETTINGS, ...(data.userSettings || {}) };
}

/**
 * Retrieves stats from local storage.
 */
async function getStats(): Promise<ExtensionStats> {
  const data = await chrome.storage.local.get('extensionStats');
  return { ...DEFAULT_STATS, ...(data.extensionStats || {}) };
}

/**
 * Updates stats in local storage.
 */
async function recordStats(evaluatedCount: number, blockedCount: number): Promise<void> {
  const stats = await getStats();
  stats.totalEvaluated += evaluatedCount;
  stats.totalBlocked += blockedCount;
  await chrome.storage.local.set({ extensionStats: stats });
}

/**
 * Retrieves the session cache of evaluated hash snippets from chrome.storage.session.
 * Persists across MV3 background worker idle suspensions without disk writes.
 */
async function getSessionCache(): Promise<Record<string, EvaluationResult>> {
  try {
    const data = await chrome.storage.session.get('snippetCache');
    return data.snippetCache || {};
  } catch {
    return {};
  }
}

/**
 * Saves new entries to the session cache.
 */
async function saveToSessionCache(newEntries: Record<string, EvaluationResult>): Promise<void> {
  try {
    const current = await getSessionCache();
    const updated = { ...current, ...newEntries };
    await chrome.storage.session.set({ snippetCache: updated });
  } catch (err) {
    console.error('[Jev Shield] Failed to write to session cache:', err);
  }
}

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'GET_SETTINGS') {
    void (async () => {
      const [settings, stats, cooldown] = await Promise.all([
        getSettings(),
        getStats(),
        getCooldownState(),
      ]);
      sendResponse({ settings, stats, cooldown });
    })();
    return true; // Keep message port open for async response
  }

  if (message.type === 'UPDATE_SETTINGS') {
    void (async () => {
      const current = await getSettings();
      const updated: UserSettings = { ...current, ...message.settings };
      await chrome.storage.local.set({ userSettings: updated });

      // Broadcast settings update to all tabs
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_UPDATED',
            settings: updated,
          }).catch(() => {
            // Tab might not have content script running, safe to ignore
          });
        }
      }
      sendResponse({ success: true, settings: updated });
    })();
    return true;
  }

  if (message.type === 'GET_STATS') {
    void (async () => {
      const stats = await getStats();
      sendResponse(stats);
    })();
    return true;
  }

  if (message.type === 'EVALUATE_CANDIDATES') {
    void (async () => {
      const candidates: CandidateElement[] = message.candidates || [];
      if (candidates.length === 0) {
        sendResponse([]);
        return;
      }

      const settings = await getSettings();
      const sessionCache = await getSessionCache();

      const cachedResults: EvaluationResult[] = [];
      const uncachedCandidates: CandidateElement[] = [];

      for (const cand of candidates) {
        if (sessionCache[cand.id]) {
          cachedResults.push(sessionCache[cand.id]);
        } else {
          uncachedCandidates.push(cand);
        }
      }

      let freshResults: EvaluationResult[] = [];
      if (uncachedCandidates.length > 0) {
        freshResults = await evaluateBatchWithJev(
          uncachedCandidates,
          settings.apiKey,
          settings.threshold
        );

        // Store new results in session cache
        const cacheEntries: Record<string, EvaluationResult> = {};
        for (const res of freshResults) {
          cacheEntries[res.id] = res;
        }
        await saveToSessionCache(cacheEntries);

        // Record stats
        const blockedCount = freshResults.filter((r) => r.isAd).length;
        await recordStats(freshResults.length, blockedCount);
      }

      const allResults = [...cachedResults, ...freshResults];
      sendResponse(allResults);
    })();
    return true;
  }

  return false;
});
