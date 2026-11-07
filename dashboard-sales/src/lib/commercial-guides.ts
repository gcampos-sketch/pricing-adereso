/** Source IDs are fixed; browser input never chooses a workspace page. */
export const COMMERCIAL_GUIDES = {
  playbook: { id: '31d9c274-7df5-81e7-bec7-cfea5d224070', title: 'Playbook comercial' },
  operativa: { id: '31c9c274-7df5-81d9-8825-fcaaff9823b7', title: 'Operativa comercial' },
} as const;
export type CommercialGuide = keyof typeof COMMERCIAL_GUIDES;
export function isCommercialGuide(value: unknown): value is CommercialGuide { return value === 'playbook' || value === 'operativa'; }
export type GuideText = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; code?: boolean; href?: string };
export type GuideBlock = { id: string; type: string; text: GuideText[]; children: GuideBlock[]; cells?: GuideText[][]; checked?: boolean; url?: string };
export type GuideDocument = { id: string; title: string; url: string; sourceEditedAt: string | null; hash: string; blocks: GuideBlock[] };
export type GuideSnapshot = { schema: 'academy-sources/v1'; source: CommercialGuide; fetchedAt: string; documents: GuideDocument[] };
export function safeGuideUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try { const u = new URL(value); if (u.protocol === 'https:' && !u.username && !u.password) return u.href; } catch { /* plain text only */ }
  return undefined;
}
