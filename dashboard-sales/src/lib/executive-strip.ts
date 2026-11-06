import type { DealDTO, StageJourney } from './pulse-types';
import { roleOfOwner, type RoleFilter } from './owner-roles';
import { creationComparisonWindow, hasOrderedActivation } from './story-metrics';

const OPEN = new Set(['171385863', '171385864', '173996363', '1181334581', '171385866', '171385867', '1245768029']);
const WON = new Set(['174677684', '1278792585', '1086544542', '213244763', '171385868', '173990327']);

type ExecutiveScope = { owner: string; role: RoleFilter; matchesType: (deal: DealDTO) => boolean };

/** Commercial-pipeline journeys only; dates and stage selection never scope this strip. */
export function buildExecutiveStrip(journeys: StageJourney[], onTrack: { yes: DealDTO[]; no: DealDTO[] }, now: number, scope?: ExecutiveScope) {
  const matches = (deal: DealDTO) => !scope || (
    (scope.owner === 'team' || deal.ownerId === scope.owner) &&
    (scope.role === 'all' || roleOfOwner(deal.ownerId) === scope.role) && scope.matchesType(deal)
  );
  journeys = [...new Map(journeys.filter(j => matches(j.deal)).map(j => [j.deal.id, j])).values()];
  onTrack = { yes: onTrack.yes.filter(matches), no: onTrack.no.filter(matches) };
  const date = new Date(now);
  const year = date.getUTCFullYear();
  const quarter = String(Math.floor(date.getUTCMonth() / 3) + 1);
  const window = creationComparisonWindow(year, quarter, now);
  const created = journeys.filter(j => {
    const at = Date.parse(j.createdAt);
    return at >= window.currentStart && at <= window.currentEnd;
  });
  const activated = (j: StageJourney) => roleOfOwner(j.deal.ownerId) === 'AE'
    ? Object.keys(j.entered).some(k => k !== 'E0' && k !== 'LOST') || (j.deal.stageId !== '1144383754' && j.deal.stageId !== '171385869')
    : hasOrderedActivation(j.entered);
  const eligible = created.filter(j => roleOfOwner(j.deal.ownerId) === 'AE' || j.entered['E0'] || j.deal.stageId === '1144383754');
  const previousCount = journeys.filter(j => {
    const at = Date.parse(j.createdAt);
    return at >= window.previousStart && at < window.previousEnd;
  }).length;
  const by = (...ids: string[]) => journeys.filter(j => ids.includes(j.deal.stageId)).map(j => j.deal);
  const stages = [
    { key: 'Sin activar', hint: 'siguen en etapa 0 o 1', deals: by('1144383754', '171385863') },
    { key: 'E2', hint: '', deals: by('171385864') },
    { key: 'E4', hint: '', deals: by('171385866') },
    { key: 'E5', hint: '', deals: by('171385867') },
    { key: 'E5.1', hint: '', deals: by('1245768029') },
  ];
  const list = [...new Map(journeys.filter(j => WON.has(j.deal.stageId) && j.deal.amountValue > 0).map(j => [j.deal.id, j.deal])).values()];
  const wonBy = (...ids: string[]) => list.filter(d => ids.includes(d.stageId));
  // E8 «listo»: lo más reciente primero según fecha de cierre; sin fecha queda al final.
  const service = wonBy('173990327').sort((a, b) => {
    const left = a.closeDateValue || '';
    const right = b.closeDateValue || '';
    if (left === right) return 0;
    if (!left) return 1;
    if (!right) return -1;
    return left < right ? 1 : -1;
  });
  // La barra E8 no muestra el histórico completo: son los últimos en entrar, hasta 10, por fecha real de entrada a E8.
  const journeyById = new Map(journeys.map(j => [j.deal.id, j]));
  const enteredE8 = (d: DealDTO) => Date.parse(journeyById.get(d.id)?.entered['E8'] ?? '');
  const lastIn = wonBy('173990327').sort((a, b) => {
    const left = enteredE8(a);
    const right = enteredE8(b);
    if (Number.isFinite(left) && Number.isFinite(right)) return right - left;
    if (Number.isFinite(left)) return -1;
    if (Number.isFinite(right)) return 1;
    return 0;
  }).slice(0, 10);
  const wonStages = [
    { key: 'e6', label: 'E6 sin kick off', hint: 'empujar a 6.2', tone: 'warn', deals: wonBy('174677684') },
    { key: 'e61', label: 'E6.1 warning', hint: 'cuidado', tone: 'bad', deals: wonBy('1278792585') },
    { key: 'e62', label: 'E6.2 desarrollo', hint: 'kick off hecho', tone: 'brand', deals: wonBy('1086544542', '213244763', '171385868') },
    { key: 'e8', label: 'E8 últimos en entrar', hint: 'los 10 más recientes en entrar', tone: 'ok', deals: lastIn },
  ];
  const contracts = list.filter(d => !/firmad/i.test(d.contractStatus ?? '') || /no firmad|sin firm/i.test(d.contractStatus ?? ''));
  return {
    period: `${year}-Q${quarter}`,
    generation: {
      created: created.map(j => j.deal),
      notActivatedIds: eligible.filter(j => !activated(j)).map(j => j.deal.id),
      activationPct: eligible.length ? Math.round(eligible.filter(activated).length / eligible.length * 100) : null,
      createdDelta: previousCount ? (created.length - previousCount) / previousCount * 100 : null,
      comparisonPartial: window.partial,
    },
    openPipe: { stages, total: stages.reduce((sum, st) => sum + st.deals.length, 0), aged: journeys.filter(j => OPEN.has(j.deal.stageId) && Date.parse(j.createdAt) < now - 60 * 86_400_000).map(j => j.deal) },
    wonJourney: {
      total: list.length, historicTotal: list.length, stages: wonStages, service,
      pending: list.filter(d => d.stageId !== '173990327'),
      segments: ['Inbound', 'Outbound', 'Upsell', 'Cross sell'].map(seg => ({ seg, deals: service.filter(d => d.segment === seg) })).filter(x => x.deals.length),
      contracts,
      cBlank: contracts.filter(d => !d.contractStatus || /no inici|blanco/i.test(d.contractStatus)),
      cDraft: contracts.filter(d => /borrador/i.test(d.contractStatus ?? '')),
      cSent: contracts.filter(d => /enviad/i.test(d.contractStatus ?? '')),
    },
    onTrack,
  };
}

export type ExecutiveStrip = ReturnType<typeof buildExecutiveStrip>;