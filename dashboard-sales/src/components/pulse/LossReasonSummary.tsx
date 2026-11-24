import { useMemo } from "react";
import { buildLossReasonSummary, type LossReasonSummary as Summary } from "@/lib/loss-reason-summary";
import type { InsightDeal } from "@/lib/insights-types";
import "./LossReasonSummary.css";

function LossComments({ comments }: { comments: Summary["comments"] }) {
  return <ul className="loss-reason-comments">
    {comments.map(({ deal, text }) => <li key={deal.id}>
      <a href={deal.url} target="_blank" rel="noopener noreferrer">{deal.name}</a>
      <small>{deal.owner || "Sin comercial"} · {deal.lostStage || "Sin recorrido"}</small>
      <blockquote>{text}</blockquote>
    </li>)}
  </ul>;
}

export function LossReasonSummary({ deals, available, showAllComments = false }: {
  deals: readonly InsightDeal[];
  available: boolean;
  showAllComments?: boolean;
}) {
  const summary = useMemo(() => buildLossReasonSummary(deals, available), [deals, available]);
  const { total, opening, comments, stages, topics, otherComments } = summary;
  if (!total) return null;

  return <section className="loss-reason-summary" aria-label="Resumen de los comentarios de pérdida">
    <h4>¿Por qué se perdieron?</h4>
    {available && comments.length > 0 && <div className="loss-reason-opening">
      <p>{opening.findings.length ? opening.findings.map(({ subject, count }) =>
        `En ${count} de ${comments.length} ${comments.length === 1 ? "comentario" : "comentarios"} se registró ${subject}.`).join(" ")
        : opening.examples.length ? "Los comentarios describen situaciones particulares. Estos son los ejemplos registrados."
        : "Los comentarios disponibles dan poco detalle sobre qué llevó al cierre."}</p>
      {opening.examples.length > 0 && <ul aria-label="Deals que respaldan el resumen">
        {opening.examples.map(({ deal, text }) => <li key={`${deal.id}:${text}`}>
          <a href={deal.url} target="_blank" rel="noopener noreferrer">{deal.name}</a>
          <blockquote>«{text}»</blockquote>
        </li>)}
      </ul>}
    </div>}
    {available && !comments.length && <p>Sin explicaciones de cierre registradas para estos deals.</p>}
    <p>{available ? `${comments.length} de ${total} con comentario en Closed Lost Reason` :
      "Actualiza el dashboard para cargar los comentarios de cierre."}</p>
    {stages.length === 1 ? <p><strong>Última etapa registrada</strong> · {stages[0]!.label}</p> :
      <details className="loss-reason-summary-detail">
        <summary>Última etapa registrada · {stages[0]!.label} ({stages[0]!.count} de {total})</summary>
        <ul>{stages.map(stage => <li key={stage.label}>{stage.label} · {stage.count} de {total}</li>)}</ul>
      </details>}
    {available && comments.length > 0 && <>
      <div className="loss-reason-topics">
        <h5>Temas mencionados</h5>
        <p>Detectados por frases del comentario. Un deal puede mencionar varios temas.</p>
        {topics.length ? topics.map(topic => <details className="loss-reason-summary-detail" key={topic.label}>
          <summary><strong>{topic.label}</strong><span>{topic.comments.length} de {comments.length}</span></summary>
          <LossComments comments={topic.comments} />
        </details>) : <p>Los comentarios no contienen frases de los temas reconocidos.</p>}
      </div>
      {!!otherComments.length && <details className="loss-reason-summary-detail">
        <summary>Comentarios sin tema reconocido · {otherComments.length}</summary>
        <LossComments comments={otherComments} />
      </details>}
      {showAllComments && <details className="loss-reason-summary-detail">
        <summary>Leer todos los comentarios · {comments.length}</summary>
        <LossComments comments={comments} />
      </details>}
    </>}
  </section>;
}
