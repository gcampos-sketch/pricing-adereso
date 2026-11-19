import { useState, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { WON_STAGES } from "@/lib/commercial-outcomes";
import type { DealDTO } from "@/lib/pulse-types";
import { commissionGroups, commissionMilestones, evaluateCommission } from "@/lib/won-commission";
import { CopySectionButton } from "./CopyControls";
import { ReportTitleScope } from "./ReportTitleScope";
import "./WonCommission.css";

type Group = (typeof commissionGroups)[number]["key"];
type Selection = { stage?: string; group?: Group };

export function WonCommission({ deals, period, owner }: {
  deals: DealDTO[];
  period: string;
  owner?: string;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const rows = deals.map(deal => ({ deal, ...evaluateCommission(deal.commissionEvidence) }));
  const stages = new Map([...WON_STAGES].map(stage => [stage, rows.filter(({ deal }) => deal.stageId === stage)]));
  const groups = new Map(commissionGroups.map(({ key }) => [key, rows.filter(row => row.group === key)]));
  const selectedRows = selection ? rows.filter(row =>
    (!selection.stage || row.deal.stageId === selection.stage) &&
    (!selection.group || row.group === selection.group),
  ) : [];
  const selectedLabel = selection && [
    selection.stage && stages.get(selection.stage)?.[0]?.deal.stageFull,
    selection.group && commissionGroups.find(item => item.key === selection.group)?.label,
  ].filter(Boolean).join(" · ");

  function select(next: Selection) {
    setSelection(current => current && current.stage === next.stage && current.group === next.group ? null : next);
  }

  function countButton(count: number, next: Selection, label: string) {
    return count ? (
      <button type="button" className="cell-button" onClick={() => select(next)}
        aria-label={`${label}, ${count} deals`}
        aria-pressed={!!selection && selection.stage === next.stage && selection.group === next.group}>
        {count}
      </button>
    ) : <span>0</span>;
  }

  return (
    <section className="won-commission">
      <header className="pulse-section-head" data-section-head="">
        <div>
          <h2 className="pulse-h2">Proyectos ganados <ReportTitleScope period={period} owner={owner} /></h2>
          <p className="pulse-section-context">
            Proyecto Solución 5% · Contrato firmado de 12 meses o más 80% · Primer MRR pagado 15%. El primer pago habilita el pago de la comisión.
          </p>
        </div>
        <CopySectionButton />
      </header>

      <div className="won-commission-overview" aria-label="Resumen de comisión">
        <button type="button" onClick={() => select({})} disabled={!rows.length}
          aria-pressed={!!selection && !selection.stage && !selection.group}>
          <strong>{rows.length}</strong><span>Deals ganados</span>
        </button>
        {commissionGroups.map(({ key, label }) => (
          <button key={key} type="button" onClick={() => select({ group: key })}
            aria-pressed={!selection?.stage && selection?.group === key}
            disabled={!groups.get(key)?.length}>
            <strong>{groups.get(key)?.length ?? 0}</strong><span>{label}</span>
          </button>
        ))}
      </div>

      {rows.some(({ deal }) => !deal.commissionEvidence) && (
        <p className="pulse-section-context" role="status">
          Este informe se generó antes de incorporar los hitos. Actualízalo para consultar los estados.
        </p>
      )}

      {rows.length ? (
        <>
          <h3 className="pulse-h3">Etapa actual y estado para comisionar</h3>
          <div className="table-wrap">
            <table className="pulse-table">
              <thead><tr>
                <th scope="col">Etapa actual</th>
                <th scope="col">Ganados</th>
                {commissionGroups.map(({ key, label }) => <th scope="col" key={key}>{label}</th>)}
              </tr></thead>
              <tbody>
                {[...stages].map(([stage, stageRows]) => {
                  if (!stageRows?.length) return null;
                  const label = stageRows[0]!.deal.stageFull;
                  return <tr key={stage}>
                    <th scope="row">{label}</th>
                    <td>{countButton(stageRows.length, { stage }, label)}</td>
                    {commissionGroups.map(({ key, label: groupLabel }) => (
                      <td key={key}>{countButton(stageRows.filter(row => row.group === key).length,
                        { stage, group: key }, `${label} · ${groupLabel}`)}</td>
                    ))}
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className="empty-state">Sin deals ganados en este corte.</p>}

      {selection && (
        <section className="won-commission-detail" aria-label="Detalle por deal">
          <header className="pulse-section-head">
            <div>
              <h3 className="pulse-h3">{selectedLabel || "Todos los deals ganados"}</h3>
              <p className="pulse-section-context">{selectedRows.length} deals · hitos registrados en HubSpot</p>
            </div>
            <button type="button" className="cell-button" onClick={() => setSelection(null)}>Cerrar detalle</button>
          </header>
          <div className="table-wrap">
            <table className="pulse-table">
              <thead><tr>
                <th scope="col">Deal</th>
                {commissionMilestones.map(({ key, label, weight }) => (
                  <th scope="col" key={key}>{label}<small>{weight}%{key === "firstMrr" ? " · gatillo de pago" : ""}</small></th>
                ))}
                <th scope="col">Avance de hitos</th>
              </tr></thead>
              <tbody>
                {selectedRows.map(({ deal, states, progress }) => (
                  <tr key={deal.id}>
                    <th scope="row">
                      <a href={deal.url} target="_blank" rel="noreferrer">{deal.name} <ArrowUpRight size={13} aria-hidden="true" /></a>
                      <small>{deal.stageFull} · {deal.owner}</small>
                    </th>
                    {commissionMilestones.map(({ key }) => (
                      <td key={key}>
                        <span className="chip" data-tone={states[key] === "Cumple" ? "ok" : states[key] === "Pendiente" ? "warn" : "neutral"}>
                          {states[key]}
                        </span>
                        <small>{(key === "contract" ? deal.contractStatus : null) ?? deal.commissionEvidence?.[key]}</small>
                      </td>
                    ))}
                    <td><strong>{progress}%</strong><small>{states.firstMrr === "Cumple" ? "Gatillo cumplido" : "Pago de comisión sin habilitar"}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}

export function WonOperations({ children }: { children: ReactNode }) {
  return (
    <details className="won-operations">
      <summary>Seguimiento operativo <ChevronDown size={16} aria-hidden="true" /></summary>
      {children}
    </details>
  );
}
