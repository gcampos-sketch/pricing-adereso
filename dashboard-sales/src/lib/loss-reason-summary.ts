import type { InsightDeal } from "./insights-types";
import { lossNarrativeText } from "./loss-reason-words";

type ReasonDeal = Pick<InsightDeal, "id" | "name" | "url" | "owner" | "lostStage" | "lostReasonNarrative" | "lostReason">;

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

// These phrases support the opening conclusion. The broader topic list also
// includes incidental mentions, which by themselves do not explain a loss.
const explanations = [
  { subject: "falta de presupuesto", pattern: /\b(?:sin(?: el)? presupuesto|falta de (?:presupuesto|fondos)|no (?:hay|habia|tiene[n]?|tenia[n]?|tuvo|tuvieron|cuenta[n]? con) presupuesto|fuera de presupuesto|(?:se )?agoto el presupuesto|recort\w* el presupuesto)\b/ },
  { subject: "una objeción al precio", pattern: /\b(?:muy car[ao]s?|demasiado car[ao]s?|(?:propuesta|herramienta|cotizacion) (?:era |es )?(?:costosa|cara)|precio (?:era |es )?(?:alto|elevado)|(?:precio|costo) fuera de alcance)\b/ },
  { subject: "una postergación del proyecto", pattern: /\b(?:aplaz\w* (?:el )?proyecto|posterg\w* (?:el )?proyecto|no lo (?:van a ver|veran) este ano|retomar(?:lo)? (?:el proximo|en q[1-4]|en 20\d{2})|pospu\w* (?:el )?proyecto)\b/ },
  { subject: "un cambio de prioridad", pattern: /\b(?:desprioriz\w*|ya no (?:es|era) prioridad|no es (?:una )?prioridad|(?:su )?prioridad ahora es|prioriz\w* (?:otro|otra|la implementacion))\b/ },
  { subject: "la elección de otro proveedor", pattern: /\b(?:(?:eligi(?:o|eron)|escog(?:io|ieron)|contrat\w*|se fue(?:ron)? con|se quedaron? con|decidi(?:o|eron) (?:con|por)|opt(?:o|aron) por) (?:a )?(?:un |el )?(?:otro proveedor|otra plataforma|competidor|la competencia))\b/ },
  { subject: "la decisión de usar una solución interna", pattern: /\b(?:(?:desestima|descarta) (?:el )?proyecto por (?:inicio de )?(?:un )?sistema interno|(?:opt\w* por|decidi\w* (?:usar|implementar|desarrollar)) (?:un |una )?(?:sistema interno|solucion interna|desarrollo propio|in[ -]?house))\b/ },
  { subject: "la falta de respuesta del contacto", pattern: /\b(?:no (?:(?:volvi(?:o|eron)|vuelven?) a )?respond\w*|sin respuesta|dej\w* de responder|no contesta\w*)\b/ },
  { subject: "reuniones a las que el contacto no asistió", pattern: /\b(?:no (?:asisti\w*|se present\w*) (?:a|en) (?:la |las |sus |una |varias |multiples )*(?:reunion\w*|demo\w*))\b/ },
  { subject: "la salida o el cambio de la contraparte", pattern: /\b(?:ya no trabaja (?:en|con)|se fue de|renunci\w* al cargo|salio de la empresa|cambi\w* de contraparte)\b/ },
  { subject: "funcionalidades o requisitos técnicos pendientes", pattern: /\b(?:falta de (?:funcionalidad\w*|integracion\w*)|no (?:tenemos|cuenta con|cumple con|soporta) (?:la |las |el |los )?(?:funcionalidad\w*|integracion\w*|requisito\w*)|dependemos de soc ?2|requisito tecnico (?:pendiente|sin cumplir))\b/ },
  { subject: "una aprobación interna pendiente o rechazada", pattern: /\b(?:no (?:se )?aprob\w*|no (?:logr\w*|consigu\w*) (?:la )?aprobacion|aprobacion pendiente|comite (?:rechaz\w*|no aprob\w*)|pendiente (?:de )?aprobacion)\b/ },
  { subject: "la falta de interés o de necesidad", pattern: /\b(?:sin interes|falta de interes|no (?:hay|hubo|tiene[n]?) interes|interes perdido|no (?:lo )?necesita[n]?|nunca hubo (?:real )?intencion)\b/ },
];

const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
const hypothetical = /\b(?:si (?:el cliente |ellos )?no |tal vez|quiza[s]?|posiblemente|podria|no (?:sabemos|confirmaron) si)\b/;

function clipQuote(text: string, position = 0) {
  const start = Math.max(0, position - 64);
  const end = start + 190;
  return `${start ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

function openingSummary<T extends { deal: ReasonDeal; plain: string; normalized: string }>(comments: readonly T[]) {
  const excerpts = comments.flatMap(({ deal, plain, normalized }) => {
    const category = normalize(deal.lostReason ?? "").replace(/[^a-z0-9 ]/g, "").trim();
    const body = normalized.replace(/[^a-z0-9 ]/g, "").trim();
    if (body === category || !body || /^(?:na|sin (?:detalle|comentario)|sin informacion|perdido|ghosting|motivo desconocido)$/.test(body)) return [];
    return [{ deal, plain, sentences: plain.split(/(?<=[.!?])\s+/) }];
  });
  const findings = explanations.map(({ subject, pattern }) => {
    const matches = excerpts.flatMap(({ deal, sentences }) => {
      for (const sentence of sentences) {
        const normalized = normalize(sentence);
        if (hypothetical.test(normalized)) continue;
        const match = pattern.exec(normalized);
        if (match) return [{ deal, text: clipQuote(sentence, match.index) }];
      }
      return [];
    });
    return { subject, count: matches.length, matches };
  }).filter(finding => finding.count).sort((a, b) => b.count - a.count).slice(0, 2);

  const examples: { deal: ReasonDeal; text: string }[] = [];
  for (const finding of findings) {
    const example = finding.matches.find(match => examples.every(candidate => candidate.deal.id !== match.deal.id))
      ?? finding.matches[0]!;
    if (!examples.some(candidate => candidate.deal.id === example.deal.id && candidate.text === example.text)) examples.push(example);
  }
  if (findings.length === 1) examples.push(...findings[0]!.matches.slice(1, 2));
  if (!findings.length) {
    const specificComments = excerpts.filter(({ plain }) => plain.length >= 24 && plain.split(/\s+/).length >= 4);
    examples.push(...specificComments.slice(0, 2).map(({ deal, plain }) => ({ deal, text: clipQuote(plain) })));
  }
  return { findings: findings.map(({ subject, count }) => ({ subject, count })), examples };
}

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
    const normalized = normalize(plain);
    return [{ deal, text, plain, normalized, topics: topics.filter(topic => topic.pattern.test(normalized)).map(topic => topic.label) }];
  }) : [];

  return {
    total: unique.length,
    opening: openingSummary(comments),
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
