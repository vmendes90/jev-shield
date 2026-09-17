/**
 * YouTube-specific protection module for Jev Shield.
 * Handles:
 * 1. In-stream video ad skipping and muting (without hiding the video player).
 * 2. Native feed and sidebar ad-slot collapsing.
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

    // 1. Try to click any available skip button
    const skipButtons = [
      '.ytp-skip-ad-button',
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-modern',
      'button.ytp-ad-skip-button-text',
      '.ytp-ad-overlay-close-button',
    ];

    for (const selector of skipButtons) {
      const btn = document.querySelector(selector) as HTMLElement | null;
      if (btn && btn.offsetParent !== null) {
        btn.click();
        return;
      }
    }

    // 2. If skip button isn't clickable yet, speed up and mute the ad video
    // IMPORTANT: NEVER set `video.currentTime = video.duration` because on YouTube,
    // video.duration is the full length of the 20+ minute main video, which seeks to the
    // end of the video and causes an infinite buffer stall!
    if (video) {
      if (!video.muted) {
        video.muted = true;
      }
      if (video.playbackRate < 8.0) {
        video.playbackRate = 8.0;
      }
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
        if (!wasMutedBeforeAd) {
          video.muted = false;
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
  }, 250);
}
