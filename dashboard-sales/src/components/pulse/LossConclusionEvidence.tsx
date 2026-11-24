import { ArrowUpRight, ChevronRight } from "lucide-react";
import type { InsightDeal } from "@/lib/insights-types";
import { ghostingByOwner, GHOSTING_STATUSES, lossDealsByOwner, summarizeGhosting } from "@/lib/loss-conclusion-detail";
import { useLossGhosting } from "@/hooks/use-loss-ghosting";
import { money } from "./insights-shared";
import { LossConclusionFlip } from "./LossConclusionFlip";
import { LossGhostingOrigins } from "./LossGhostingActivity";

type OpenEvidence = (deals: InsightDeal[], detail?: string) => void;

export function LossOwnerEvidence({ deals, onOpen, priority }: {
  deals: InsightDeal[];
  onOpen: OpenEvidence;
  priority: "mrr" | "count";
}) {
  const owners = lossDealsByOwner(deals);
  if (priority === "count") owners.sort((a, b) => b.deals.length - a.deals.length || b.mrr - a.mrr);
  const top = owners[0];
  const leads = top && (priority === "count"
    ? top.deals.length > (owners[1]?.deals.length ?? 0)
    : top.mrr > Math.max(0, owners[1]?.mrr ?? 0));
  return <>
    {leads && top.id && <p className="loss-conclusion-focus"><strong>Revisar primero con {top.label}</strong>
      <span>{priority === "count" ? "Mayor número de deals en este grupo." : "Mayor MRR perdido en este grupo."}</span>
    </p>}
    <h4 className="loss-conclusion-list-heading">Deals y MRR por comercial</h4>
    <ul className="loss-conclusion-owners" aria-label="Deals y MRR por comercial">
      {owners.map(owner => <li key={owner.id}><button type="button" aria-haspopup="dialog"
        aria-label={`Ver ${owner.deals.length} deals de ${owner.label}`} onClick={() => onOpen(owner.deals, owner.label)}>
        <strong>{owner.label}</strong><span>{owner.deals.length} · {money(owner.mrr)}</span><ChevronRight size={13} aria-hidden="true" />
      </button></li>)}
    </ul>
    <LossEvidenceButton onClick={() => onOpen(deals)} />
  </>;
}

function LossEvidenceButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="cell-button loss-conclusion-link" aria-haspopup="dialog" onClick={onClick}>
    Ver todos los deals <ArrowUpRight size={14} aria-hidden="true" />
  </button>;
}

type GhostingAudit = ReturnType<typeof summarizeGhosting>;

function channelNames(audit: GhostingAudit) {
  return audit.leadingChannels.map(({ label }) => label).join(" / ");
}

function GhostingChannels({ audit, pending, onOpen, owner }: {
  audit: GhostingAudit;
  pending: boolean;
  onOpen: OpenEvidence;
  owner?: string;
}) {
  return <ul className="loss-conclusion-channel-list" aria-label={owner ? `Faltantes por canal de ${owner}` : "Deals bajo el mínimo por canal"}>
    {audit.channels.map(channel => {
      const count = channel.missing.length;
      const content = <>{channel.label} <strong>{pending || !channel.verified ? "—" : count}</strong></>;
      const detail = owner ? `${owner} · Falta ${channel.label}` : `Falta ${channel.label}`;
      return <li key={channel.channel} data-leading={audit.leadingChannels.includes(channel) || undefined}>
        {!pending && count > 0
          ? <button type="button" aria-haspopup="dialog"
            aria-label={owner ? `Ver ${count} ${count === 1 ? "deal" : "deals"} de ${owner} con ${channel.label} bajo el mínimo` : undefined}
            onClick={() => onOpen(channel.missing, detail)}>{content}</button>
          : <span>{content}</span>}
      </li>;
    })}
  </ul>;
}

function GhostingStatuses({ audit, pending, onOpen, owner }: {
  audit: GhostingAudit;
  pending: boolean;
  onOpen?: OpenEvidence;
  owner?: string;
}) {
  return <ul className="loss-conclusion-statuses" data-owner-statuses={owner ? "" : undefined}
    aria-label={owner ? `Cumplimiento del 2/2/2 de ${owner}` : "Cumplimiento del 2/2/2"}>
    {GHOSTING_STATUSES.map(([key, label]) => {
      const deals = audit.groups[key];
      const value = <><strong>{pending ? "—" : deals.length}</strong><span>{label}</span></>;
      return <li key={key} data-audit-status={key}>{onOpen && !pending && deals.length
        ? <button type="button" aria-haspopup="dialog"
          aria-label={owner ? `${label} · ${owner} · ${deals.length} ${deals.length === 1 ? "deal" : "deals"}` : undefined}
          onClick={() => onOpen(deals, owner ? `${owner} · ${label}` : label)}>{value}</button>
        : <div>{value}</div>}</li>;
    })}
  </ul>;
}

