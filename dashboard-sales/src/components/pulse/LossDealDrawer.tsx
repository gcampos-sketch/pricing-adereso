import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ExternalLink, Search, X } from "lucide-react";
import { GHOSTING_CHANNELS, GHOSTING_MINIMUM, GHOSTING_STATUS_LABELS, GHOSTING_STATUS_ORDER, ghostingMinimum, groupGhostingDeals, isGhostingLoss, type GhostingActivity } from "@/lib/loss-ghosting";
import { useLossGhosting } from "@/hooks/use-loss-ghosting";
import { LossGhostingActivity, LossGhostingSummary } from "./LossGhostingActivity";
import type { InsightDeal } from "@/lib/insights-types";
import { CopyDealLinksButton } from "./CopyControls";
import { LossReasonSummary } from "./LossReasonSummary";
import { LossReasonWords } from "./LossReasonWords";
import { money, sum } from "./insights-shared";

export type LossDealSelection = {
  title: string;
  scope: string;
  deals: InsightDeal[];
  reasonWords?: boolean;
  records?: boolean;
  filterReasons?: boolean;
};

function ghostingCopyDetails(activity: GhostingActivity | undefined, loading: boolean) {
  if (loading) return ["Seguimiento de Ghosting: verificando historial en HubSpot"];
  return [
    `Etapa anterior a perdido: ${activity?.originStage ?? "Sin verificar"}`,
    `Seguimiento: ${GHOSTING_STATUS_LABELS[ghostingMinimum(activity)]}`,
    GHOSTING_CHANNELS.map(([channel, label]) =>
      `${label}: ${activity?.[channel] == null ? "sin verificar" : `${activity[channel]} / ${GHOSTING_MINIMUM}`}`).join(" · "),
    `Reuniones previas completadas: ${activity?.meetings?.completedIds.length ?? "sin verificar"}${activity?.meetings?.unverified ? ` · ${activity.meetings.unverified} sin verificar` : ""}`,
  ];
}

