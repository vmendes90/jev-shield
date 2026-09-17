import { BlockedLog, CooldownState, ExtensionStats, UserSettings } from '../types';

let currentSettings: UserSettings = {
  apiKey: '',
  threshold: 0.85,
  isEnabled: true,
  revealBadge: true,
  whitelistedDomains: [],
};

let currentTabDomain = '';

// DOM Elements
const enabledToggle = document.getElementById('enabledToggle') as HTMLInputElement;
const badgeToggle = document.getElementById('badgeToggle') as HTMLInputElement;
const apiKeyInput = document.getElementById('apiKeyInput') as HTMLInputElement;
const saveKeyBtn = document.getElementById('saveKeyBtn') as HTMLButtonElement;
const thresholdSlider = document.getElementById('thresholdSlider') as HTMLInputElement;
const thresholdValue = document.getElementById('thresholdValue') as HTMLElement;
const statusPill = document.getElementById('statusPill') as HTMLElement;

const statBlocked = document.getElementById('statBlocked') as HTMLElement;
const statEvaluated = document.getElementById('statEvaluated') as HTMLElement;
const statCacheHit = document.getElementById('statCacheHit') as HTMLElement;
const statApiCalls = document.getElementById('statApiCalls') as HTMLElement;
const currentDomainText = document.getElementById('currentDomainText') as HTMLElement;
const currentDomainStatus = document.getElementById('currentDomainStatus') as HTMLElement;
const logsContainer = document.getElementById('logsContainer') as HTMLElement;

const whitelistSiteBtn = document.getElementById('whitelistSiteBtn') as HTMLButtonElement;
const cooldownBanner = document.getElementById('cooldownBanner') as HTMLElement;
const cooldownReason = document.getElementById('cooldownReason') as HTMLElement;
const clearCacheBtn = document.getElementById('clearCacheBtn') as HTMLButtonElement;
const clearStatsBtn = document.getElementById('clearStatsBtn') as HTMLButtonElement;

/**
 * Format relative time (e.g., 'Just now', '2m ago').
 */
function formatTimeAgo(timestamp: number): string {
  const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSeconds < 60) return 'Just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours}h ago`;
}

/**
 * Render recent detections in Activity Log.
 */
function renderLogs(logs: BlockedLog[] = []): void {
  if (!logsContainer) return;

  if (logs.length === 0) {
    logsContainer.innerHTML = '<div class="log-empty">No ads detected in this session yet.</div>';
    return;
  }

  logsContainer.innerHTML = logs
    .map((log) => {
      const probPct = Math.round(log.probability * 100);
      const timeStr = formatTimeAgo(log.timestamp);
      return `
        <div class="log-item">
          <div class="log-header">
            <span class="log-domain">${escapeHtml(log.domain)}</span>
            <span class="log-prob">${probPct}% ad</span>
          </div>
          <div class="log-snippet">"${escapeHtml(log.snippet)}"</div>
          <div class="log-time">${timeStr}</div>
        </div>
      `;
    })
    .join('');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Updates UI based on loaded settings and stats.
 */
function renderUI(settings: UserSettings, stats: ExtensionStats, cooldown?: CooldownState): void {
  currentSettings = settings;

  // Toggles
  enabledToggle.checked = settings.isEnabled;
  badgeToggle.checked = settings.revealBadge;

  // Status pill
  if (settings.isEnabled) {
    statusPill.textContent = 'Active';
    statusPill.classList.remove('disabled');
  } else {
    statusPill.textContent = 'Paused';
    statusPill.classList.add('disabled');
  }

  // API Key
  if (settings.apiKey) {
    apiKeyInput.value = settings.apiKey;
  }

  // Threshold
  const pct = Math.round(settings.threshold * 100);
  thresholdSlider.value = pct.toString();
  thresholdValue.textContent = `${pct}%`;

  // Metrics
  const totalBlocked = stats.totalBlocked || 0;
  const totalEvaluated = stats.totalEvaluated || 0;
  const cacheHits = stats.cacheHits || 0;
  const apiCalls = stats.apiCalls || 0;

  statBlocked.textContent = totalBlocked.toLocaleString();
  statEvaluated.textContent = totalEvaluated.toLocaleString();
  statApiCalls.textContent = apiCalls.toLocaleString();

  const cacheEfficiency = totalEvaluated > 0 ? Math.round((cacheHits / totalEvaluated) * 100) : 0;
  statCacheHit.textContent = `${cacheEfficiency}%`;

  // Current domain stat
  const isWhitelisted = currentTabDomain ? currentSettings.whitelistedDomains.includes(currentTabDomain) : false;
  const domainBlocked = (currentTabDomain && stats.pageBlocked?.[currentTabDomain]) || 0;

  if (currentTabDomain) {
    currentDomainText.textContent = `${currentTabDomain}: ${domainBlocked} blocked`;
    currentDomainStatus.textContent = isWhitelisted ? '⏸️ Paused' : '🛡️ Protected';
  } else {
    currentDomainText.textContent = 'No active page';
    currentDomainStatus.textContent = '';
  }

  // Cooldown Banner
  if (cooldown && cooldown.active) {
    cooldownBanner.classList.add('visible');
    const remainingSeconds = Math.max(0, Math.round((cooldown.expiresAt - Date.now()) / 1000));
    cooldownReason.textContent = `${cooldown.reason || 'Cooldown'} (${remainingSeconds}s left)`;
  } else {
    cooldownBanner.classList.remove('visible');
  }

  // Whitelist Button
  updateWhitelistButton();

  // Logs
  renderLogs(stats.recentLogs);
}

/**
 * Updates the Whitelist button text for the current active tab.
 */
function updateWhitelistButton(): void {
  if (!currentTabDomain) {
    whitelistSiteBtn.style.display = 'none';
    return;
  }

  const isWhitelisted = currentSettings.whitelistedDomains.includes(currentTabDomain);
  if (isWhitelisted) {
    whitelistSiteBtn.textContent = `Resume on ${currentTabDomain}`;
  } else {
    whitelistSiteBtn.textContent = `Pause on ${currentTabDomain}`;
  }
}

/**
 * Saves updated settings through the background service worker.
 */
async function saveSettings(updated: Partial<UserSettings>): Promise<void> {
  const res = await chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    settings: updated,
  });
  if (res?.settings) {
    currentSettings = res.settings;
    const statsRes = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
    renderUI(currentSettings, statsRes || {});
  }
}

