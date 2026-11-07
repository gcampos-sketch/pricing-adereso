/**
 * The OAuth server remembers a user's consent per client and silently re-approves
 * later authorizations, skipping our consent screen (and therefore the MFA-backed
 * grant). Any remembered consent without an active MFA grant must be revoked
 * before loading the authorization, so the user is shown the screen again.
 */
export function staleConsentClientIds(consentedClientIds: string[], activeGrantClientIds: string[]): string[] {
  const active = new Set(activeGrantClientIds);
  return [...new Set(consentedClientIds.filter(Boolean))].filter((id) => !active.has(id));
}