export function LossDealDrawer({ selection, narrativesAvailable, onClose, restoreFocus }: {
  selection: LossDealSelection;
  narrativesAvailable: boolean;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const deals = useMemo(() => [...new Map(selection.deals.map(deal => [deal.id, deal])).values()]
    .sort((a, b) => b.amountValue - a.amountValue || a.name.localeCompare(b.name, "es")), [selection.deals]);
  const ghosting = useLossGhosting(deals);
  const reasons = [...new Set(deals.map(deal => deal.lostReason || "Sin motivo listado"))].sort((a, b) => a.localeCompare(b, "es"));
  const search = query.trim().toLocaleLowerCase("es");
  const rows = deals.filter(deal =>
    (!reason || (deal.lostReason || "Sin motivo listado") === reason) &&
    (!search || [deal.name, deal.owner, deal.lostReason].some(value => value?.toLocaleLowerCase("es").includes(search))));
  const ghostRows = rows.filter(deal => isGhostingLoss(deal.lostReason));
  const evidence = ghosting.data?.evidence;
  const loadingGhosting = ghosting.isPending && ghosting.isFetching;
  const ghostGroups = groupGhostingDeals(ghostRows, evidence);
  const orderedGhosts = GHOSTING_STATUS_ORDER.flatMap(status => ghostGroups[status]);
  const groupByMinimum = ghostRows.length > 0 && ghostRows.length === rows.length && !loadingGhosting;
  const ghostOrder = orderedGhosts.values();
  const orderedRows = loadingGhosting ? rows : rows.map(deal =>
    isGhostingLoss(deal.lostReason) ? ghostOrder.next().value ?? deal : deal);
  const incompleteEvidence = ghosting.data?.incomplete || ghostRows.some(({ id }) => {
    const activity = evidence?.[id];
    return !activity || Object.values(activity).some(count => count === null) || !!activity.meetings?.unverified;
  });
  const count = rows.length === deals.length ? String(deals.length) : `${rows.length} de ${deals.length}`;

  const totalMrr = `${money(sum(rows, deal => deal.amountValue))} USD de MRR`;
  const showRecords = selection.records || selection.reasonWords;
  const commentOf = (deal: InsightDeal) => selection.reasonWords
    ? (narrativesAvailable ? deal.lostReasonNarrative?.trim() || "Sin comentario de cierre registrado" : "Comentario de cierre pendiente de actualización")
    : deal.lostReasonText || "Sin comentario registrado";
  const stageOf = (deal: InsightDeal) =>
    `${deal.lostStage || "Sin recorrido"} · ${deal.lostStageDays > 0 ? `${deal.lostStageDays} días` : "Sin duración registrada"}`;

  const renderDeal = (deal: InsightDeal) => <li key={deal.id}>
    <div>
      <a href={deal.url} target="_blank" rel="noopener noreferrer">{deal.name}<ExternalLink size={12} aria-hidden="true" /></a>
      <small>{[deal.owner || "Sin comercial", deal.lostReason || "Sin motivo listado"].join(" · ")}</small>
      {showRecords && <details className="loss-deal-record" open={rows.length === 1 ? true : undefined}>
        <summary>{isGhostingLoss(deal.lostReason) ? "Comentario de cierre" : "Comentario y etapa"}</summary>
        {!isGhostingLoss(deal.lostReason) && <small>{stageOf(deal)}</small>}
        <p>{commentOf(deal)}</p>
      </details>}
    </div>
    <span><strong>{money(deal.amountValue)}</strong><small>MRR perdido</small></span>
    {isGhostingLoss(deal.lostReason) &&
      <LossGhostingActivity activity={evidence?.[deal.id]} loading={loadingGhosting} />}
  </li>;

  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="scenario-drawer-backdrop" />
      <Dialog.Content className="scenario-drawer loss-deal-drawer"
        onEscapeKeyDown={event => event.stopPropagation()}
        onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(); }}>
        <header className="scenario-drawer-heading">
          <div><Dialog.Title>{selection.title}</Dialog.Title><Dialog.Description>{selection.scope}</Dialog.Description></div>
          <CopyDealLinksButton title="Copiar todo · Deals de esta lista" disabled={!rows.length}
            heading={[selection.title, selection.scope, `${count} ${deals.length === 1 ? "deal" : "deals"} · ${totalMrr}`]}
            getDeals={() => orderedRows.map(deal => {
              const ghost = isGhostingLoss(deal.lostReason);
              return { name: deal.name, url: deal.url, details: [
                `Comercial: ${deal.owner || "Sin comercial"} · Motivo: ${deal.lostReason || "Sin motivo listado"} · MRR perdido: ${money(deal.amountValue)} USD`,
                ...(showRecords && !ghost ? [`Última etapa registrada: ${stageOf(deal)}`] : []),
                ...(showRecords ? [`Comentario de cierre: ${commentOf(deal)}`] : []),
                ...(ghost ? ghostingCopyDetails(evidence?.[deal.id], loadingGhosting) : []),
              ] };
            })} />
          <Dialog.Close type="button" aria-label="Cerrar lista de deals"><X size={18} aria-hidden="true" /></Dialog.Close>
        </header>
        <div className="scenario-drawer-body">
          {selection.reasonWords && !ghostRows.length && <LossReasonSummary deals={rows} available={narrativesAvailable} />}
          <div className="loss-deal-tools">
            {deals.length > 1 && <label className="loss-deal-search">
              <Search size={15} aria-hidden="true" /><input type="search" placeholder="Buscar deal o comercial" aria-label="Buscar deal o comercial" value={query} onChange={event => setQuery(event.target.value)} />
            </label>}
            {selection.filterReasons && reasons.length > 1 && <label className="loss-deal-reasons">Motivo
              <select value={reason} onChange={event => setReason(event.target.value)}>
                <option value="">Todos los motivos</option>
                {reasons.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>}
            <p role="status"><strong>{count} {deals.length === 1 ? "deal" : "deals"}</strong><span>{totalMrr}</span></p>
          </div>
          {ghostRows.length > 0 && <LossGhostingSummary deals={ghostRows} evidence={evidence} loading={loadingGhosting} />}
          {ghostRows.length > 0 && <div className="loss-ghosting-caption">
            <p>Mínimo por deal · 2 llamadas, 2 mensajes nativos de WhatsApp y 2 correos registrados en HubSpot. Reuniones completadas desde la creación del deal hasta antes de su entrada a perdido.</p>
            {incompleteEvidence && !ghosting.isFetching && <button type="button" className="cell-button" onClick={() => void ghosting.refetch()}>Verificar de nuevo</button>}
          </div>}
          {selection.reasonWords && ghostRows.length > 0 && <LossReasonSummary deals={rows} available={narrativesAvailable} />}
          {selection.reasonWords && rows.length > 0 && <details className="loss-drawer-words">
            <summary>Palabras en los motivos de pérdida</summary>
            <LossReasonWords deals={rows} available={narrativesAvailable} compact initialLimit={6} />
          </details>}
          {groupByMinimum ? GHOSTING_STATUS_ORDER.map(status => {
            const group = ghostGroups[status];
            return group.length > 0 && <section className="loss-ghosting-group" key={status} aria-label={GHOSTING_STATUS_LABELS[status]}>
              <h3 className="loss-ghosting-status" data-status={status}>{GHOSTING_STATUS_LABELS[status]} <span>{group.length}</span></h3>
              <ul className="loss-cluster-deals">{group.map(renderDeal)}</ul>
            </section>;
          }) : rows.length > 0 ? <ul className="loss-cluster-deals" aria-label="Deals perdidos">
            {orderedRows.map(renderDeal)}
          </ul> : <p className="empty-state">{deals.length ? "Ningún deal coincide con la búsqueda o el motivo." : "Sin deals en esta selección."}</p>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
