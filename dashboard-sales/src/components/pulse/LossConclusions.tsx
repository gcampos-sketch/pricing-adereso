import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import { buildLossConclusions } from "@/lib/loss-conclusions";
import type { InsightDeal } from "@/lib/insights-types";
import type { LossDealSelection } from "./LossDealDrawer";
import { money, pct } from "./insights-shared";
import "./LossConclusions.css";

export function LossConclusions({ deals, scope, onOpen }: {
  deals: InsightDeal[];
  scope: string;
  onOpen: (selection: LossDealSelection) => void;
}) {
  const { total, priorities, unspecified, sharedStage } = useMemo(() => buildLossConclusions(deals), [deals]);

  return <section className="rep-chart loss-conclusions" aria-labelledby="loss-conclusions-title">
    <header className="loss-conclusions-heading">
      <h2 id="loss-conclusions-title" className="pulse-h2">Conclusiones y recomendaciones</h2>
      {total > 0 && <p>{total} {total === 1 ? "deal perdido" : "deals perdidos"} · {scope}</p>}
    </header>
    {total === 0 ? <p className="loss-conclusions-empty">Sin deals perdidos en este alcance.</p> : <>
      {sharedStage && <div className="loss-conclusions-shared">
        <div>
          <h3>Punto en común en {sharedStage.label}</h3>
          <p><strong>{sharedStage.deals.length} de {sharedStage.total}</strong> deals de los motivos priorizados tienen {sharedStage.label} como última etapa registrada. Usa esa revisión para confirmar con el cliente qué podría frenar la decisión.</p>
        </div>
        <button type="button" className="cell-button loss-conclusion-link" aria-haspopup="dialog"
          onClick={() => onOpen({ title: `Motivos priorizados · ${sharedStage.label}`, deals: sharedStage.deals, scope, filterReasons: true, records: true })}>
          Ver {sharedStage.deals.length} deals <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      </div>}
      {priorities.length ? <div className="loss-conclusions-grid">
        {priorities.map(group => <article key={group.reason} className="loss-conclusion">
          <header>
            <h3>{group.reason}</h3>
            {(group.leadsMrr || group.leadsCount) && <p className="loss-conclusion-rank">
              {group.leadsMrr && group.leadsCount ? "Mayor MRR y frecuencia" : group.leadsMrr ? "Mayor MRR perdido" : "Motivo más frecuente"}
            </p>}
          </header>
          <dl className="loss-conclusion-evidence">
            <div><dt>{group.count === 1 ? "Deal perdido" : "Deals perdidos"}</dt><dd><strong>{group.count}</strong><span> · {pct(group.dealShare)}</span></dd></div>
            <div><dt>MRR perdido</dt><dd><strong>{money(group.mrr)}</strong>{group.mrrShare !== null && <span> · {pct(group.mrrShare)}</span>}</dd></div>
          </dl>
          {group.stage && <p className="loss-conclusion-stage">{group.stage.count} de {group.count} con <strong>{group.stage.label}</strong> como última etapa registrada</p>}
          <div className="loss-conclusion-recommendation">
            <h4>Qué cambiar</h4>
            <p>{group.recommendation.action}</p>
            <p className="loss-conclusion-measure"><strong>Qué medir</strong> {group.recommendation.measure}</p>
          </div>
          <button type="button" className="cell-button loss-conclusion-link" aria-haspopup="dialog"
            aria-label={`Ver evidencia de ${group.reason}`}
            onClick={() => onOpen({ title: group.reason, deals: group.deals, scope, reasonWords: true, records: true })}>
            Ver deals <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        </article>)}
      </div> : <p className="loss-conclusions-empty">Los deals de este alcance no tienen un motivo específico registrado.</p>}
      {unspecified.length > 0 && <div className="loss-conclusions-coverage">
        <p><strong>{unspecified.length} de {total} sin motivo específico.</strong> Revisa sus comentarios y completa la causa cuando haya evidencia.</p>
        <button type="button" className="cell-button loss-conclusion-link" aria-haspopup="dialog"
          onClick={() => onOpen({ title: "Deals sin motivo específico", deals: unspecified, scope, records: true })}>
          Revisar deals <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      </div>}
      {priorities.length > 0 && <p className="loss-conclusions-footnote">Se priorizan motivos específicos. Los porcentajes se calculan sobre todas las pérdidas del alcance.</p>}
    </>}
  </section>;
}
