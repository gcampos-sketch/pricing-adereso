import type { DealDTO, PulseReport, StageJourney } from './pulse-types';
import { buildExecutiveStrip } from './executive-strip';
import { roleOfOwner, type RoleFilter } from './owner-roles';
import { crmUrl, RISK_LABELS, suggestion, type Notice } from './sales-notifications';

export const TASK_KINDS = {
  unactivated: 'Sin activar', warning: 'Deal warning', 'off-track': 'No on track',
  'e4-unrecorded': 'Revisar paso por E4', hygiene: 'Otros pendientes', 'adobo-risk': 'Riesgos Adobo',
} as const;
export type TaskKind = keyof typeof TASK_KINDS;
export type TaskReason = { kind: TaskKind; evidence: string; action: string };
export type ReviewTask = { id: string; key: string; name: string; owner: string; ownerId: string; stage: string; url: string; reasons: TaskReason[]; notice?: Notice };
type Scope = { owner: string; role: RoleFilter; stages: string[]; matchesType: (deal: DealDTO) => boolean };
const afterE4 = new Set(['171385867', '1245768029', '174677684', '1278792585', '1086544542', '213244763', '171385868']);
const downstream = ['E5', 'E5.1', 'E6', 'E6.1', 'E6.2'];

/** A missing stage property is a review candidate, NEVER proof of a skipped stage. */
export function e4ReviewEvidence(j: StageJourney, now: number): string | null {
  if (!afterE4.has(j.deal.stageId) || j.entered['E4'] || (j.days['E4'] ?? 0) > 0 || !Number.isFinite(now)) return null;
  const before = ['E1', 'E2'].map(key => ({key, at: Date.parse(j.entered[key] ?? '')})).filter(x => Number.isFinite(x.at) && x.at <= now);
  const after = downstream.map(key => ({key, at: Date.parse(j.entered[key] ?? '')})).filter(x => Number.isFinite(x.at) && x.at <= now);
  const pair = before.flatMap(a => after.filter(b => b.at > a.at).map(b => ({a,b})))[0];
  return pair ? `HubSpot registra ${pair.a.key} (${new Date(pair.a.at).toISOString().slice(0,10)}) y ${pair.b.key} (${new Date(pair.b.at).toISOString().slice(0,10)}), sin fecha ni tiempo registrado en E4. Esto no confirma un salto: revisar el historial.` : null;
}
const signature = (task: ReviewTask) => `review-task/v1:${task.id}:${JSON.stringify([task.ownerId,task.owner,task.stage,task.reasons.map(r => [r.kind,r.evidence]),task.notice?.fingerprint ?? ''])}`;

