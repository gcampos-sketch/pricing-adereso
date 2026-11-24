import type { InsightDeal } from "./insights-types";
import { lossNarrativeText } from "./loss-reason-words";

type ReasonDeal = Pick<InsightDeal, "id" | "name" | "url" | "owner" | "lostStage" | "lostReasonNarrative">;

const topics = [
  { label: "Presupuesto disponible", pattern: /\b(presupuestos?|budget|fondos|recorte presupuestario)\b/ },
  { label: "Precio, costos o descuentos", pattern: /\b(costos?|costos[ao]s?|precios?|car[ao]s?|descuentos?)\b/ },
  { label: "Otra prioridad o postergación", pattern: /\b(prioridad(?:es)?|desprioriz\w*|aplaz\w*|posterg\w*|pospon\w*|retomar|proximo trimestre|proximo ano)\b/ },
  { label: "Otro proveedor o plataforma", pattern: /\b(otro proveedor|otra plataforma|competidor(?:es)?|competencia)\b/ },
  { label: "Solución desarrollada internamente", pattern: /\b(in[ -]?house|sistema interno|solucion interna|desarrollo propio)\b/ },
  { label: "Falta de respuesta o reuniones fallidas", pattern: /\b(no (?:(?:volvi(?:o|eron)|vuelven?) a )?respond\w*|sin respuesta|dej\w* de responder|no (?:asisti\w*|apareci\w*)|no contesta\w*)\b/ },
  { label: "Cambio de contacto o equipo", pattern: /\b(ya no trabaja|se fue de|cambio de (?:contacto|equipo|contraparte)|nuev[ao] (?:contraparte|contacto)|renunci\w*|salio de la empresa)\b/ },
  { label: "Funcionalidad, integración o requisitos técnicos", pattern: /\b(funcionalidad(?:es)?|integra(?:cion(?:es)?|r)|voicebot|deuda tecnica|soc ?2|fuera de (?:scope|alcance)|requisitos? tecnicos?)\b/ },
  { label: "Aprobación o decisión interna", pattern: /\b(comite|licitacion|aprobacion|aprob\w* intern\w*|decision interna|visto bueno|gerencia)\b/ },
  { label: "Falta de interés o necesidad", pattern: /\b(sin interes|falta de interes|no (?:hay|hubo|tiene[n]?) interes|interes perdido|no (?:lo )?necesita[n]?|sin (?:real )?intencion|nunca hubo (?:real )?intencion)\b/ },
];

export function buildLossReasonSummary(deals: readonly ReasonDeal[], available: boolean) {
  const unique = [...new Map(deals.map(deal => [deal.id, deal])).values()];
  const stages = new Map<string, number>();
  for (const deal of unique) {
    const stage = deal.lostStage.trim() || "Sin recorrido";
    stages.set(stage, (stages.get(stage) ?? 0) + 1);
  }
  const comments = available ? unique.flatMap(deal => {
    const text = deal.lostReasonNarrative ?? "";
    const plain = lossNarrativeText(text);
    if (!plain) return [];
    const normalized = plain.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
    return [{ deal, text, topics: topics.filter(topic => topic.pattern.test(normalized)).map(topic => topic.label) }];
  }) : [];

  return {
    total: unique.length,
    comments,
    stages: [...stages].map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es")),
    topics: topics.map(({ label }) => ({ label, comments: comments.filter(comment => comment.topics.includes(label)) }))
      .filter(topic => topic.comments.length)
      .sort((a, b) => b.comments.length - a.comments.length || a.label.localeCompare(b.label, "es")),
    otherComments: comments.filter(comment => !comment.topics.length),
  };
}

export type LossReasonSummary = ReturnType<typeof buildLossReasonSummary>;
