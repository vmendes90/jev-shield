/**
 * YouTube Main-World Scriptlet for Jev Shield.
 * Injected at `document_start` into the page's MAIN execution world.
 *
 * It:
 * 1. Prunes `adPlacements`, `playerAds`, and `adSlots` from YouTube's player configurations.
 * 2. Continuously detects in-stream video ads, dispatches full pointer/mouse event sequences
 *    to skip buttons, accelerates ad playback to 16x, and triggers the 'ended' event.
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

  function handleInStreamAds(): void {
    const player = document.getElementById('movie_player');
    const isAd =
      (player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))) ||
      !!document.querySelector('.ytp-ad-player-overlay-layout__skip-or-preview-container, .ytp-ad-player-overlay');

    const video = document.querySelector('video') as HTMLVideoElement | null;

    if (isAd) {
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

      // 2. Accelerate ad to 16x, mute, and dispatch 'ended'
      if (video) {
        video.muted = true;
        video.playbackRate = 16.0;

        // If duration is an ad (< 180s), skip to the end
        if (!isNaN(video.duration) && isFinite(video.duration) && video.duration > 0 && video.duration < 180) {
          video.currentTime = video.duration;
        }
        video.dispatchEvent(new Event('ended'));
      }
    } else {
      // Restore normal playback speed once ad is over
      if (video && video.playbackRate > 1.0) {
        video.playbackRate = 1.0;
        if (video.muted) {
          video.muted = false;
        }
        if (video.paused) {
          video.play().catch(() => {});
        }
      }
    }
  }

  // Run at 50ms intervals in the main world for instantaneous skip
  setInterval(handleInStreamAds, 50);
})();