/** Read-only adapter of the authorized report. Reuses its executive populations and warning drilldowns. */
export function dashboardTasks(report: PulseReport, scope: Scope): ReviewTask[] {
  const now = Date.parse(report.generatedAt);
  const matches = (deal: DealDTO) => (scope.owner === 'team' || deal.ownerId === scope.owner) &&
    (scope.role === 'all' || roleOfOwner(deal.ownerId) === scope.role) && scope.matchesType(deal) &&
    (!scope.stages.length || scope.stages.includes(deal.stage));
  const strip = buildExecutiveStrip(report.stageJourneys ?? [], report.executiveStrip?.onTrack ?? {
    yes: [], no: report.drilldowns[report.tracking?.find(t => t.id === 'team')?.onTrackNoModal ?? '']?.deals ?? [],
  }, now, scope);
  const tasks = new Map<string, ReviewTask>();
  const add = (deal: DealDTO, reason: TaskReason) => {
    if (!matches(deal)) return;
    const task = tasks.get(deal.id) ?? {id:deal.id,key:'',name:deal.name,owner:deal.owner,ownerId:deal.ownerId,stage:deal.stageFull || deal.stage,url:crmUrl(deal.id),reasons:[]};
    if (!task.reasons.some(r => r.kind === reason.kind && r.evidence === reason.evidence)) task.reasons.push(reason);
    tasks.set(deal.id, task);
  };
  for (const deal of strip.openPipe.stages.find(s => s.key === 'Sin activar')?.deals ?? []) add(deal, {
    kind:'unactivated', evidence:`Permanece en ${deal.stageFull || deal.stage}, dentro de «Sin activar» del resumen ejecutivo.`, action:'Revisar si corresponde activar el negocio y registrar el siguiente paso.',
  });
  const warnings = (report.warnings ?? []).find(w => w.id === 'team');
  const warningDeals = report.drilldowns[warnings?.modal ?? '']?.deals ?? (report.stageJourneys ?? []).filter(j => j.deal.stageId === '1278792585').map(j => j.deal);
  for (const deal of warningDeals.filter(d => d.stageId === '1278792585')) {
    const reasons = warnings?.reasons.filter(r => report.drilldowns[r.modal]?.deals.some(d => d.id === deal.id)).map(r => r.label) ?? [];
    add(deal, {kind:'warning',evidence:`Etapa actual: ${deal.stageFull || deal.stage}. Motivo: ${reasons.join('; ') || 'sin motivo registrado'}.`,action:'Revisar el motivo del warning y acordar responsable y próximo paso.'});
  }
  for (const deal of strip.onTrack.no) add(deal, {kind:'off-track',evidence:'On track está marcado explícitamente como No en HubSpot.',action:'Revisar el bloqueo y actualizar el plan de avance con el responsable.'});
  const close = report.closeHygiene?.find(h => h.id === 'team');
  const activity = report.taskHygiene?.find(h => h.id === 'team');
  const hygiene = [
    [close?.overdueModal, 'Fecha de cierre vencida', 'Acordar una fecha de cierre realista y registrar el siguiente paso.'],
    [close?.noDateModal, 'Sin fecha de cierre', 'Definir una fecha de cierre sustentada en el avance del negocio.'],
    [close?.stale5Modal, 'Fecha de cierre sin actualizar por más de cinco meses', 'Revalidar la oportunidad y actualizar su fecha de cierre.'],
    [close?.pocOverdueModal, 'Prueba de concepto vencida', 'Revisar el resultado de la prueba y acordar el siguiente paso.'],
    [activity?.noActivityModal, 'Sin próxima actividad', 'Definir y registrar la próxima actividad comercial.'],
    [activity?.overdueTaskModal, 'Tareas pendientes vencidas', 'Revisar las tareas vencidas y resolver o reprogramar con contexto.'],
  ] as const;
  for (const [modal, evidence, action] of hygiene) for (const deal of report.drilldowns[modal ?? '']?.deals ?? []) add(deal, {kind:'hygiene',evidence,action});
  if (!close && !activity) {
    const byId = new Map((report.stageJourneys ?? []).map(j=>[j.deal.id,j.deal]));
    for (const alert of report.alerts ?? []) { const deal=byId.get(alert.id); if(deal) add(deal,{kind:'hygiene',evidence:alert.reason,action:'Revisar el aviso del panel y registrar un próximo paso concreto.'}); }
  }
  for (const j of report.stageJourneys ?? []) {
    const evidence = e4ReviewEvidence(j, now);
    if (evidence) add(j.deal, {kind:'e4-unrecorded',evidence,action:'Validar la propuesta y el historial antes de confirmar un salto de etapa o corregir el registro.'});
  }
  return [...tasks.values()].map(t => ({...t,key:signature(t)}));
}

/** One review task per deal. Personal producer evidence retains the original owner authorization. */
export function reviewQueue(operational: ReviewTask[], notices: Notice[]): ReviewTask[] {
  const tasks = new Map(operational.map(t => [t.id,{...t,reasons:[...t.reasons]}]));
  for (const notice of notices) {
    const r = notice.record;
    // Do not attach a previous owner's private evidence to a report-confirmed handoff.
    if (tasks.has(r.id) && tasks.get(r.id)!.ownerId !== r.ownerId) continue;
    const task = tasks.get(r.id) ?? {id:r.id,key:'',name:r.name,owner:r.owner,ownerId:r.ownerId,stage:r.stage,url:crmUrl(r.id),reasons:[]};
    task.reasons.push({kind:'adobo-risk',evidence:r.risks.map(k=>RISK_LABELS[k]??'Riesgo sin categoría corroborada').join(' · '),action:suggestion(notice)});
    task.notice = notice;
    tasks.set(r.id,task);
  }
  const priority = (t: ReviewTask) => t.reasons.some(r=>r.kind==='warning') ? 0 : t.reasons.some(r=>r.kind==='off-track') ? 1 : 2;
  return [...tasks.values()].map(t => ({...t,key:signature(t)})).sort((a,b)=>priority(a)-priority(b)||a.name.localeCompare(b.name));
}
export function copyReviewTasks(tasks: ReviewTask[], generatedAt: string | null) {
  return ['Dashboard comercial · pendientes de revisión',`Corte del panel: ${generatedAt ?? 'sin dato'} · ${tasks.length} negocios · sin filtro de año/trimestre`,
    'Lista de revisión. No autoriza a enviar mensajes ni modificar HubSpot.',
    ...tasks.map(t=>`\n${t.name} · Deal ${t.id} · ${t.owner} · ${t.stage}\n${t.url}\n${t.reasons.map(r=>`${TASK_KINDS[r.kind]}: ${r.evidence}\nAcción sugerida: ${r.action}`).join('\n')}${t.notice ? `\nEvidencia Adobo: ${t.notice.record.evidence || 'sin dato'}\nRevisión del productor: ${t.notice.record.reviewedAt || 'sin dato'} · ${t.notice.blocked ?? 'corroborar vigencia antes de actuar'}` : ''}`),
  ].join('\n');
}