/**
 * Set up tab switching.
 */
function setupTabs(): void {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      if (!targetId) return;

      tabButtons.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetId)?.classList.add('active');
    });
  });
}

/**
 * Initializes the popup.
 */
async function init(): Promise<void> {
  setupTabs();

  // Query active tab domain
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.url) {
      const url = new URL(activeTab.url);
      if (url.protocol.startsWith('http')) {
        currentTabDomain = url.hostname;
      }
    }
  } catch (e) {
    console.debug('Failed to get active tab domain:', e);
  }

  // Fetch current state from background worker
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (response) {
      renderUI(response.settings, response.stats, response.cooldown);
    }
  } catch (err) {
    console.error('Failed to communicate with background service worker:', err);
  }

  // Event Listeners
  enabledToggle.addEventListener('change', () => {
    void saveSettings({ isEnabled: enabledToggle.checked });
  });

  badgeToggle.addEventListener('change', () => {
    void saveSettings({ revealBadge: badgeToggle.checked });
  });

  thresholdSlider.addEventListener('input', () => {
    thresholdValue.textContent = `${thresholdSlider.value}%`;
  });

  thresholdSlider.addEventListener('change', () => {
    const num = parseInt(thresholdSlider.value, 10) / 100;
    void saveSettings({ threshold: num });
  });

  saveKeyBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    saveKeyBtn.textContent = 'Saving...';
    await saveSettings({ apiKey: key });
    saveKeyBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveKeyBtn.textContent = 'Save';
    }, 1500);
  });

  whitelistSiteBtn.addEventListener('click', () => {
    if (!currentTabDomain) return;
    const exists = currentSettings.whitelistedDomains.includes(currentTabDomain);
    let newWhitelist: string[];
    if (exists) {
      newWhitelist = currentSettings.whitelistedDomains.filter((d) => d !== currentTabDomain);
    } else {
      newWhitelist = [...currentSettings.whitelistedDomains, currentTabDomain];
    }
    void saveSettings({ whitelistedDomains: newWhitelist });
  });

  clearCacheBtn?.addEventListener('click', async () => {
    clearCacheBtn.textContent = 'Clearing...';
    await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
    clearCacheBtn.textContent = 'Cache Cleared!';
    setTimeout(() => {
      clearCacheBtn.textContent = 'Clear Memory Cache';
    }, 1500);
  });

  clearStatsBtn?.addEventListener('click', async () => {
    if (confirm('Reset all Jev Shield stats and logs?')) {
      await chrome.runtime.sendMessage({ type: 'CLEAR_STATS' });
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response) {
        renderUI(response.settings, response.stats, response.cooldown);
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => void init());
