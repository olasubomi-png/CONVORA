/**
 * Authoritative trial duration for all CONVORA organizations.
 * Server-side only — never accept client-supplied trial length.
 */
export const TRIAL_DURATION_DAYS = 90;

export const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;
