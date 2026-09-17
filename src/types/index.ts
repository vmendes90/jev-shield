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

export interface BlockedLog {
  id: string;
  domain: string;
  snippet: string;
  probability: number;
  timestamp: number;
}

export interface ExtensionStats {
  totalEvaluated: number;
  totalBlocked: number;
  cacheHits: number;
  apiCalls: number;
  pageBlocked: Record<string, number>; // Domain -> count
  recentLogs: BlockedLog[];
}

export interface CooldownState {
  active: boolean;
  expiresAt: number;
  reason?: string;
}

export type ExtensionMessage =
  | { type: 'EVALUATE_CANDIDATES'; candidates: CandidateElement[] }
  | { type: 'GET_SETTINGS'; currentDomain?: string }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<UserSettings> }
  | { type: 'GET_STATS' }
  | { type: 'CLEAR_STATS' }
  | { type: 'CLEAR_CACHE' }
  | { type: 'RECORD_MANUAL_BLOCK'; domain: string; count?: number };
