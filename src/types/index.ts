export interface CandidateElement {
  id: string;
  text: string;
  domain: string;
  hrefs: string[];
  tag: string;
}

export interface EvaluationResult {
  id: string;
  isAd: boolean;
  probability: number;
}

export interface UserSettings {
  apiKey: string;
  threshold: number; // e.g. 0.80 - 0.99 (default: 0.85)
  isEnabled: boolean;
  revealBadge: boolean; // Show "Blocked by Jev" badge vs instant display:none
  whitelistedDomains: string[];
}

export interface ExtensionStats {
  totalEvaluated: number;
  totalBlocked: number;
}

export interface CooldownState {
  active: boolean;
  expiresAt: number;
  reason?: string;
}

export type ExtensionMessage =
  | { type: 'EVALUATE_CANDIDATES'; candidates: CandidateElement[] }
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<UserSettings> }
  | { type: 'GET_STATS' }
  | { type: 'INCREMENT_BLOCKED'; count: number };
