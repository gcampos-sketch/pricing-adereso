import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Drilldown } from "@/lib/pulse-types";
import { getWarningDeals } from "@/lib/warning-deals.functions";
import { WARNING_HEALTH, WARNING_PROPERTIES, warningHealth, type WarningDetail, type WarningProperty } from "@/lib/warning-deals";
import "./WarningDealsDialog.css";

const dateFormat = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Coyhaique", dateStyle: "medium" });
const duration = (days: number) => days === 0 ? "Menos de 1 día" : days === 1 ? "1 día" : `${days} días`;
const fields = Object.entries(WARNING_PROPERTIES) as [WarningProperty, string][];
type Filter = "owner" | "origin" | "health" | "age" | "reason" | "alert" | "delay";
type Option = [string, string];
const optionsOf = (values: string[]): Option[] => [...new Set(values)].sort((a, b) => a.localeCompare(b, "es")).map(value => [value, value]);

export function WarningDealsDialog({ payload, readAt, onClose }: { payload: Drilldown; readAt: string; onClose: () => void }) {
  const deals = [...new Map(payload.deals.map(deal => [deal.id, deal])).values()];
  const idsKey = JSON.stringify(deals.map(deal => deal.id).sort());
  const [filters, setFilters] = useState<Partial<Record<Filter, string>>>({});
  const trigger = useRef<HTMLElement | null>(null);
  const [retry, setRetry] = useState(0);
  const requestKey = JSON.stringify([idsKey, readAt, retry]);
  const [response, setResponse] = useState<{ key: string; rows: Record<string, WarningDetail | null> }>();

  useEffect(() => {
    let cancelled = false;
    const ids: string[] = JSON.parse(idsKey);
    void (async () => {
      const rows: Record<string, WarningDetail | null> = {};
      for (let i = 0; i < ids.length; i += 50) {
        try {
          Object.assign(rows, await getWarningDeals({ data: { ids: ids.slice(i, i + 50) } }));
        } catch {
          // Missing results remain visible as unverified. Other batches can still succeed.
        }
        if (cancelled) return;
      }
      setResponse({ key: requestKey, rows });
    })();
    return () => { cancelled = true; };
  }, [idsKey, requestKey]);

  const results = response?.key === requestKey ? response.rows : undefined;
  const rows = deals.flatMap(deal => {
    const detail = results?.[deal.id];
    if (detail === null) return [];
    const days = detail?.days ?? null;
    const alerts = fields.filter(([field]) => field.startsWith("alerta_") && detail?.fields[field]?.length).map(([field, label]) => label);
    return [{
      deal, detail, alerts, owner: deal.ownerId || "unassigned", health: warningHealth(detail),
      origin: detail?.previousStage ?? "Sin origen verificable",
      age: days === null ? "unknown" : days >= 30 ? "30" : days >= 7 ? "7" : "0",
      reasons: detail?.fields.motivo_deal_warning ?? [],
    }];
  });
  const missing = results ? rows.filter(row => !row.detail).length : 0;
  const visible = rows.filter(row =>
    (!filters.owner || row.owner === filters.owner)
      && (!filters.origin || row.origin === filters.origin)
      && (!filters.health || row.health === filters.health)
      && (!filters.age || row.age === filters.age)
      && (!filters.reason || row.reasons.includes(filters.reason))
      && (!filters.alert || row.alerts.includes(filters.alert))
      && (!filters.delay || Boolean(row.detail?.fields.motivo_de_retraso?.length)),
  ).sort((a, b) => (b.detail?.days ?? -1) - (a.detail?.days ?? -1) || a.deal.name.localeCompare(b.deal.name, "es"));
  const select = (field: Filter, label: string, choices: Option[]) => (
    <label key={field}>
      <span>{label}</span>
      <select value={filters[field] ?? ""} onChange={event => setFilters(current => ({ ...current, [field]: event.target.value }))}>
        <option value="">Todos</option>
        {choices.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  );

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent
      className="warning-deals-dialog"
      onOpenAutoFocus={() => { trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={() => trigger.current?.focus({ preventScroll: true })}
    >
      <header>
        <DialogTitle>{payload.title}</DialogTitle>
        <DialogDescription>{payload.subtitle}</DialogDescription>
      </header>
      <div className="warning-deals-scroll">
        <div className="warning-deals-filters" aria-label="Filtros de Warning">
          {select("owner", "Comercial", [...new Map(rows.map(({ deal, owner }) => [owner, deal.owner || "Sin comercial"]))])}
          {select("origin", "Etapa anterior", optionsOf(rows.map(row => row.origin)))}
          {select("age", "Tiempo en Warning", [["0", "Menos de 7 días"], ["7", "7 a 29 días"], ["30", "30 días o más"], ["unknown", "Sin fecha"]])}
          {select("health", "Salud", Object.entries(WARNING_HEALTH))}
          {select("reason", "Motivo Warning", optionsOf(rows.flatMap(row => row.reasons)))}
          {select("alert", "Alerta", optionsOf(rows.flatMap(row => row.alerts)))}
          {select("delay", "Motivo de retraso", [["recorded", "Con motivo registrado"]])}
          {Object.values(filters).some(Boolean) && <button type="button" className="cell-button" onClick={() => setFilters({})}>Limpiar filtros</button>}
        </div>
        <div className="warning-deals-meta">
          <span role="status">{visible.length} de {rows.length} deals{!results && deals.length > 0 ? " · Consultando HubSpot…" : ""}{results && rows.length !== deals.length ? ` · ${deals.length - rows.length} fuera de E6.1 en Comercial` : ""}</span>
          <details>
            <summary>Criterio de salud</summary>
            <p>Crítica desde 30 días en Warning. Prioritaria desde 7 días o con una alerta operativa de Finanzas o SSPP. En observación durante los primeros 7 días sin alertas operativas. Sin evaluar cuando faltan datos para clasificar. La alerta «Deal en warning» indica la etapa.</p>
          </details>
        </div>
        {missing > 0 && <p className="warning-deals-error" role="status">
          HubSpot no devolvió datos para {missing} {missing === 1 ? "deal" : "deals"}.
          {" "}<button type="button" className="cell-button" onClick={() => setRetry(current => current + 1)}>Reintentar</button>
        </p>}
        {visible.length ? <ul className="warning-deals-list">
          {visible.map(({ deal, detail, origin, health }) => (
            <li key={deal.id} className="warning-deal">
              <div className="warning-deal-header">
                <div>
                  <a href={deal.url} target="_blank" rel="noopener noreferrer">{deal.name} <ArrowUpRight size={14} aria-hidden="true" /></a>
                  <p>{deal.owner || "Sin comercial"} · {deal.amount} MRR</p>
                </div>
                <span className="warning-deal-health" data-health={health}>{WARNING_HEALTH[health]}</span>
              </div>
              <dl className="warning-deal-timeline">
                <div><dt>En E6.1</dt><dd>{detail?.days != null ? duration(detail.days) : "Sin fecha verificada"}</dd>
                  {detail?.enteredAt && <dd className="warning-deal-note">Desde {dateFormat.format(new Date(detail.enteredAt))}</dd>}
                </div>
                <div><dt>Etapa anterior</dt><dd>{origin}{detail?.previousStage ? " → E6.1" : ""}</dd>
                  {detail?.previousDays != null && <dd className="warning-deal-note">{duration(detail.previousDays)} en la etapa anterior</dd>}
                </div>
              </dl>
              {detail && Object.keys(detail.fields).length > 0 && (
                <dl className="warning-deal-evidence">
                  {fields.map(([field, label]) => detail.fields[field]?.length ? (
                    <div key={field}><dt>{label}</dt><dd>{detail.fields[field].join(" · ")}</dd></div>
                  ) : null)}
                </dl>
              )}
            </li>
          ))}
        </ul> : <p className="warning-deals-empty">{rows.length ? "Ningún deal coincide con estos filtros." : "No hay deals en Warning para este alcance."}</p>}
      </div>
    </DialogContent>
  </Dialog>;
}
