/**
 * YouTube Main-World Scriptlet for Jev Shield.
 * Injected at `document_start` into the page's MAIN execution world.
 *
 * It removes `adPlacements`, `playerAds`, and `adSlots` from YouTube's player
 * configurations before the video player initializes, preventing ads from being scheduled.
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
})();
