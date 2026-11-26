import { WON_STAGES } from './commercial-outcomes';
import { currentMonthKey } from './deal-month-summary';
import { isSdrProspectingSource } from './deal-segment';
import type { Props } from './hubspot.server';

export const SDR_PIPELINE = '701738377';
export const SDR_STAGES = {
  '1307029105': 'Prospección ABM',
  '1025498163': 'Reunión agendada',
  '1300101807': 'No show 1',
  '1300101808': 'Reunión reagendada',
  '1300101809': 'No show 2',
  '1300101810': 'Reunión concretada SDR',
  '1301196893': 'Lead en espera',
  '1300101811': 'Lead perdido',
} as const;
export const SALES_STAGES = {
  '1144383754': 'E0 Oportunidad expansión',
  '171385863': 'E1 Reunión comercial',
  '171385864': 'E2 Requerimientos',
  '173996363': 'E3 Propuesta técnica',
  '1181334581': 'E3.1 Cotización SP',
  '171385866': 'E4 Valorizado',
  '171385867': 'E5 Negociación',
  '1245768029': 'E5.1 PoC / demo',
  '174677684': 'E6 Firma',
  '1278792585': 'E6.1 Warning',
  '1086544542': 'E6.2 Desarrollo',
  '213244763': 'E6.3 Piloto',
  '171385868': 'E7 Marcha blanca',
  '173990327': 'E8 Servicio iniciado',
  '171385869': 'Deal perdido',
  '1372234925': 'Perdido en desarrollo',
  '213417520': 'Piloto perdido',
  '178228041': 'Churn',
} as const;
export const STAGES = { ...SDR_STAGES, ...SALES_STAGES };
export type StageId = keyof typeof STAGES;
export type Motion = 'Inbound' | 'Outbound' | 'Sin clasificar';
export type View = 'all' | Motion;
export const isProspectingCandidate = (deal: Pick<PipelineDeal, 'motion' | 'source'>) =>
  deal.motion === 'Sin clasificar' && isSdrProspectingSource(deal.source);

export type RouteDetail = 'summary' | 'sdr' | 'sales' | 'activation';

export type CreativeMetadata = { name: string; format: string };
export type PipelineDeal = {
  id: string;
  name: string;
  stage: string;
  commercial: boolean;
  createdAt: string;
  entries: Partial<Record<StageId, string>>;
  motion: Motion;
  segment: string;
  source: string;
  sourceLabel: string;
  industry: string;
  dealType: string;
  role: string;
  campaign: string;
  adId: string | null;
  creative?: CreativeMetadata;
  contactRead: boolean;
};
export type PipelineReport = { deals: PipelineDeal[]; readAt: string; undated: number; creativeCatalogStatus?: 'missing' | 'ready' | 'invalid' };

export function nativeTime(value: string | null | undefined) {
  if (!value?.trim()) return NaN;
  return /^\d{13}$/.test(value) ? Number(value) : Date.parse(value);
}

export function creationPeriod(value: string | null | undefined, now: number) {
  const timestamp = nativeTime(value);
  if (!Number.isFinite(timestamp) || timestamp > now) return null;
  const month = currentMonthKey(timestamp);
  return `${month.slice(0, 4)}-Q${Math.ceil(Number(month.slice(5)) / 3)}`;
}

type LinkedContact = { id: string; properties: Props; labels: string[] };

/** First tracked Meta visit of a directly associated contact, once per deal. */
export function trackedMetaAd(contacts: LinkedContact[], createdAt: string | null | undefined) {
  const created = nativeTime(createdAt);
  if (!Number.isFinite(created)) return null;
  const candidates = contacts.flatMap(contact => {
    const p = contact.properties;
    const visited = nativeTime(p['hs_analytics_first_visit_timestamp'] || p['hs_analytics_first_timestamp']);
    if (!Number.isFinite(visited) || visited > created || !p['hs_analytics_first_url']) return [];
    let url: URL;
    try { url = new URL(p['hs_analytics_first_url']); } catch { return []; }
    const networks = ['facebook', 'instagram', 'fb', 'ig', 'meta'];
    const network = (url.searchParams.get('hsa_net') || url.searchParams.get('utm_source'))?.toLowerCase();
    const [id, ...duplicates] = url.searchParams.getAll('hsa_ad');
    if (!network || !networks.includes(network) || !id || !/^\d+$/.test(id) || duplicates.some(value => value !== id)) return [];
    const campaign = url.searchParams.get('hsa_cam');
    return [{ id, campaign: campaign && /^\d+$/.test(campaign) ? `Campaña Meta ${campaign}` : '', visited, contact: contact.id }];
  });
  return candidates.sort((a, b) => a.visited - b.visited || a.contact.localeCompare(b.contact, 'en', { numeric: true }))[0] ?? null;
}

