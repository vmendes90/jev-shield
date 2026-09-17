/**
 * YouTube-specific protection module for Jev Shield.
 * Handles:
 * 1. In-stream video ad skipping and muting (without hiding the video player).
 * 2. Instant 'ended' event dispatching for unskippable ads.
 * 3. Native feed and sidebar ad-slot collapsing.
 */

let wasMutedBeforeAd = false;
let isAdHandlingActive = false;

/**
 * Handle in-stream video ads on YouTube (pre-roll, mid-roll).
 */
export function handleYouTubeInStreamAds(): void {
  const player = document.querySelector('#movie_player') as HTMLElement | null;
  if (!player) return;

  const isAdShowing =
    player.classList.contains('ad-showing') ||
    player.classList.contains('ad-interrupting');

  const video = player.querySelector('video') as HTMLVideoElement | null;

  if (isAdShowing) {
    if (!isAdHandlingActive) {
      isAdHandlingActive = true;
      if (video) {
        wasMutedBeforeAd = video.muted;
      }
    }

    // 1. Click any available skip button immediately
    const skipButtons = [
      '.ytp-skip-ad-button',
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-modern',
      'button.ytp-ad-skip-button-text',
      '.ytp-ad-skip-button-container button',
      '.ytp-ad-overlay-close-button',
      '[id^="skip-button:"] button',
    ];

    for (const selector of skipButtons) {
      const btn = document.querySelector(selector) as HTMLElement | null;
      if (btn && btn.offsetParent !== null) {
        btn.click();
        return;
      }
    }

    // 2. Fast-forward the ad and trigger 'ended' event immediately
    if (video) {
      if (!video.muted) {
        video.muted = true;
      }

      // Only seek if video.duration represents the ad (under 3 minutes)
      // Never jump if duration is > 180s (which means it's the main video!)
      if (!isNaN(video.duration) && isFinite(video.duration) && video.duration > 0 && video.duration < 180) {
        video.currentTime = video.duration;
      }

      // Dispatch 'ended' event to inform YouTube's player that the ad is complete
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
        // If YouTube paused the video during the ad transition, auto-resume playback
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
    // Find enclosing feed card or sidebar item to prevent empty gaps
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

  // Run periodic check for video ad transitions
  setInterval(() => {
    handleYouTubeInStreamAds();
    removeYouTubeFeedAds();
  }, 100);
}
