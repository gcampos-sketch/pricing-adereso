import type { DealDTO } from './pulse-types';
import { quotaStats } from './quota-eligibility';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[_\s-]+/g, ' ');
const types = [
  { key: 'opportunity', label: 'Oportunidad · Venta nueva', color: '#88afff' },
  { key: 'upsell', label: 'Upsell', color: '#c4a1ff' },
  { key: 'cross', label: 'Cross sell', color: '#65d6b1' },
  { key: 'unknown', label: 'Tipo sin identificar', color: '#9299a8' },
];
const sources = [
  { key: 'outbound', label: 'Outbound', color: '#f0c66d' },
  { key: 'inbound', label: 'Inbound', color: '#75d5df' },
  { key: 'cs', label: 'Oportunidad desde CS', color: '#a6a0ed' },
  { key: 'kam', label: 'Oportunidad desde KAM', color: '#83c7a1' },
  { key: 'other', label: 'Otras fuentes', color: '#a6aabd' },
  { key: 'unknown', label: 'Sin fuente registrada', color: '#747d8d' },
];

export function wonBusinessType(deal: Pick<DealDTO, 'dealType' | 'segment'>) {
  const type = normalize(deal.dealType ?? '');
  if (['newbusiness', 'new business', 'oportunidad', 'venta nueva', 'nuevo'].includes(type)) return 'opportunity';
  if (type === 'upsell' || type.startsWith('upsell ')) return 'upsell';
  if (['cross sell', 'crosssell'].includes(type) || type.startsWith('cross sell ')) return 'cross';
  // Older snapshots may omit dealtype; only explicit expansion segments attest a type.
  if (deal.dealType === undefined) {
    if (normalize(deal.segment) === 'upsell') return 'upsell';
    if (normalize(deal.segment) === 'cross sell') return 'cross';
  }
  return 'unknown';
}

export function wonAcquisitionSource(deal: Pick<DealDTO, 'source'>) {
  const source = normalize(deal.source ?? '');
  if (!source) return 'unknown';
  if (['prospeccion sdr', 'prospeccion sdr adereso', 'prospeccion sdr [adereso]'].includes(source)) return 'outbound';
  if (['form de contacto inbound', 'form de contacto inbound adereso', 'form de contacto inbound [adereso]'].includes(source)) return 'inbound';
  if (source === 'customer success') return 'cs';
  if (['kam adereso', 'kam adereso recuperacion'].includes(source)) return 'kam';
  return 'other';
}

export type WonDistributionRow = { key: string; label: string; color: string; mrr: number; count: number; mrrShare: number | null; countShare: number; deals: DealDTO[] };

/** Same eligible won universe as the card, constrained again to the selected close periods. */
export function wonDistribution(deals: DealDTO[], periods: string[]) {
  const selected = new Set(periods);
  const scoped = quotaStats(deals).eligible.filter(deal => {
    const date = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(deal.closeDateValue ?? '');
    if (!date || !Number.isFinite(Date.parse(deal.closeDateValue))) return false;
    const month = Number(date[2]);
    return month >= 1 && month <= 12 && selected.has(`${date[1]}-Q${Math.ceil(month / 3)}`);
  });
  const totalMrr = scoped.reduce((sum, deal) => sum + (deal.amountValue || 0), 0);
  const group = (definitions: typeof types, classify: (deal: DealDTO) => string): WonDistributionRow[] => definitions.map(definition => {
    const rows = scoped.filter(deal => classify(deal) === definition.key);
    const mrr = rows.reduce((sum, deal) => sum + (deal.amountValue || 0), 0);
    return { ...definition, mrr, count: rows.length, mrrShare: totalMrr > 0 ? mrr / totalMrr * 100 : null, countShare: scoped.length ? rows.length / scoped.length * 100 : 0, deals: [...rows].sort((a, b) => (b.amountValue || 0) - (a.amountValue || 0) || a.name.localeCompare(b.name)) };
  });
  return { totalMrr, count: scoped.length, deals: scoped, types: group(types, wonBusinessType), sources: group(sources, wonAcquisitionSource) };
}

export function wonOwnerBreakdown(deals: DealDTO[], quotas: Record<string, number>) {
  const owners = new Map<string, { owner: string; mrr: number; count: number }>();
  for (const deal of new Map(deals.map(deal => [deal.id, deal])).values()) {
    const owner = deal.owner || 'Sin comercial';
    const row = owners.get(owner) ?? { owner, mrr: 0, count: 0 };
    row.mrr += deal.amountValue || 0;
    row.count++;
    owners.set(owner, row);
  }
  return [...owners.values()].sort((a, b) => b.mrr - a.mrr || a.owner.localeCompare(b.owner)).map(row => {
    const quota = quotas[row.owner] ?? 0;
    return { ...row, quota, attainment: quota > 0 ? row.mrr / quota * 100 : null };
  });
}
