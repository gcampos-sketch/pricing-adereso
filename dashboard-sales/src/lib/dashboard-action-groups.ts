import type { DealDTO, PulseReport } from './pulse-types';
import { buildExecutiveStrip } from './executive-strip';
import { roleOfOwner, type RoleFilter } from './owner-roles';

export const ACTION_DEFINITIONS = [
  { id: 'overdue', title: 'Actualizar cierres vencidos', description: 'Revalidar la fecha de cierre de los negocios activos.' },
  { id: 'kickoff', title: 'Llevar E6 a kick off', description: 'Negocios firmados que siguen en E6, pendientes de avanzar a kick off.' },
  { id: 'warning', title: 'Resolver warnings de E6.1', description: 'Revisar el motivo y acordar cómo desbloquear cada negocio.' },
  { id: 'lost-candidate', title: 'Revisar candidatos a perdido', description: 'Validar señales de pérdida por prioridad o competencia y definir el siguiente paso.' },
  { id: 'off-track', title: 'Contactar negocios On track: No', description: 'Revisar el bloqueo y retomar el contacto con estas oportunidades activas.' },
  { id: 'drafts', title: 'Enviar borradores de contrato', description: 'Borradores registrados que aún no se enviaron al cliente.' },
  { id: 'signature', title: 'Gestionar firmas pendientes', description: 'Contratos enviados al cliente que todavía no figuran firmados.' },
] as const;
export type ActionKind = typeof ACTION_DEFINITIONS[number]['id'];
/** Verified native saved view: explicit On track No + the eight open Commercial Adereso stages. */
export const OFF_TRACK_HUBSPOT_VIEW = 'https://app.hubspot.com/contacts/23480943/objects/0-3/views/76976317/list';
export type ActionGroup = { id: ActionKind; title: string; description: string; deals: DealDTO[]; reasons: { label: string; deals: DealDTO[] }[] };
export type ActionScope = { owner: string; role: RoleFilter; stages: string[]; matchesType: (deal: DealDTO) => boolean };
const OPEN = new Set(['1144383754','171385863','171385864','173996363','1181334581','171385866','171385867','1245768029']);
const WON = new Set(['174677684','1278792585','1086544542','213244763','171385868','173990327']);
const unique = (deals: DealDTO[]) => [...new Map(deals.map(deal => [deal.id, deal])).values()];
const normalize = (value: string | null | undefined) => (value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();

/** Grouped actions, never individual bell notifications or inferred risks. No CRM writes. */
export function dashboardActionGroups(report: PulseReport, scope: ActionScope, now = Date.parse(report.generatedAt)): ActionGroup[] {
  const matches = (d: DealDTO) => (scope.owner === 'team' || d.ownerId === scope.owner) &&
    (scope.role === 'all' || roleOfOwner(d.ownerId) === scope.role) && scope.matchesType(d) &&
    (!scope.stages.length || scope.stages.includes(d.stage));
  const current = unique((report.stageJourneys ?? []).map(j => j.deal));
  const currentById = new Map(current.map(deal => [deal.id, deal]));
  const all = current.filter(matches);
  const strip = buildExecutiveStrip(report.stageJourneys ?? [], report.executiveStrip?.onTrack ?? {
    yes: [], no: report.drilldowns[report.tracking?.find(t => t.id === 'team')?.onTrackNoModal ?? '']?.deals ?? [],
  }, Date.parse(report.generatedAt), scope, now);
  const warningScope = report.warnings?.find(w => w.id === 'team');
  const warnings = unique([...(report.drilldowns[warningScope?.modal ?? '']?.deals ?? []), ...current]).filter(d => matches(d) && d.stageId === '1278792585');
  const warningReasons = new Map<string, DealDTO[]>();
  for (const deal of warnings) {
    const labels = warningScope?.reasons.filter(r => report.drilldowns[r.modal]?.deals.some(d => d.id === deal.id)).map(r => r.label) ?? [];
    for (const label of labels.length ? labels : ['Sin motivo registrado']) warningReasons.set(label, [...(warningReasons.get(label) ?? []), deal]);
  }
  const close = report.closeHygiene?.find(row => row.id === 'team');
  const candidateReasons = ([['Prioridad', close?.lostPriorityModal], ['Competencia', close?.lostCompetitionModal]] as const)
    .map(([label, key]) => ({label, deals: unique((report.drilldowns[key ?? '']?.deals ?? [])
      .flatMap(deal => currentById.has(deal.id) ? [currentById.get(deal.id)!] : [])
      .filter(deal => matches(deal) && OPEN.has(deal.stageId)))}))
    .filter(reason => reason.deals.length > 0);
  // Contract work is limited to current won deals with an explicit draft/sent status.
  // Blank, not-started, signed and not-applicable statuses do not imply a pending signature.
  const contractDeals = all.filter(d => WON.has(d.stageId));
  const sent = (s: string) => /enviad/.test(s) && !/(?:no|sin|por|pendiente de)\s+envi/.test(s);
  const signed = (s: string) => /firmad/.test(s) && !/(?:no|sin)\s+firm/.test(s);
  const cancelled = (s: string) => /no aplica|cancelad/.test(s);
  const populations: Record<ActionKind, DealDTO[]> = {
    overdue: strip.openPipe.overdue.filter(matches),
    kickoff: all.filter(d => d.stageId === '174677684'),
    warning: warnings,
    'lost-candidate': unique(candidateReasons.flatMap(reason => reason.deals)),
    'off-track': unique(strip.onTrack.no.map(d => currentById.get(d.id) ?? d)).filter(d => matches(d) && OPEN.has(d.stageId)),
    drafts: contractDeals.filter(d => /borrador/.test(normalize(d.contractStatus)) && !sent(normalize(d.contractStatus)) && !signed(normalize(d.contractStatus)) && !cancelled(normalize(d.contractStatus))),
    signature: contractDeals.filter(d => (sent(normalize(d.contractStatus)) || /pendiente de firma|firma pendiente|por firmar/.test(normalize(d.contractStatus))) && !signed(normalize(d.contractStatus)) && !cancelled(normalize(d.contractStatus))),
  };
  return ACTION_DEFINITIONS.map(def => ({...def, deals: populations[def.id], reasons: def.id === 'lost-candidate' ? candidateReasons : def.id === 'warning' ? [...warningReasons].map(([label, deals]) => ({label, deals: unique(deals)})) : []})).filter(group => group.deals.length > 0);
}
