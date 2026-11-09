export type CorporateAccessStep = 'email-code' | 'passkey';
export type CorporateAccessResult = { next: CorporateAccessStep };
const DEVICE_HINT = 'hub-sign-in-device-v1';
const MAX_AGE = 30 * 86_400_000;

/** Presentation hint only. Never authorizes access or substitutes for server MFA trust. */
export function knownSignInDevice(storage: Pick<Storage, 'getItem'>, now = Date.now()): boolean {
  try {
    const value = JSON.parse(storage.getItem(DEVICE_HINT) ?? 'null') as { version?: unknown; lastUsed?: unknown } | null;
    return value?.version === 1 && typeof value.lastUsed === 'number' && Number.isFinite(value.lastUsed) &&
      value.lastUsed <= now && now - value.lastUsed < MAX_AGE;
  } catch { return false; }
}

export function rememberSignInDevice(storage: Pick<Storage, 'setItem'>, now = Date.now()) {
  try { storage.setItem(DEVICE_HINT, JSON.stringify({ version: 1, lastUsed: now })); } catch { /* optional hint */ }
}
