import { AlertTriangle, Check, CircleHelp } from "lucide-react";
import type { InsightDeal } from "@/lib/insights-types";
import { GHOSTING_CHANNELS, GHOSTING_MINIMUM, GHOSTING_STATUS_LABELS, ghostingMinimum, summarizeGhosting, type GhostingActivity } from "@/lib/loss-ghosting";

const unknownStage = "Etapa sin verificar";

export function LossGhostingOrigins({ deals, evidence, loading, onOpen }: {
  deals: readonly InsightDeal[];
  evidence: Readonly<Record<string, GhostingActivity>> | undefined;
  loading: boolean;
  onOpen?: (deals: InsightDeal[], detail: string) => void;
}) {
  const groups = new Map<string, InsightDeal[]>();
  for (const deal of deals) {
    const stage = evidence?.[deal.id]?.originStage ?? unknownStage;
    const group = groups.get(stage) ?? [];
    group.push(deal);
    groups.set(stage, group);
  }
  const ordered = [...groups].sort(([a, aDeals], [b, bDeals]) =>
    Number(a === unknownStage) - Number(b === unknownStage) || bDeals.length - aDeals.length || a.localeCompare(b, "es"));

  return <section className="loss-ghosting-origins">
    <h4 className="loss-conclusion-list-heading">Etapa desde la que pasaron a perdido</h4>
    {loading ? <p className="loss-conclusion-stage">Consultando el historial de etapas en HubSpot…</p> :
      <ul className="loss-conclusion-channel-list" aria-label="Etapa de origen de los deals perdidos por ghosting">
        {ordered.map(([stage, group]) => {
          const detail = stage === unknownStage ? stage : `Desde ${stage}`;
          const count = `${group.length} ${group.length === 1 ? "deal" : "deals"}`;
          return <li key={stage}>{onOpen
            ? <button type="button" aria-haspopup="dialog" onClick={() => onOpen(group, detail)}>{stage} <strong>{count}</strong></button>
            : <span>{stage} <strong>{count}</strong></span>}
          </li>;
        })}
      </ul>}
  </section>;
}

export function LossGhostingSummary({ deals, evidence, loading }: {
  deals: readonly InsightDeal[];
  evidence: Readonly<Record<string, GhostingActivity>> | undefined;
  loading: boolean;
}) {
  const { metrics, modalStages, stageCovered, stageFrequency } = summarizeGhosting(deals, evidence);
  return <section className="loss-ghosting-summary" aria-label="Resumen de Ghosting">
    <h3>Resumen de Ghosting</h3>
    {loading ? <p role="status">Verificando historial en HubSpot…</p> : <>
      <p>Mediana de actividades por deal</p>
      <dl className="loss-ghosting-summary-metrics">
        {metrics.map(({ label, median, covered }) => <div key={label}>
          <dt>{label}</dt>
          <dd><strong>{median?.toLocaleString("es-CL") ?? "—"}</strong><span>{covered} de {deals.length} verificados</span></dd>
        </div>)}
      </dl>
      <div className="loss-ghosting-summary-stage">
        <p>{modalStages.length > 1 ? "Etapas anteriores más frecuentes (empate)" : "Etapa anterior más frecuente"}</p>
        <strong>{modalStages.length ? modalStages.join(" · ") : "Sin etapa verificada"}</strong>
        {stageCovered > 0 && <small>{stageFrequency} de {stageCovered} con etapa verificada{modalStages.length > 1 ? " por cada etapa" : ""}{stageCovered < deals.length ? ` · ${deals.length - stageCovered} sin verificar` : ""}</small>}
      </div>
      <details className="loss-ghosting-stage-breakdown">
        <summary>Ver distribución de etapas anteriores</summary>
        <LossGhostingOrigins deals={deals} evidence={evidence} loading={false} />
      </details>
    </>}
  </section>;
}

export function LossGhostingActivity({ activity, loading }: { activity?: GhostingActivity | undefined; loading: boolean }) {
  const status = ghostingMinimum(activity);
  const Icon = status === "met" ? Check : status === "short" ? AlertTriangle : CircleHelp;

  return <div className="loss-ghosting-activity">
    <p><strong>Etapa anterior a perdido</strong> · {loading ? "Consultando HubSpot…" : activity?.originStage ?? unknownStage}</p>
    <div className="loss-ghosting-status" data-status={status}>
      <Icon size={14} aria-hidden="true" />{loading ? "Consultando HubSpot…" : GHOSTING_STATUS_LABELS[status]}
    </div>
    <dl className="loss-ghosting-counts">
      {GHOSTING_CHANNELS.map(([channel, label]) => {
        const count = activity?.[channel] ?? null;
        return <div key={channel} data-status={count === null ? "unknown" : count < GHOSTING_MINIMUM ? "short" : "met"}>
          <dt>{label}</dt>
          <dd>{count === null ? <span aria-label="Sin verificar">—</span> : <><strong>{count}</strong><span> / {GHOSTING_MINIMUM}</span></>}</dd>
        </div>;
      })}
      <div>
        <dt>Reuniones previas completadas</dt>
        <dd>{activity?.meetings ? <strong>{activity.meetings.completedIds.length}</strong> : <span aria-label="Sin verificar">—</span>}</dd>
      </div>
    </dl>
    {!!activity?.meetings?.unverified && <p>{activity.meetings.unverified} {activity.meetings.unverified === 1 ? "reunión sin verificar" : "reuniones sin verificar"}</p>}
  </div>;
}
