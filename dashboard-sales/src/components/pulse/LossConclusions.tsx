import { useMemo } from "react";
import { buildLossConclusions } from "@/lib/loss-conclusions";
import { isGhostingLoss } from "@/lib/loss-ghosting";
import type { InsightDeal } from "@/lib/insights-types";
import type { LossDealSelection } from "./LossDealDrawer";
import { money, pct } from "./insights-shared";
import { LossConclusionFlip } from "./LossConclusionFlip";
import { GhostingConclusion, LossOwnerEvidence } from "./LossConclusionEvidence";
import "./LossConclusions.css";

export function LossConclusions({ deals, scope, onOpen }: {
  deals: InsightDeal[];
  scope: string;
  onOpen: (selection: LossDealSelection) => void;
}) {
  const { total, priorities, unspecified, sharedStage } = useMemo(() => buildLossConclusions(deals), [deals]);

  const view = (title: string, rows: InsightDeal[], detail?: string, showReasons?: "words" | "filter") =>
    onOpen({ title: detail ? `${title} · ${detail}` : title, deals: rows, scope,
      reasonWords: showReasons === "words", filterReasons: showReasons === "filter", records: true });

  return <section className="rep-chart loss-conclusions" aria-labelledby="loss-conclusions-title">
    <header className="loss-conclusions-heading">
      <h2 id="loss-conclusions-title" className="pulse-h2">Conclusiones y recomendaciones</h2>
      {total > 0 && <p>{total} {total === 1 ? "deal perdido" : "deals perdidos"} · {scope}</p>}
    </header>
    {total === 0 ? <p className="loss-conclusions-empty">Sin deals perdidos en este alcance.</p> : <>
      {sharedStage && <LossConclusionFlip compact label={`Punto en común en ${sharedStage.label}`}
        front={<div><h3>Punto en común en {sharedStage.label}</h3>
          <p><strong>{sharedStage.deals.length} de {sharedStage.total}</strong> deals de los motivos priorizados tienen {sharedStage.label} como última etapa registrada. Usa esa revisión para confirmar con el cliente qué podría frenar la decisión.</p></div>}
        back={<LossOwnerEvidence deals={sharedStage.deals} priority="count"
          onOpen={(rows, detail) => view(`Motivos priorizados · ${sharedStage.label}`, rows, detail, "filter")} />}
      />}
      {priorities.length ? <div className="loss-conclusions-grid">
        {priorities.map(group => {
          const front = <>
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
          </>;
          const recommendation = <div className="loss-conclusion-recommendation">
              <h4>Qué cambiar</h4>
              <p>{group.recommendation.action}</p>
              <p className="loss-conclusion-measure"><strong>Qué medir</strong> {group.recommendation.measure}</p>
          </div>;
          const openEvidence = (rows: InsightDeal[], detail?: string) => view(group.reason, rows, detail, "words");
          return isGhostingLoss(group.reason)
            ? <GhostingConclusion key={group.reason} label={group.reason} deals={group.deals} front={front} recommendation={recommendation} onOpen={openEvidence} />
            : <LossConclusionFlip key={group.reason} label={group.reason} front={<>{front}{recommendation}</>}
              back={<LossOwnerEvidence deals={group.deals} priority={(group.mrr <= 0 || (group.leadsCount && !group.leadsMrr)) ? "count" : "mrr"} onOpen={openEvidence} />} />;
        })}
      </div> : <p className="loss-conclusions-empty">Los deals de este alcance no tienen un motivo específico registrado.</p>}
      {unspecified.length > 0 && <LossConclusionFlip compact label="Deals sin motivo específico"
        front={<p><strong>{unspecified.length} de {total} sin motivo específico.</strong> Revisa sus comentarios y completa la causa cuando haya evidencia.</p>}
        back={<LossOwnerEvidence deals={unspecified} priority="count"
          onOpen={(rows, detail) => view("Deals sin motivo específico", rows, detail)} />}
      />}
      {priorities.length > 0 && <p className="loss-conclusions-footnote">Se priorizan motivos específicos. Los porcentajes se calculan sobre todas las pérdidas del alcance.</p>}
    </>}
  </section>;
}
