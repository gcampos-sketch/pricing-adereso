import type { InsightDeal } from './insights-types';

/** Native fuente_de_creacion only; never infer source from deal type or segment. */
export const lossCreationSource = (deal: Pick<InsightDeal, 'source' | 'sourceLabel'>): string =>
  (deal.source ?? deal.sourceLabel ?? '').trim() || 'Sin fuente';

export function scopeLossCreationSource<T extends Pick<InsightDeal, 'source' | 'sourceLabel'>>(deals: T[], source: string): T[] {
  return source === '' ? deals : deals.filter(deal => lossCreationSource(deal) === source);
}

export type LossCreationSourceOption = { value: string; label: string; group: string };
// Native fuente_de_creacion order/labels verified in portal 23480943 on 2026-11-18.
// Visual groups only separate consecutive options; values never merge or move.
const SOURCE_GROUPS: [string, (string | [string, string])[]][] = [
  ['Captación', [['Form de Contacto Inbound', 'Form de Contacto Inbound Adereso'], ['Prospección SDR', 'Prospección SDR Adereso'], 'Form de Contacto Inbound Cassper', 'Prospección SDR Cassper']],
  ['Ejecutivos comerciales', [['Account Exec', 'AE Adereso'], 'AE Adereso - Recuperación', 'AE Cassper', 'AE Cassper - Recuperación']],
  ['KAM', [['KAM', 'KAM Adereso'], 'KAM Adereso - Recuperación', 'KAM Cassper', 'KAM Cassper - Recuperación']],
  ['Customer Success', [['Customer Success', 'CS Adereso'], 'CS Cassper']],
  ['Referidos y alianzas', ['Candidato partner', 'Referido por colaborador Adereso', 'Referido por partner']],
  ['Marketing y eventos', ['Webinar / Ebook', 'Evento WBL Retail Agosto', 'CX Day Stgo (7/25)', 'CX Day Colombia (12/11)', 'Desayuno Utilities Nov.']],
  ['Partners', ['Partner Sixbell', 'Partner Converza', 'Partner ITNG', 'Partner BiBB', 'Partner Gaurum', 'Partner Glow', 'Partner Solem', 'Partner Wise Data', 'Partner Starmice']],
  ['Otras fuentes', ['Webinar', 'RRSS Orgánico', 'CX Day Colombia', 'Evento de MKT', 'Evento WBL (20/8)', ['Referal', 'Referral']]],
];

export function lossCreationSources(deals: InsightDeal[]): LossCreationSourceOption[] {
  const available = new Set(deals.filter(deal => deal.status === 'lost').map(lossCreationSource));
  const ordered = SOURCE_GROUPS.flatMap(([group, options]) => options.map(option => {
    const [value, label] = typeof option === 'string' ? [option, option] : option;
    return { value, label, group };
  })).filter(option => available.delete(option.value));
  const unknown = [...available].filter(value => value !== 'Sin fuente').sort((a, b) => a.localeCompare(b, 'es'));
  return [...ordered, ...unknown.map(value => ({ value, label: value, group: 'Otras fuentes registradas' })),
    ...(available.has('Sin fuente') ? [{ value: 'Sin fuente', label: 'Sin fuente', group: 'Sin información' }] : [])];
}
