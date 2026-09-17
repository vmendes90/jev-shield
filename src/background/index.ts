import { BlockedLog, CandidateElement, EvaluationResult, ExtensionMessage, ExtensionStats, UserSettings } from '../types';
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
  cacheHits: 0,
  apiCalls: 0,
  pageBlocked: {},
  recentLogs: [],
};

// In-memory tab block counts
const tabBlockedCounts = new Map<number, number>();

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
 * Retrieves the session cache of evaluated hash snippets from chrome.storage.session.
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

/**
 * Updates the extension toolbar badge for a tab.
 */
function updateTabBadge(tabId: number, count: number): void {
  try {
    if (count > 0) {
      chrome.action.setBadgeText({ tabId, text: count > 99 ? '99+' : count.toString() });
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#0284c7' });
    } else {
      chrome.action.setBadgeText({ tabId, text: '' });
    }
  } catch {
    // Ignore if tab was closed
  }
}

// Reset tab count when navigating
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    tabBlockedCounts.set(tabId, 0);
    updateTabBadge(tabId, 0);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabBlockedCounts.delete(tabId);
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type === 'GET_SETTINGS') {
    void (async () => {
      const [settings, stats, cooldown] = await Promise.all([
        getSettings(),
        getStats(),
        getCooldownState(),
      ]);
      sendResponse({ settings, stats, cooldown });
    })();
    return true;
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
          }).catch(() => {});
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

  if (message.type === 'CLEAR_STATS') {
    void (async () => {
      await chrome.storage.local.set({ extensionStats: DEFAULT_STATS });
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.type === 'CLEAR_CACHE') {
    void (async () => {
      await chrome.storage.session.remove('snippetCache');
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.type === 'RECORD_MANUAL_BLOCK') {
    void (async () => {
      const domain = message.domain;
      const count = message.count || 1;
      const stats = await getStats();
      stats.totalBlocked += count;
      stats.pageBlocked[domain] = (stats.pageBlocked[domain] || 0) + count;
      await chrome.storage.local.set({ extensionStats: stats });

      if (sender.tab?.id) {
        const currentTabCount = (tabBlockedCounts.get(sender.tab.id) || 0) + count;
        tabBlockedCounts.set(sender.tab.id, currentTabCount);
        updateTabBadge(sender.tab.id, currentTabCount);
      }
      sendResponse({ success: true });
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
      const stats = await getStats();

      const cachedResults: EvaluationResult[] = [];
      const uncachedCandidates: CandidateElement[] = [];

      for (const cand of candidates) {
        if (sessionCache[cand.id]) {
          cachedResults.push(sessionCache[cand.id]);
        } else {
          uncachedCandidates.push(cand);
        }
      }

      stats.totalEvaluated += candidates.length;
      stats.cacheHits += cachedResults.length;

      let freshResults: EvaluationResult[] = [];
      if (uncachedCandidates.length > 0) {
        stats.apiCalls += 1;
        freshResults = await evaluateBatchWithJev(
          uncachedCandidates,
          settings.apiKey,
          settings.threshold
        );

        // Save fresh results into session cache
        const cacheEntries: Record<string, EvaluationResult> = {};
        for (const res of freshResults) {
          cacheEntries[res.id] = res;
        }
        await saveToSessionCache(cacheEntries);
      }

      const allResults = [...cachedResults, ...freshResults];
      const newlyBlocked = allResults.filter((r) => r.isAd);

      if (newlyBlocked.length > 0) {
        stats.totalBlocked += newlyBlocked.length;

        // Build log entries
        const candidateMap = new Map<string, CandidateElement>(
          candidates.map((c) => [c.id, c])
        );

        for (const res of newlyBlocked) {
          const cand = candidateMap.get(res.id);
          if (cand) {
            stats.pageBlocked[cand.domain] = (stats.pageBlocked[cand.domain] || 0) + 1;
            const logItem: BlockedLog = {
              id: res.id,
              domain: cand.domain,
              snippet: cand.text.slice(0, 120),
              probability: res.probability,
              timestamp: Date.now(),
            };
            stats.recentLogs.unshift(logItem);
          }
        }

        // Keep at most 20 recent logs
        stats.recentLogs = stats.recentLogs.slice(0, 20);

        // Update tab badge
        if (sender.tab?.id) {
          const currentTabCount = (tabBlockedCounts.get(sender.tab.id) || 0) + newlyBlocked.length;
          tabBlockedCounts.set(sender.tab.id, currentTabCount);
          updateTabBadge(sender.tab.id, currentTabCount);
        }
      }

      await chrome.storage.local.set({ extensionStats: stats });
      sendResponse(allResults);
    })();
    return true;
  }

  return false;
});
