/** Versioned source material. Source prose is data, never executable HTML or instructions. */
export const ACADEMY_WIKI_ID = '3219c274-7df5-81a2-baeb-de4de645d487';
export const ACADEMY_WIKI_URL = 'https://app.notion.com/p/3219c2747df581a2baebde4de645d487';
export type AcademySource = 'notion' | 'help';
export type AcademyDocument = {
  id: string; source: AcademySource; title: string; url: string; text: string;
  sourceEditedAt: string | null; hash: string;
};
export type AcademySnapshot = {
  schema: 'academy-sources/v1'; source: AcademySource; fetchedAt: string;
  fullScanAt: string; documents: AcademyDocument[];
};
export type AcademySourceStatus = {
  source: AcademySource; configured: boolean; checkedAt: string | null;
  publishedAt: string | null; error: boolean; pending: boolean;
  version: string | null; documentCount: number;
};
export function validSourceUrl(source: AcademySource, input: string): boolean {
  try {
    const u = new URL(input);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      (source === 'help' ? u.hostname === 'help.adereso.ai' : ['www.notion.so', 'app.notion.com'].includes(u.hostname));
  } catch { return false; }
}
