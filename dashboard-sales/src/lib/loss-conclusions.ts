import type { InsightDeal } from "./insights-types";
import { isGhostingLoss } from "./loss-ghosting";

export type LossRecommendation = { action: string; measure: string };

const validateFit = {
  action: "Validar el caso de uso, los canales y los requisitos imprescindibles con una prueba acotada antes de cotizar.",
  measure: "Propuestas con requisitos críticos validados.",
};

const timing = {
  action: "Acordar con el sponsor qué decisión sigue, quién la toma y en qué fecha. Si el proyecto se pausa, dejar un hito concreto de reactivación.",
  measure: "Deals activos con próximo paso y fecha confirmados por el cliente.",
};

const cadence = {
  action: "Acordar el próximo contacto en cada reunión y revisar a tiempo los casos sin respuesta. Verificar en HubSpot el mínimo de 2 llamadas, 2 WhatsApp nativos y 2 correos.",
  measure: "Cumplimiento del 2/2/2 y proporción de pérdidas por ghosting.",
};

const recommendations = new Map<string, LossRecommendation>([
  ["cambio prioridad empresa", timing],
  ["timing", timing],
  ["ghosting", cadence],
  ["mal fup", cadence],
  ["presupuesto", {
    action: "Validar el rango de inversión y quién aprueba el gasto antes de preparar la propuesta. Revisar con el cliente un escenario de retorno y un alcance inicial viable.",
    measure: "Propuestas con presupuesto confirmado antes de cotizar.",
  }],
  ["competidor", {
    action: "Preguntar qué alternativas están evaluando y con qué criterios decidirán. Demostrar la diferencia de Adereso en el caso real del cliente.",
    measure: "Deals competitivos con criterios de decisión registrados.",
  }],
  ["no es decision maker", {
    action: "Identificar a quien aprueba la compra y pedir una reunión conjunta antes de enviar la propuesta final.",
    measure: "Propuestas con participación de la persona que decide.",
  }],
  ["no-fit necesidad", validateFit],
  ["producto incorrecto y no fit", validateFit],
  ["producto insuficiente", validateFit],
  ["canales", validateFit],
  ["sp - proyecto inviable", validateFit],
  ["expectativas de soporte", {
    action: "Alinear con el cliente el alcance de soporte y las responsabilidades de implementación antes del cierre. Dejar por escrito lo acordado.",
    measure: "Propuestas con alcance de soporte confirmado.",
  }],
  ["incompatibilidad facturación", {
    action: "Confirmar moneda, país, entidad y condiciones de facturación con Compras o Finanzas antes de emitir la propuesta final.",
    measure: "Propuestas con condiciones de facturación validadas.",
  }],
]);

function reasonKey(reason: string) {
  return reason.trim().toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "");
}

function recommendationFor(reason: string): LossRecommendation {
  if (isGhostingLoss(reason)) return cadence;
  return recommendations.get(reasonKey(reason)) ?? {
    action: "Revisar los comentarios de estos deals y contrastar con el equipo qué condición se repite. Definir una validación temprana para esa condición.",
    measure: "Casos revisados con una barrera concreta documentada.",
  };
}

function leadingStage(deals: InsightDeal[]) {
  const counts = new Map<string, number>();
  for (const deal of deals) {
    const stage = deal.lostStage?.trim();
    if (stage && stage !== "Sin recorrido") counts.set(stage, (counts.get(stage) ?? 0) + 1);
  }
  const [first, next] = [...counts].sort((a, b) => b[1] - a[1]);
  return first && first[1] > (next?.[1] ?? 1) ? { label: first[0], count: first[1] } : null;
}

export function buildLossConclusions(input: readonly InsightDeal[]) {
  const deals = [...new Map(input.filter(deal => deal.status === "lost").map(deal => [deal.id, deal])).values()];
  const groups = new Map<string, InsightDeal[]>();
  const unspecified: InsightDeal[] = [];
  let totalMrr = 0;
  let comparableMrr = true;

  for (const deal of deals) {
    const reason = deal.lostReason?.trim() ?? "";
    const key = reasonKey(reason);
    if (!key || key === "otro" || key === "otro (explicar)" || key === "sin motivo listado") {
      unspecified.push(deal);
    } else {
      const group = groups.get(reason) ?? [];
      group.push(deal);
      groups.set(reason, group);
    }
    if (!Number.isFinite(deal.amountValue) || deal.amountValue < 0) comparableMrr = false;
    if (Number.isFinite(deal.amountValue)) totalMrr += deal.amountValue;
  }

  const evidence = [...groups].map(([reason, cohort]) => ({
    reason,
    deals: cohort,
    count: cohort.length,
    mrr: cohort.reduce((total, deal) => total + (Number.isFinite(deal.amountValue) ? deal.amountValue : 0), 0),
  }));
  const byMrr = [...evidence].sort((a, b) => b.mrr - a.mrr || b.count - a.count || a.reason.localeCompare(b.reason, "es"));
  const byCount = [...evidence].sort((a, b) => b.count - a.count || b.mrr - a.mrr || a.reason.localeCompare(b.reason, "es"));
  const impact = byMrr[0] && byMrr[0].mrr > 0 ? byMrr[0] : undefined;
  const frequency = byCount[0];
  const priorities = [...new Set([impact, frequency, ...(impact ? byMrr : byCount)])]
    .filter(row => row !== undefined).slice(0, 3);

  const ghosting = byCount.find(group => isGhostingLoss(group.reason));
  const cards = ghosting && !priorities.includes(ghosting) ? [...priorities, ghosting] : priorities;
  const ranked = cards.map(group => ({
    ...group,
    dealShare: group.count / deals.length * 100,
    mrrShare: comparableMrr && totalMrr > 0 ? group.mrr / totalMrr * 100 : null,
    leadsMrr: group.mrr > 0 && group.mrr === impact?.mrr,
    leadsCount: group.count === frequency?.count,
    stage: leadingStage(group.deals),
    recommendation: recommendationFor(group.reason),
  }));
  const rankedPriorities = ranked.slice(0, priorities.length);
  const priorityDeals = rankedPriorities.flatMap(group => group.deals);
  const shared = leadingStage(priorityDeals);
  const stageDeals = shared ? priorityDeals.filter(deal => deal.lostStage?.trim() === shared.label) : [];
  const sharedStage = shared && stageDeals.length > priorityDeals.length / 2 &&
    rankedPriorities.filter(group => group.stage?.label === shared.label).length > 1 &&
    priorityDeals.some(deal => deal.lostStage && !["Sin recorrido", shared.label].includes(deal.lostStage.trim()))
    ? { label: shared.label, deals: stageDeals, total: priorityDeals.length }
    : null;

  return { total: deals.length, unspecified, priorities: ranked, sharedStage };
}