export function GhostingConclusion({ label, deals, onOpen, front, recommendation }: {
  label: string;
  deals: InsightDeal[];
  onOpen: OpenEvidence;
  front: React.ReactNode;
  recommendation: React.ReactNode;
}) {
  const query = useLossGhosting(deals);
  const evidence = query.data?.evidence ?? {};
  const pending = query.isPending && query.isFetching;
  const audit = summarizeGhosting(deals, evidence);
  const owners = ghostingByOwner(deals, evidence);
  const leading = audit.leadingChannels.length > 0;
  const partial = audit.channels.some(channel => channel.verified < deals.length);
  const missingStages = deals.some(deal => !evidence[deal.id]?.originStage);
  const top = owners[0];
  const influential = top?.id && top.audit.groups.short.length > (owners[1]?.audit.groups.short.length ?? 0);
  const leadingText = leading ? `${channelNames(audit)} · ${audit.highest} ${audit.highest === 1 ? "deal" : "deals"}` : null;

  return <LossConclusionFlip label={label}
    front={<>{front}
      <GhostingStatuses audit={audit} pending={pending} />
      <p className="loss-conclusion-stage">
        {pending ? "Comprobando actividades en HubSpot…" : leadingText ? <><strong>Más faltantes verificados</strong> {leadingText}</> :
          partial ? "Cobertura insuficiente para identificar una brecha." : "Todos los canales alcanzaron el mínimo."}
      </p>
      {recommendation}
    </>}
    back={<>
      <LossGhostingOrigins deals={deals} evidence={evidence} loading={pending} onOpen={onOpen} />
      <GhostingStatuses audit={audit} pending={pending} onOpen={onOpen} />
      <div className="loss-conclusion-channels">
        <h4 className="loss-conclusion-list-heading">Deals bajo el mínimo por canal</h4>
        <GhostingChannels audit={audit} pending={pending} onOpen={onOpen} />
      </div>
      {!pending && influential && <p className="loss-conclusion-focus">
        <strong>Reforzar con {top.label}</strong>
        <span>{channelNames(top.audit) || "Seguimiento 2/2/2"} · {top.audit.groups.short.length} bajo el mínimo.</span>
      </p>}
      <h4 className="loss-conclusion-list-heading">Cumplimiento por comercial</h4>
      <ul className="loss-conclusion-owners loss-conclusion-ghost-owners" aria-label="Cumplimiento por comercial">
        {owners.map(owner => <li key={owner.id}>
          <button type="button" aria-haspopup="dialog" aria-label={`Ver seguimiento de ${owner.label}`}
            onClick={() => onOpen(owner.deals, owner.label)}>
            <strong>{owner.label}</strong>
            <span>{owner.deals.length} {owner.deals.length === 1 ? "deal" : "deals"}</span>
            <ChevronRight size={13} aria-hidden="true" />
          </button>
          <GhostingStatuses audit={owner.audit} pending={pending} onOpen={onOpen} owner={owner.label} />
          <GhostingChannels audit={owner.audit} pending={pending} onOpen={onOpen} owner={owner.label} />
          <p className="loss-conclusion-owner-meetings">
            <strong>{pending || !owner.meetings.windowsRead ? "—" : owner.meetings.completed}</strong> reuniones previas completadas
            {!pending && owner.meetings.incomplete > 0 && <> · {owner.meetings.incomplete} {owner.meetings.incomplete === 1 ? "deal" : "deals"} con datos incompletos</>}
          </p>
        </li>)}
      </ul>
      <p className="loss-conclusion-stage">Reuniones registradas desde la creación de cada deal hasta antes de su entrada a perdido.</p>
      {!pending && (partial || missingStages) && <div className="loss-conclusion-partial">
        <span>{partial ? "Los faltantes se calculan con la actividad verificable." : "Hay etapas de origen sin verificar."}</span>
        <button type="button" className="cell-button" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? "Verificando…" : "Reintentar"}
        </button>
      </div>}
      <LossEvidenceButton onClick={() => onOpen(deals)} />
    </>} />;
}
