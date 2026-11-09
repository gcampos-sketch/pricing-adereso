import type { DealDTO, StageJourney } from './pulse-types';

/**
 * SALES-85/86 · Población elegible para el cumplimiento del Q.
 * Criterio documentado (browser-safe, sin heurísticas de monto):
 * - Renovación / Contracción: por la propiedad `dealtype` (texto exacto normalizado). Se excluyen.
 * - Billetera: por `productos_a_contratar` (valores separados por «;»). Si TODOS los productos son
 *   billetera se excluye; si mezcla billetera con otro producto queda elegible y marcado para revisión.
 * - MRR = 0 nunca decide por sí solo; Upsell no implica billetera.
 * - Sin dato del tipo o del producto (snapshot antiguo) => elegible pero marcado para revisión.
 * Line items de HubSpot aún no se leen: pendiente para confirmar mixtos.
 */
export type QuotaKind = 'eligible' | 'renewal' | 'contraction' | 'wallet' | 'mixed' | 'unknown';
export type QuotaClass = { kind: QuotaKind; counts: boolean; review: boolean; reason: string };

const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const isWalletProduct = (v: string) => /billetera|wallet/.test(norm(v));

type Classifiable = Pick<DealDTO, 'segment'> & { dealType?: string | null; productToHire?: string | null };

/** Product identity is independent of deal type, amount and stage-history quality. */
export function isWalletOnlyDeal(deal: { productToHire?: string | null }): boolean {
  const products = (deal.productToHire ?? '').split(';').map(product => product.trim()).filter(Boolean);
  return products.length > 0 && products.every(isWalletProduct);
}

/** Raw dealtype is authoritative; segment is only a fallback for legacy DTOs. */
export function isRenewalDeal(deal: { dealType?: string | null; segment?: string }): boolean {
  if (deal.dealType === undefined) return deal.segment === 'Renovación';
  const type = norm(deal.dealType ?? '');
  return type.startsWith('renovac') || type === 'renewal';
}

export function classifyQuotaDeal(deal: Classifiable): QuotaClass {
  const type = deal.dealType === undefined ? undefined : norm(deal.dealType ?? '');
  if (isRenewalDeal(deal))
    return { kind: 'renewal', counts: false, review: false, reason: 'Renovación' };
  if (type && /contracc|downsell|downgrade/.test(type))
    return { kind: 'contraction', counts: false, review: false, reason: 'Contracción' };
  if (deal.productToHire === undefined)
    return { kind: 'unknown', counts: true, review: true, reason: 'Producto sin dato en el reporte guardado' };
  const products = (deal.productToHire ?? '').split(';').map((s) => s.trim()).filter(Boolean);
  const wallets = products.filter(isWalletProduct);
  if (isWalletOnlyDeal(deal))
    return { kind: 'wallet', counts: false, review: false, reason: 'Billetera' };
  if (wallets.length) return { kind: 'mixed', counts: true, review: true, reason: 'Billetera + otro producto' };
  if (type === undefined) return { kind: 'unknown', counts: true, review: true, reason: 'Tipo de deal sin dato' };
  return { kind: 'eligible', counts: true, review: false, reason: '' };
}

export type QuotaStats = { won: number; wonAmount: number; wonOtf: number; eligible: DealDTO[]; excluded: DealDTO[]; review: DealDTO[] };

/** Totales del cumplimiento desde la misma lista que muestra el detalle (sin duplicados por id). */
export function quotaStats(wonDeals: DealDTO[]): QuotaStats {
  const unique = [...new Map(wonDeals.map((d) => [d.id, d])).values()];
  const eligible: DealDTO[] = [], excluded: DealDTO[] = [], review: DealDTO[] = [];
  for (const d of unique) {
    const c = classifyQuotaDeal(d);
    (c.counts ? eligible : excluded).push(d);
    if (c.review) review.push(d);
  }
  return {
    won: eligible.length,
    wonAmount: eligible.reduce((s, d) => s + (d.amountValue || 0), 0),
    wonOtf: eligible.reduce((s, d) => s + (d.otfValue || 0), 0),
    eligible, excluded, review,
  };
}

/* ---------- SALES-85 · PROPUESTA (no aplicada): atribución por entrada real a E6 ---------- */

const POST_E6 = new Set(['1086544542', '213244763', '171385868', '173990327']);
const PENDING_E6 = new Set(['174677684', '1278792585']);
const LOST = '171385869';

export const periodOfDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
};

export type Stage6Proposal = {
  deal: DealDTO;
  /** Q propuesto = Q de entrada real a E6 (historial de etapas, nunca closedate). */
  attributionPeriod: string | null;
  enteredE6: string | null;
  enteredE62: string | null;
  status: 'reached-6.2' | 'pending' | 'lost-after-6' | 'review';
  reviewReason: string | null;
};

/** Clasifica sin decidir reglas pendientes con JC: retrocesos/pérdidas/sin historial quedan en revisión. */
export function proposeStage6Attribution(j: StageJourney): Stage6Proposal | null {
  const e6 = j.entered['E6'] ?? null;
  const e62 = j.entered['E6.2'] ?? null;
  const stage = j.deal.stageId;
  const relevant = e6 || POST_E6.has(stage) || PENDING_E6.has(stage);
  if (!relevant) return null;
  const base = { deal: j.deal, enteredE6: e6, enteredE62: e62 };
  const t6 = e6 ? Date.parse(e6) : NaN;
  if (!Number.isFinite(t6)) return { ...base, attributionPeriod: null, status: 'review', reviewReason: 'Sin fecha confiable de entrada a E6' };
  const attributionPeriod = periodOfDate(e6!);
  if (stage === LOST) return { ...base, attributionPeriod, status: 'lost-after-6', reviewReason: 'Perdido después de E6: tratamiento por definir con JC' };
  if (e62 && Date.parse(e62) < t6) return { ...base, attributionPeriod, status: 'review', reviewReason: 'E6.2 anterior a E6: posible reingreso o retroceso' };
  if (PENDING_E6.has(stage)) {
    if (e62) return { ...base, attributionPeriod, status: 'review', reviewReason: 'Volvió a E6 tras llegar a E6.2: retroceso por definir' };
    return { ...base, attributionPeriod, status: 'pending', reviewReason: null };
  }
  if (POST_E6.has(stage)) return { ...base, attributionPeriod, status: 'reached-6.2', reviewReason: null };
  return { ...base, attributionPeriod, status: 'review', reviewReason: 'Salió de E6 hacia una etapa abierta: retroceso por definir' };
}

/** Pendientes de Q anteriores: atribuidos a un Q previo al actual y aún sin llegar a 6.2. Cada deal aparece una vez. */
export function pendingFromPreviousQuarters(journeys: StageJourney[], currentPeriod: string) {
  const rows = [...new Map(journeys.map((j) => [j.deal.id, j])).values()]
    .map(proposeStage6Attribution)
    .filter((r): r is Stage6Proposal => !!r);
  return {
    pending: rows.filter((r) => r.status === 'pending' && r.attributionPeriod! < currentPeriod),
    review: rows.filter((r) => r.status === 'review' || r.status === 'lost-after-6'),
  };
}
