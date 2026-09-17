/**
 * YouTube Main-World Scriptlet for Jev Shield.
 * Injected at `document_start` into the page's MAIN execution world.
 *
 * It:
 * 1. Prunes `adPlacements`, `playerAds`, and `adSlots` from YouTube's player configurations.
 * 2. Rapidly skips and accelerates in-stream ads (16x muted) without buffer-killing duration jumps.
 * 3. Dispatches comprehensive pointer and mouse event sequences to native skip buttons.
 */

(function () {
  function pruneAdData(target: any): any {
    if (!target || typeof target !== 'object') return target;

    if ('adPlacements' in target) {
      delete target.adPlacements;
    }
    if ('playerAds' in target) {
      delete target.playerAds;
    }
    if ('adSlots' in target) {
      delete target.adSlots;
    }

    return target;
  }

  // 1. Intercept ytInitialPlayerResponse global object
  let _initialResponse: any = undefined;
  try {
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      get() {
        return _initialResponse;
      },
      set(val) {
        _initialResponse = pruneAdData(val);
      },
      configurable: true,
      enumerable: true,
    });
  } catch {
    // Ignore if already frozen
  }

  // 2. Intercept window.fetch for dynamic player API calls (/youtubei/v1/player)
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = async function (...args: any[]) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      const response = await originalFetch.apply(this, args as any);

      if (typeof url === 'string' && url.includes('/youtubei/v1/player')) {
        try {
          const clone = response.clone();
          const data = await clone.json();
          pruneAdData(data);
          return new Response(JSON.stringify(data), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        } catch {
          return response;
        }
      }

      return response;
    };
  }

  // 3. Intercept JSON.parse for inline player responses
  const originalParse = JSON.parse;
  JSON.parse = function (...args: any[]) {
    const result = originalParse.apply(this, args as any);
    if (result && typeof result === 'object') {
      pruneAdData(result);
      if (result.playerResponse && typeof result.playerResponse === 'object') {
        pruneAdData(result.playerResponse);
      }
    }
    return result;
  };

  // 4. In-Stream Ad Monitor & Button Clicker (Main-World Execution)
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

  let wasMutedBeforeAd = false;
  let isAdActive = false;

  function handleInStreamAds(): void {
    const player = document.getElementById('movie_player');
    const isAd =
      (player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))) ||
      !!document.querySelector('.ytp-ad-player-overlay-layout__skip-or-preview-container, .ytp-ad-player-overlay');

    const video = document.querySelector('video') as HTMLVideoElement | null;

    if (isAd) {
      if (!isAdActive) {
        isAdActive = true;
        if (video) {
          wasMutedBeforeAd = video.muted;
        }
      }

      // 1. Dispatch full click event sequence to any available skip button
      const skipSelectors = [
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

      for (const selector of skipSelectors) {
        const btn = document.querySelector(selector) as HTMLElement | null;
        if (btn) {
          simulateClick(btn);
          break;
        }
      }

      // 2. Accelerate ad to 16x and mute (without seeking to duration, preventing black screen freeze)
      if (video) {
        if (!video.muted) {
          video.muted = true;
        }
        if (video.playbackRate < 16.0) {
          video.playbackRate = 16.0;
        }
      }

      // 3. Clean in-player promo overlays
      const overlays = document.querySelectorAll(
        '.ytp-ad-overlay-container, .ytp-ad-message-container, .ytp-ad-action-interstitial'
      );
      overlays.forEach((el) => {
        (el as HTMLElement).style.setProperty('display', 'none', 'important');
      });
    } else {
      if (isAdActive) {
        isAdActive = false;
        // Restore normal playback speed and audio once ad finishes
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

  // Run continuous check
  setInterval(handleInStreamAds, 50);
})();
