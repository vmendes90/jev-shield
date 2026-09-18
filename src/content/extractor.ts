import { CandidateElement } from '../types';

/**
 * Fast deterministic string hash (FNV-1a 32-bit).
 * Keeps hashes compact and uniform for storage.session caching.
 */
export function hashString(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Keywords and signals that indicate potential promotional content.
 */
const PROMO_KEYWORDS = [
  'sponsored',
  'promoted',
  'advertisement',
  'paid partnership',
  'promoted by',
  'recommended by',
  'suggested for you',
  'partner content',
  'brand partner',
  'affiliate link',
  'want fewer ads',
  'get grow today',
  'grow today',
  'fewer ads like this',
];

/**
 * Safe class & id token matching regex.
 * Avoids matching 'header', 'loader', 'download', 'broad', etc.
 */
const PROMO_TOKEN_REGEX = /(^|[-_ ])(ad|ads|advertisement|advertising|sponsored|promoted|sponsor|mediavine|grow)([-_ ]|$)/i;

/**
 * Common selectors for feed cards, social items, and content containers.
 * Evaluated semantically via TypeSafe Jev.
 */
const CANDIDATE_SELECTORS = [
  'article',
  '[role="article"]',
  '[data-testid*="post"]',
  '[data-testid*="tweet"]',
  '[data-testid*="cell"]',
  'aside',
  'ytd-ad-slot-renderer',
  'ytd-in-feed-ad-layout-renderer',
  'ytd-promoted-sparkles-web-renderer',
  'ytd-banner-promo-renderer',
  '#masthead-ad',
  'div[class*="sponsored" i]',
  'div[class*="promoted" i]',
  'div[id*="sponsored" i]',
  'div[id*="promoted" i]',
  'div[id*="google_ads" i]',
  'div[data-ad-slot]',
  'div[class*="card" i]',
  'div[class*="feed-item" i]',
  'div[class*="stream-item" i]',
  'div[class*="recommended" i]',
  'div[class*="suggestion" i]',
  'div[class*="widget" i]',
  'div[class*="taboola" i]',
  'div[class*="outbrain" i]',
  'div[class*="revcontent" i]',
  'div[class*="grow" i]',
  'div[id*="grow" i]',
  'div[class*="mediavine" i]',
  'div[id*="mediavine" i]',
  'div[class*="sticky" i]',
  'div[class*="anchor" i]',
  '.feed-item',
  '.stream-item',
  '.native-ad',
];

/**
 * Selectors for legacy banner ads, third-party iframe containers, Google AdSense, and pop-up slots.
 */
export const DISPLAY_AD_SELECTORS = [
  'ins.adsbygoogle',
  'div[id^="google_ads"]',
  'div[id*="ad-slot" i]',
  'div[id*="ad_slot" i]',
  'div[id*="ad_unit" i]',
  'div[id*="advert" i]',
  'div[class*="ad-banner" i]',
  'div[class*="banner-ad" i]',
  'div[class*="ad_container" i]',
  'div[class*="ad-container" i]',
  'div[class*="ad-wrapper" i]',
  'div[class*="code-block" i]',
  'div[class*="adbox" i]',
  'div[class*="ad-box" i]',
  'div[class*="ads-holder" i]',
  'div[class*="advertisement" i]',
  // Mediavine & Grow
  'div[id*="mediavine" i]',
  'div[class*="mediavine" i]',
  '[data-mediavine]',
  'div[id^="mv-"]',
  'div[class*="mv-" i]',
  '.mv-ad-box',
  '.mv-sticky-footer',
  'grow-widget',
  'div[data-grow-widget]',
  'div[data-grow-banner]',
  'div[id*="grow-" i]',
  'div[class*="grow-" i]',
  '#mediavine-settings',
  // Sticky & Floating Anchor Ads
  'div[class*="sticky-ad" i]',
  'div[class*="sticky-footer-ad" i]',
  'div[class*="anchor-ad" i]',
  'div[class*="ad-anchor" i]',
  'div[id*="sticky-ad" i]',
  'div[id*="anchor-ad" i]',
  // Ezoic & Raptive / AdThrive
  'div[class*="ezoic-ad" i]',
  'div[id*="ezoic-pub-ad" i]',
  'div[class*="adthrive" i]',
  'div[id*="adthrive" i]',
  // Ad iframes
  'iframe[id*="__clb-"]',
  'iframe[src*="ad"]',
  'iframe[src*="doubleclick"]',
  'iframe[src*="syndication"]',
  'iframe[src*="mediavine"]',
  'iframe[src*="grow.me"]',
  'iframe[src*="scriptwrapper"]',
  'iframe[id*="ad-" i]',
  'iframe[id*="ad_" i]',
  'iframe[class*="ad-" i]',
  '[data-ad-client]',
  '[data-ad-slot]',
  '[data-ad-format]',
  '.ad-placement',
  '.advertisement-container',
  '#carbonads',
];

/**
 * Safeguard: checks if an element is a media player, video, audio, or player shell.
 * Media players must NEVER be evaluated or collapsed by the content blocker.
 */
export function isMediaOrPlayerElement(el: HTMLElement): boolean {
  if (!el) return false;

  // 1. Contains or is a direct video/audio element
  if (
    el.tagName === 'VIDEO' ||
    el.tagName === 'AUDIO' ||
    el.querySelector('video, audio') !== null
  ) {
    return true;
  }

  // 2. Known video player shells across YouTube and video sites
  const tag = el.tagName.toUpperCase();
  if (
    tag === 'YTD-PLAYER' ||
    ['movie_player', 'player', 'player-container', 'error-screen'].includes(el.id)
  ) {
    return true;
  }

  if (
    el.closest(
      '#movie_player, ytd-player, #player, #player-container, .html5-video-player, .video-stream'
    ) !== null
  ) {
    return true;
  }

  return false;
}

/**
 * Check if element passes bounding-box pre-filtering.
 * Prunes 1x1 tracking pixels, hidden analytics elements, tiny SVGs, and zero-dimension wrappers.
 */
export function isVisibleCandidateBox(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }

  const rect = el.getBoundingClientRect();
  if (rect.height <= 40 || rect.width <= 40) {
    return false;
  }

  return true;
}