export function contactRole(contacts: LinkedContact[]) {
  const keyContacts = contacts.filter(contact => contact.properties['key_contact'] === 'true');
  const candidates = keyContacts.length ? keyContacts : contacts;
  const labels = [...new Set(candidates.flatMap(contact => contact.labels))].sort((a, b) => a.localeCompare(b, 'es'));
  if (labels.length === 1) return labels[0]!;
  if (labels.length > 1) return 'Varios roles';
  return keyContacts.length ? 'Contacto clave sin rol' : contacts.length ? 'Sin rol registrado' : 'Sin contacto asociado';
}

export const hasStage = (deal: PipelineDeal, id: StageId) => deal.stage === id || Boolean(deal.entries[id]);
export const wasWon = (deal: PipelineDeal) => [...WON_STAGES].some(id => hasStage(deal, id as StageId));
export const wasLost = (deal: PipelineDeal) => hasStage(deal, '171385869') || hasStage(deal, '1372234925') || hasStage(deal, '213417520');
export const wasInService = (deal: PipelineDeal) => hasStage(deal, '173990327');
export const serviceToChurn = (deal: PipelineDeal) => deal.stage === '178228041' && wasInService(deal) &&
  nativeTime(deal.entries['178228041']) >= nativeTime(deal.entries['173990327']);

export function currentOutcome(deal: PipelineDeal) {
  if (deal.stage === '178228041') return serviceToChurn(deal) ? 'Churn tras E8' : 'Churn sin secuencia E8 verificada';
  if (deal.stage === '173990327') return 'En servicio hoy';
  if (WON_STAGES.has(deal.stage)) return 'Ganado · activación pendiente';
  if (['171385869', '1372234925', '213417520'].includes(deal.stage)) return STAGES[deal.stage as StageId];
  if (deal.commercial) return 'Abierto en Comercial';
  return deal.stage === '1300101811' ? 'Lead perdido' : 'En SDR';
}

export const adKey = (deal: PipelineDeal) => deal.adId ? `Anuncio Meta ${deal.adId}` : deal.contactRead ? 'Sin anuncio rastreado' : 'Lectura pendiente';
export const adLabel = (deal: PipelineDeal) => deal.creative?.name || adKey(deal);
export const creativeFormat = (deal: PipelineDeal) => deal.creative?.format || (deal.adId ? 'Formato sin verificar' : 'Sin anuncio identificado');
export const meetingBooked = (deal: PipelineDeal) => hasStage(deal, '1025498163') || hasStage(deal, '1300101808');
export const meetingHeld = (deal: PipelineDeal) => hasStage(deal, '1300101810') || hasStage(deal, '171385863');
export const reachedCommercial = (deal: PipelineDeal) => deal.commercial || Object.keys(SALES_STAGES).some(id => hasStage(deal, id as StageId));
export type FlowColumn = { title: string; value: (deal: PipelineDeal) => string; label?: (deal: PipelineDeal) => string; detail?: (deal: PipelineDeal) => string; limit?: number };

