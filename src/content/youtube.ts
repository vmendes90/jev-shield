/**
 * YouTube-specific protection module for Jev Shield.
 * Handles:
 * 1. In-stream video ad skipping with full mouse/pointer simulation.
 * 2. Instant 16x acceleration and 'ended' event dispatching for unskippable ads.
 * 3. Native feed and sidebar ad-slot collapsing.
 */

let wasMutedBeforeAd = false;
let isAdHandlingActive = false;

function simulateClick(element: HTMLElement): void {
  const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
  events.forEach((eventType) => {
    const MouseOrPointer = eventType.startsWith('pointer') ? PointerEvent : MouseEvent;
    const ev = new MouseOrPointer(eventType, {
      bubbles: true,
      cancelable: true,
      view: window,
      buttons: 1,
    });
    element.dispatchEvent(ev);
  });
  element.click();
}

/**
 * Handle in-stream video ads on YouTube (pre-roll, mid-roll).
 */
export function handleYouTubeInStreamAds(): void {
  const player = document.querySelector('#movie_player') as HTMLElement | null;
  const isAdShowing =
    (player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))) ||
    !!document.querySelector('.ytp-ad-player-overlay-layout__skip-or-preview-container, .ytp-ad-player-overlay');

  const video = (player ? player.querySelector('video') : document.querySelector('video')) as HTMLVideoElement | null;

  if (isAdShowing) {
    if (!isAdHandlingActive) {
      isAdHandlingActive = true;
      if (video) {
        wasMutedBeforeAd = video.muted;
      }
    }

    // 1. Click any available skip button immediately with full event sequence
    const skipButtons = [
      '.ytp-skip-ad-button',
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-modern',
      '[id^="skip-button:"]',
      '[id^="skip-button:"] button',
      '.ytp-ad-skip-button-slot button',
      'button.ytp-ad-skip-button-text',
      '.ytp-ad-overlay-close-button',
      'button[class*="skip"]',
    ];

    for (const selector of skipButtons) {
      const btn = document.querySelector(selector) as HTMLElement | null;
      if (btn) {
        simulateClick(btn);
        break;
      }
    }

    // 2. Accelerate ad, mute audio, and dispatch 'ended' event
    if (video) {
      video.muted = true;
      video.playbackRate = 16.0;

      if (!isNaN(video.duration) && isFinite(video.duration) && video.duration > 0 && video.duration < 180) {
        video.currentTime = video.duration;
      }
      video.dispatchEvent(new Event('ended'));
    }

    // 3. Hide floating ad overlays inside player without hiding the player itself
    const adOverlays = document.querySelectorAll(
      '.ytp-ad-overlay-container, .ytp-ad-message-container, .ytp-ad-action-interstitial, .ytp-ad-survey'
    );
    adOverlays.forEach((el) => {
      (el as HTMLElement).style.setProperty('display', 'none', 'important');
    });
  } else {
    // Ad finished or not showing
    if (isAdHandlingActive) {
      isAdHandlingActive = false;
      if (video) {
        video.playbackRate = 1.0;
        if (!wasMutedBeforeAd && video.muted) {
          video.muted = false;
        }
        if (video.paused) {
          video.play().catch(() => {});
        }
      }
    }
  }
}

/**
 * Collapses YouTube native feed ads and sidebar promotions.
 */
export function removeYouTubeFeedAds(): void {
  const adElements = document.querySelectorAll(
    'ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-sparkles-web-renderer, ytd-banner-promo-renderer, ytd-statement-banner-renderer, #masthead-ad'
  );

  adElements.forEach((el) => {
    const item = el as HTMLElement;
    const parentCard = (item.closest('ytd-rich-item-renderer, ytd-compact-video-renderer') || item) as HTMLElement;
    if (parentCard.style.display !== 'none') {
      parentCard.style.setProperty('display', 'none', 'important');
    }
  });
}

/**
 * Starts continuous YouTube protection.
 */
export function startYouTubeProtector(): void {
  if (!window.location.hostname.includes('youtube.com')) return;

  // Run periodic check for video ad transitions at 50ms interval
  setInterval(() => {
    handleYouTubeInStreamAds();
    removeYouTubeFeedAds();
  }, 50);
}