/**
 * Determines if an element qualifies as a candidate for evaluation.
 */
export function isPotentialCandidate(el: HTMLElement, deepScan = false): boolean {
  if (isMediaOrPlayerElement(el)) {
    return false;
  }

  if (!isVisibleCandidateBox(el)) {
    return false;
  }

  if (el.dataset.jevChecked === 'true' || el.dataset.jevAd === 'true') {
    return false;
  }

  if (['BODY', 'HTML', 'MAIN', 'NAV', 'HEADER', 'FOOTER'].includes(el.tagName)) {
    return false;
  }

  const innerText = (el.innerText || '').trim();
  // Relaxed threshold: at least 10 chars (e.g. "Promoted by", short sponsored blurbs)
  if (innerText.length < 10 || innerText.length > 8000) {
    return false;
  }

  // When Deep AI Scan is enabled, evaluate all candidate cards, recommendations, and feed items directly
  if (deepScan) {
    return el.matches(CANDIDATE_SELECTORS.join(','));
  }

  const lowerText = innerText.toLowerCase();
  const hasPromoKeyword = PROMO_KEYWORDS.some((kw) => lowerText.includes(kw));

  const className = typeof el.className === 'string' ? el.className : '';
  const idName = el.id || '';
  const hasPromoClassOrId = PROMO_TOKEN_REGEX.test(className) || PROMO_TOKEN_REGEX.test(idName);

  const links = Array.from(el.querySelectorAll('a'))
    .map((a) => a.href)
    .filter((href) => href && href.startsWith('http'));

  const currentDomain = window.location.hostname;
  const hasExternalLink = links.some((href) => {
    try {
      const url = new URL(href);
      return url.hostname !== currentDomain && !url.hostname.endsWith('.' + currentDomain);
    } catch {
      return false;
    }
  });

  const isRecommendationWidget = el.matches(
    'div[class*="recommended" i], div[class*="suggestion" i], div[class*="taboola" i], div[class*="outbrain" i], div[class*="revcontent" i]'
  );

  return (
    hasPromoKeyword ||
    hasPromoClassOrId ||
    isRecommendationWidget ||
    (hasExternalLink && el.matches(CANDIDATE_SELECTORS.join(',')))
  );
}

/**
 * Extracts a candidate element into a structured payload for Jev evaluation.
 */
export function extractCandidate(el: HTMLElement, deepScan = false): CandidateElement | null {
  if (!isPotentialCandidate(el, deepScan)) {
    return null;
  }

  const rawText = (el.innerText || '').trim();
  const cleanSnippet = rawText.replace(/\s+/g, ' ').slice(0, 600);

  const hrefs = Array.from(el.querySelectorAll('a'))
    .map((a) => a.href)
    .filter((h) => h.startsWith('http'))
    .slice(0, 3);

  const hashPayload = `${window.location.hostname}|${cleanSnippet}`;
  const id = hashString(hashPayload);

  return {
    id,
    text: cleanSnippet,
    domain: window.location.hostname,
    hrefs,
    tag: el.tagName.toLowerCase(),
  };
}

/**
 * Finds all candidate elements in the document or container for TypeSafe semantic evaluation.
 */
export function findCandidatesInContainer(
  container: ParentNode = document,
  deepScan = false
): { element: HTMLElement; candidate: CandidateElement }[] {
  const elements = Array.from(container.querySelectorAll(CANDIDATE_SELECTORS.join(','))) as HTMLElement[];
  const candidates: { element: HTMLElement; candidate: CandidateElement }[] = [];
  const seenIds = new Set<string>();

  for (const el of elements) {
    const candidate = extractCandidate(el, deepScan);
    if (candidate && !seenIds.has(candidate.id)) {
      seenIds.add(candidate.id);
      candidates.push({ element: el, candidate });
    }
  }

  return candidates;
}

/**
 * Finds all traditional display banner ad elements, iframes, and code blocks.
 */
export function findDisplayAdElements(container: ParentNode = document): HTMLElement[] {
  const elements = Array.from(container.querySelectorAll(DISPLAY_AD_SELECTORS.join(','))) as HTMLElement[];
  return elements.filter((el) => !isMediaOrPlayerElement(el) && el.dataset.jevChecked !== 'true');
}
