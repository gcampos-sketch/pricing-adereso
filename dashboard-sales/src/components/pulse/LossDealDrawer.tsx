import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ExternalLink, Search, X } from "lucide-react";
import type { InsightDeal } from "@/lib/insights-types";
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
  const reasons = [...new Set(deals.map(deal => deal.lostReason || "Sin motivo listado"))].sort((a, b) => a.localeCompare(b, "es"));
  const search = query.trim().toLocaleLowerCase("es");
  const rows = deals.filter(deal =>
    (!reason || (deal.lostReason || "Sin motivo listado") === reason) &&
    (!search || [deal.name, deal.owner, deal.lostReason].some(value => value?.toLocaleLowerCase("es").includes(search))));
  const count = rows.length === deals.length ? String(deals.length) : `${rows.length} de ${deals.length}`;

  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="scenario-drawer-backdrop" />
      <Dialog.Content className="scenario-drawer loss-deal-drawer"
        onEscapeKeyDown={event => event.stopPropagation()}
        onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(); }}>
        <header className="scenario-drawer-heading">
          <div><Dialog.Title>{selection.title}</Dialog.Title><Dialog.Description>{selection.scope}</Dialog.Description></div>
          <Dialog.Close type="button" aria-label="Cerrar lista de deals"><X size={18} aria-hidden="true" /></Dialog.Close>
        </header>
        <div className="scenario-drawer-body">
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
            <p role="status"><strong>{count} {deals.length === 1 ? "deal" : "deals"}</strong><span>{money(sum(rows, deal => deal.amountValue))} USD de MRR</span></p>
          </div>
          {selection.reasonWords && rows.length > 0 && <details className="loss-drawer-words">
            <summary>Palabras en los motivos de pérdida</summary>
            <LossReasonWords deals={rows} available={narrativesAvailable} compact initialLimit={6} />
          </details>}
          {rows.length > 0 ? <ul className="loss-cluster-deals" aria-label="Deals perdidos">
            {rows.map(deal => <li key={deal.id}>
              <div>
                <a href={deal.url} target="_blank" rel="noopener noreferrer">{deal.name}<ExternalLink size={12} aria-hidden="true" /></a>
                <small>{[deal.owner || "Sin comercial", deal.lostReason || "Sin motivo listado"].join(" · ")}</small>
                {selection.records && <details className="loss-deal-record">
                  <summary>Comentario y actividad</summary>
                  <small>{deal.lostStage || "Sin recorrido"} · {deal.lostStageDays > 0 ? `${deal.lostStageDays} días` : "Sin duración registrada"}</small>
                  <p>{deal.lostReasonText || "Sin comentario registrado"}</p>
                  <small>{deal.ghost ? `${deal.ghost.emails} correos · ${deal.ghost.calls} llamadas · ${deal.ghost.whatsapp ?? "s/d"} WhatsApp` : "Sin cobertura de actividad"}</small>
                </details>}
              </div>
              <span><strong>{money(deal.amountValue)}</strong><small>MRR perdido</small></span>
            </li>)}
          </ul> : <p className="empty-state">{deals.length ? "Ningún deal coincide con la búsqueda o el motivo." : "Sin deals en esta selección."}</p>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
