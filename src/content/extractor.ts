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
];

/**
 * Common selectors for feed cards, social items, and content containers.
 */
const CANDIDATE_SELECTORS = [
  'article',
  '[role="article"]',
  '[data-testid*="post"]',
  '[data-testid*="tweet"]',
  '[data-testid*="cell"]',
  'aside',
  'div[class*="sponsored" i]',
  'div[class*="promoted" i]',
  'div[class*="ad-" i]',
  'div[class*="-ad" i]',
  'div[id*="sponsored" i]',
  'div[id*="promoted" i]',
  'div[id*="google_ads" i]',
  'div[data-ad]',
  'div[data-ad-slot]',
  '.feed-item',
  '.stream-item',
  '.native-ad',
];

/**
 * Check if element passes bounding-box pre-filtering.
 * Prunes 1x1 tracking pixels, hidden analytics elements, tiny SVGs, and zero-dimension wrappers.
 */
export function isVisibleCandidateBox(el: HTMLElement): boolean {
  // Check CSS visibility and display
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }

  // Check bounding box dimensions
  const rect = el.getBoundingClientRect();
  if (rect.height <= 40 || rect.width <= 40) {
    return false;
  }

  return true;
}

/**
 * Determines if an element qualifies as a candidate for evaluation.
 */
export function isPotentialCandidate(el: HTMLElement): boolean {
  if (!isVisibleCandidateBox(el)) {
    return false;
  }

  // Avoid re-evaluating processed elements
  if (el.dataset.jevChecked === 'true' || el.dataset.jevAd === 'true') {
    return false;
  }

  // Ignore page-level root containers
  if (['BODY', 'HTML', 'MAIN', 'NAV', 'HEADER', 'FOOTER'].includes(el.tagName)) {
    return false;
  }

  const innerText = (el.innerText || '').trim();
  // Elements that are too short to judge or too massive (e.g. full feeds)
  if (innerText.length < 20 || innerText.length > 8000) {
    return false;
  }

  // Check for explicit promo/sponsored keyword matches in text or attributes
  const lowerText = innerText.toLowerCase();
  const hasPromoKeyword = PROMO_KEYWORDS.some((kw) => lowerText.includes(kw));

  const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
  const idName = (el.id || '').toLowerCase();
  const hasPromoClassOrId =
    className.includes('ad') ||
    className.includes('sponsor') ||
    className.includes('promot') ||
    idName.includes('ad') ||
    idName.includes('sponsor') ||
    idName.includes('promot');

  // Check for outbound links
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

  // Qualifies if it has a promo keyword, promo class/id, or matches candidate selectors with external links
  return hasPromoKeyword || hasPromoClassOrId || (hasExternalLink && el.matches(CANDIDATE_SELECTORS.join(',')));
}

/**
 * Extracts a candidate element into a structured payload for Jev evaluation.
 */
export function extractCandidate(el: HTMLElement): CandidateElement | null {
  if (!isPotentialCandidate(el)) {
    return null;
  }

  const rawText = (el.innerText || '').trim();
  // Normalize and trim whitespace, capping at 600 characters for token efficiency
  const cleanSnippet = rawText.replace(/\s+/g, ' ').slice(0, 600);

  const hrefs = Array.from(el.querySelectorAll('a'))
    .map((a) => a.href)
    .filter((h) => h.startsWith('http'))
    .slice(0, 3); // Max 3 links

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
 * Finds all candidate elements in the document or container.
 */
export function findCandidatesInContainer(container: ParentNode = document): { element: HTMLElement; candidate: CandidateElement }[] {
  const elements = Array.from(container.querySelectorAll(CANDIDATE_SELECTORS.join(','))) as HTMLElement[];
  const candidates: { element: HTMLElement; candidate: CandidateElement }[] = [];
  const seenIds = new Set<string>();

  for (const el of elements) {
    const candidate = extractCandidate(el);
    if (candidate && !seenIds.has(candidate.id)) {
      seenIds.add(candidate.id);
      candidates.push({ element: el, candidate });
    }
  }

  return candidates;
}