const stageColumn = (id: StageId): FlowColumn => ({
  title: STAGES[id], value: deal => hasStage(deal, id) ? STAGES[id] : 'Sin registro',
});
const labeledColumn = (title: string, test: (deal: PipelineDeal) => boolean): FlowColumn => ({
  title, value: deal => test(deal) ? title : 'Sin registro',
});
export function pipelineColumns(view: View, detail: RouteDetail): FlowColumn[] {
  const industry = { title: 'Industria', value: (deal: PipelineDeal) => deal.industry, limit: 8 };
  const entry = view === 'Inbound'
    ? [{ title: 'Anuncio rastreado', value: adKey, label: adLabel, detail: creativeFormat, limit: 8 }, industry]
    : view === 'Outbound'
      ? [industry, { title: 'Rol del contacto', value: (deal: PipelineDeal) => deal.role, limit: 8 },
        { title: 'Clasificación', value: (deal: PipelineDeal) => isProspectingCandidate(deal) ? 'Prospección SDR sin clasificar' : deal.motion }]
      : [{ title: 'Origen', value: (deal: PipelineDeal) => deal.motion },
        { title: 'Fuente de creación', value: (deal: PipelineDeal) => deal.sourceLabel, limit: 8 }, industry];
  const outcome = { title: 'Estado actual', value: currentOutcome };
  const sdr = ['1307029105', '1025498163', '1300101807', '1300101808', '1300101809', '1300101810', '1301196893', '1300101811'] as const;
  const sales = ['1144383754', '171385863', '171385864', '173996363', '1181334581', '171385866', '171385867', '1245768029'] as const;
  if (detail === 'sdr') return [...entry, ...sdr.map(stageColumn), outcome];
  if (detail === 'sales') return [...entry, ...sales.map(stageColumn), outcome];
  const activation = ['1278792585', '1086544542', '213244763', '171385868', '173990327'] as const;
  if (detail === 'activation') return [...entry, stageColumn('174677684'), ...activation.map(stageColumn), outcome];
  return [...entry, labeledColumn('Reunión agendada', meetingBooked), labeledColumn('Reunión concretada', meetingHeld),
    labeledColumn('Pipeline Comercial', reachedCommercial), stageColumn('171385866'),
    { title: 'Resultado comercial', value: deal => {
      if (wasWon(deal) && wasLost(deal)) return 'Ganado y pérdida registrada';
      if (wasWon(deal)) return 'Ganado registrado';
      if (wasLost(deal)) return 'Pérdida registrada';
      return 'Sin cierre registrado';
    } },
    stageColumn('1278792585'), stageColumn('1086544542'), stageColumn('173990327'), outcome];
}

export type FlowNode = { key: string; name: string; detail?: string; members: PipelineDeal[]; y: number; height: number; out: number; in: number };
export function layoutPipelineFlow(deals: PipelineDeal[], definitions: FlowColumn[]) {
  const columns = definitions.map(definition => {
    const buckets = new Map<string, PipelineDeal[]>();
    const index = new Map<string, FlowNode>();
    for (const deal of deals) {
      const value = definition.value(deal);
      const members = buckets.get(value) ?? [];
      members.push(deal);
      buckets.set(value, members);
    }
    const groups = [...buckets].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'es'));
    const nodes: FlowNode[] = groups.slice(0, definition.limit).map(([key, members]) => {
      const deal = members[0]!;
      return { key, name: definition.label?.(deal) ?? key, ...(definition.detail ? { detail: definition.detail(deal) } : {}),
        members, y: 0, height: 0, out: 0, in: 0 };
    });
    const remainder = definition.limit === undefined ? [] : groups.slice(definition.limit);
    if (remainder.length) nodes.push({ key: JSON.stringify(remainder.map(([key]) => key)), name: `Otros valores (${remainder.length})`, members: remainder.flatMap(([, members]) => members), y: 0, height: 0, out: 0, in: 0 });
    for (const node of nodes) for (const member of node.members) index.set(member.id, node);
    return { title: definition.title, nodes, index };
  });
  const scale = 220 / Math.max(deals.length, 1);
  const gap = definitions.some(column => column.detail) ? 50 : 36;
  const height = 268 + gap * Math.max(0, ...columns.map(column => column.nodes.length - 1));
  for (const column of columns) {
    let y = (height - 220 - gap * (column.nodes.length - 1)) / 2;
    for (const node of column.nodes) {
      node.y = y;
      node.height = node.members.length * scale;
      y += node.height + gap;
    }
  }
  const links = columns.slice(0, -1).flatMap((column, depth) => column.nodes.flatMap(source => {
    const next = columns[depth + 1]!;
    const targets = new Map<FlowNode, PipelineDeal[]>();
    for (const deal of source.members) {
      const target = next.index.get(deal.id)!;
      const members = targets.get(target) ?? [];
      members.push(deal);
      targets.set(target, members);
    }
    return [...targets].sort(([a], [b]) => a.y - b.y).map(([target, members]) => {
      const width = members.length * scale;
      const link = { depth, source, target, members, width, y1: source.y + source.out, y2: target.y + target.in };
      source.out += width;
      target.in += width;
      return link;
    });
  }));
  return { columns, links, height };
}
