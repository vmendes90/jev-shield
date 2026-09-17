import { CooldownState, ExtensionStats, UserSettings } from '../types';

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
const statEvaluated = document.getElementById('statEvaluated') as HTMLElement;
const statBlocked = document.getElementById('statBlocked') as HTMLElement;
const whitelistSiteBtn = document.getElementById('whitelistSiteBtn') as HTMLButtonElement;
const cooldownBanner = document.getElementById('cooldownBanner') as HTMLElement;
const cooldownReason = document.getElementById('cooldownReason') as HTMLElement;

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

  // Stats
  statEvaluated.textContent = (stats.totalEvaluated || 0).toLocaleString();
  statBlocked.textContent = (stats.totalBlocked || 0).toLocaleString();

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
    renderUI(currentSettings, {
      totalEvaluated: parseInt(statEvaluated.textContent || '0', 10),
      totalBlocked: parseInt(statBlocked.textContent || '0', 10),
    });
  }
}

/**
 * Initializes the popup.
 */
async function init(): Promise<void> {
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
}

document.addEventListener('DOMContentLoaded', () => void init());
