import { CandidateElement, CooldownState, EvaluationResult } from '../types';

const TYPESAFE_API_URL = 'https://api.typesafe.ai/v1/systemone';
const COOLDOWN_DURATION_MS = 2 * 60 * 1000; // 2-minute error back-off

/**
 * Checks if the API is currently under an active error back-off cooldown.
 */
export async function getCooldownState(): Promise<CooldownState> {
  try {
    const data = await chrome.storage.session.get('cooldownState');
    const state: CooldownState = data.cooldownState || { active: false, expiresAt: 0 };
    if (state.active && Date.now() >= state.expiresAt) {
      await chrome.storage.session.remove('cooldownState');
      return { active: false, expiresAt: 0 };
    }
    return state;
  } catch {
    return { active: false, expiresAt: 0 };
  }
}

/**
 * Sets an active error back-off cooldown in session storage.
 */
export async function setCooldownState(reason: string): Promise<void> {
  const state: CooldownState = {
    active: true,
    expiresAt: Date.now() + COOLDOWN_DURATION_MS,
    reason,
  };
  try {
    await chrome.storage.session.set({ cooldownState: state });
    console.warn(`[Jev Shield] API Cooldown activated for 2 minutes: ${reason}`);
  } catch (e) {
    console.error('[Jev Shield] Failed to persist cooldown state:', e);
  }
}

/**
 * Evaluates a batch of candidate elements using TypeSafe's Jev model.
 */
export async function evaluateBatchWithJev(
  candidates: CandidateElement[],
  apiKey: string,
  threshold: number
): Promise<EvaluationResult[]> {
  if (candidates.length === 0) return [];

  // 1. Check cooldown
  const cooldown = await getCooldownState();
  if (cooldown.active) {
    console.warn(`[Jev Shield] Skipping API call due to cooldown (${cooldown.reason}). Expires in ${Math.round((cooldown.expiresAt - Date.now()) / 1000)}s`);
    return candidates.map((c) => ({ id: c.id, isAd: false, probability: 0 }));
  }

  // 2. Validate API key
  if (!apiKey || apiKey.trim() === '') {
    console.warn('[Jev Shield] No TypeSafe API key configured. Enter your API key in the extension popup.');
    return candidates.map((c) => ({ id: c.id, isAd: false, probability: 0 }));
  }

  // 3. Build state and parallel noul questions map
  const statePayload: Record<string, { domain: string; snippet: string; links: string[] }> = {};
  const questionsPayload: Record<
    string,
    {
      type: 'noul';
      instructions: string;
      criteria: { true: string; false: string };
    }
  > = {};

  candidates.forEach((cand, idx) => {
    const qKey = `cand_${idx}`;
    statePayload[qKey] = {
      domain: cand.domain,
      snippet: cand.text,
      links: cand.hrefs,
    };
    questionsPayload[qKey] = {
      type: 'noul',
      instructions: `Is candidate item '${qKey}' an advertisement, sponsored promotion, affiliate product placement, or commercial marketing pitch?`,
      criteria: {
        true: 'Paid commercial advertisement, sponsored product placement, affiliate marketing card, or promotional marketing post.',
        false: 'Organic user-generated content, editorial article text, community discussion post, or standard website navigation.',
      },
    };
  });

  // 4. Send request to TypeSafe API
  try {
    const response = await fetch(TYPESAFE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: 'jev-latest',
        state: statePayload,
        questions: questionsPayload,
      }),
    });

    // Handle 401 or 429 error back-off
    if (response.status === 401) {
      await setCooldownState('HTTP 401: Invalid or unauthorized TypeSafe API key');
      return candidates.map((c) => ({ id: c.id, isAd: false, probability: 0 }));
    }

    if (response.status === 429) {
      await setCooldownState('HTTP 429: Rate limit exceeded on TypeSafe API');
      return candidates.map((c) => ({ id: c.id, isAd: false, probability: 0 }));
    }

    if (!response.ok) {
      console.error(`[Jev Shield] API Error: ${response.status} ${response.statusText}`);
      return candidates.map((c) => ({ id: c.id, isAd: false, probability: 0 }));
    }

    const json = await response.json();
    const answers = json.answers || {};

    // 5. Map answers back to Candidate results
    return candidates.map((cand, idx) => {
      const qKey = `cand_${idx}`;
      const answer = answers[qKey];
      const probability = typeof answer?.noul === 'number' ? answer.noul : 0;
      const isAd = probability >= threshold;

      return {
        id: cand.id,
        isAd,
        probability,
      };
    });
  } catch (error) {
    console.error('[Jev Shield] Network error communicating with TypeSafe API:', error);
    await setCooldownState('Network/Connection error');
    return candidates.map((c) => ({ id: c.id, isAd: false, probability: 0 }));
  }
}
