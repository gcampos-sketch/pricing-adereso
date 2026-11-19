import * as Dialog from "@radix-ui/react-dialog";
import { ChevronRight, X } from "lucide-react";
import type { InsightDeal } from "@/lib/insights-types";
import { closeMonthKey } from "@/lib/deal-month-summary";
import { summarizeLossByOwner } from "@/lib/loss-summary";
import type { LossDealSelection } from "./LossDealDrawer";
import { money } from "./insights-shared";

export type LossMeasure = "amount" | "count" | "ticket";

const measureLabels: Record<LossMeasure, string> = {
  amount: "MRR perdido",
  count: "Deals perdidos",
  ticket: "Ticket medio perdido",
};
const monthFormat = new Intl.DateTimeFormat("es-CL", { month: "short", year: "numeric", timeZone: "UTC" });
const valueOf = (measure: LossMeasure, mrr: number, count: number) =>
  measure === "count" ? count : measure === "ticket" ? (count ? mrr / count : null) : mrr;
const formatValue = (measure: LossMeasure, value: number | null) =>
  value === null ? "—" : measure === "count" ? value.toLocaleString("es-CL") : money(value);

export function LossExecutiveSummary({ deals, scope, measure, onOpenDeals, onClose, restoreFocus }: {
  deals: InsightDeal[];
  scope: string;
  measure: LossMeasure;
  onOpenDeals: (selection: LossDealSelection) => void;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const title = measureLabels[measure];
  const unique = [...new Map(deals.map(deal => [deal.id, deal])).values()];
  const { count, mrr, owners } = summarizeLossByOwner(unique);
  const ownerRows = owners.map(owner => ({ ...owner, value: valueOf(measure, owner.mrr, owner.count) ?? 0 }))
    .sort((a, b) => b.value - a.value || b.count - a.count || a.name.localeCompare(b.name, "es"));
  const min = Math.min(0, ...ownerRows.map(row => row.value));
  const max = Math.max(0, ...ownerRows.map(row => row.value));
  const span = max - min || 1;
  const months = new Map<string, InsightDeal[]>();
  for (const deal of unique) {
    const key = closeMonthKey(deal.closeDateValue) ?? "";
    const group = months.get(key) ?? [];
    group.push(deal);
    months.set(key, group);
  }
  const monthRows = [...months].sort(([a], [b]) => (a || "9999").localeCompare(b || "9999"))
    .map(([key, rows]) => ({
      key, rows,
      label: key ? monthFormat.format(new Date(`${key}-01T00:00:00Z`)) : "Sin fecha de cierre",
      value: valueOf(measure, summarizeLossByOwner(rows).mrr, rows.length),
    }));

  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="loss-executive-backdrop" />
      <Dialog.Content className="loss-executive" onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(); }}>
        <header className="scenario-drawer-heading">
          <div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{scope}</Dialog.Description></div>
          <Dialog.Close type="button" aria-label="Cerrar resumen de pérdidas"><X size={18} aria-hidden="true" /></Dialog.Close>
        </header>
        <div className="loss-executive-body">
          <div className="loss-executive-top">
            <div>
              <strong>{formatValue(measure, valueOf(measure, mrr, count))}</strong>
              <p>{measure === "count" ? `${money(mrr)} USD de MRR perdido` :
                `${count} ${count === 1 ? "deal" : "deals"} · ${measure === "ticket" ? "MRR promedio en USD, incluye deals de $0" : "MRR en USD"}`}</p>
            </div>
            {count > 0 && <button type="button" className="cell-button" aria-haspopup="dialog"
              onClick={() => onOpenDeals({ title, deals: unique, scope })}>Ver todos los deals <ChevronRight size={15} aria-hidden="true" /></button>}
          </div>
          {count > 0 ? <>
            <section aria-label="Por fecha de cierre">
              <h3>Por fecha de cierre</h3>
              <div className="loss-executive-months">
                {monthRows.map(month => <button key={month.key} type="button" aria-haspopup="dialog"
                  onClick={() => onOpenDeals({ title: `${title} · ${month.label}`, deals: month.rows, scope })}>
                  <span>{month.label}</span><strong>{formatValue(measure, month.value)}</strong>
                  {measure !== "count" && <small>{month.rows.length} {month.rows.length === 1 ? "deal" : "deals"}</small>}
                </button>)}
              </div>
            </section>
            <section className="loss-ticket-owners" aria-label={`${title} por comercial`}>
              <h3>{title} por comercial</h3>
              <ul className="loss-ticket-bars">
                {ownerRows.map(owner => <li key={owner.id}>
                  <button type="button" className="owner-bar-row loss-owner-button" aria-haspopup="dialog"
                    onClick={() => onOpenDeals({
                      title: owner.name, scope: `${title} · ${scope}`,
                      deals: unique.filter(deal => (deal.ownerId || "") === owner.id),
                    })}>
                    <span className="loss-ticket-owner">{owner.name}
                      {measure !== "count" && <small>{owner.count} {owner.count === 1 ? "deal" : "deals"}</small>}
                    </span>
                    <span className="owner-bar-track" aria-hidden="true"><span style={{
                      insetInlineStart: `${(Math.min(owner.value, 0) - min) / span * 100}%`,
                      width: `${Math.abs(owner.value) / span * 100}%`,
                    }} /></span>
                    <strong className="owner-bar-amount">{formatValue(measure, owner.value)}</strong>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </li>)}
              </ul>
            </section>
          </> : <p className="empty-state">Sin deals perdidos con los filtros seleccionados.</p>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
