import { expect, test } from "bun:test";
import { buildLossReasonSummary } from "../src/lib/loss-reason-summary";

const deal = (id: string, lostReasonNarrative: string | null, lostStage = "E4") => ({
  id, name: id, url: "", owner: "AE", lostStage, lostReasonNarrative,
});

test("groups literal subjects across notes and keeps deal and stage counts exact", () => {
  const a = deal("a", "Ganó otro proveedor. El comité también señaló el costo y la integración.");
  const b = deal("b", "No volvieron a responder. La nueva contraparte tenía otro presupuesto.", "E2");
  const summary = buildLossReasonSummary([a, b, a, deal("c", null), deal("d", "Fuera del país.", "")], true);
  const idsByTopic = Object.fromEntries(summary.topics.map(topic => [topic.label, topic.comments.map(comment => comment.deal.id)]));
  expect(summary.total).toBe(4);
  expect(summary.comments.map(comment => comment.text)).toEqual([a.lostReasonNarrative, b.lostReasonNarrative, "Fuera del país."]);
  expect(idsByTopic["Otro proveedor o plataforma"]).toEqual(["a"]);
  expect(idsByTopic["Precio, costos o descuentos"]).toEqual(["a"]);
  expect(idsByTopic["Presupuesto disponible"]).toEqual(["b"]);
  expect(idsByTopic["Falta de respuesta o reuniones fallidas"]).toEqual(["b"]);
  expect(summary.stages[0]).toEqual({ label: "E4", count: 2 });
  expect(summary.otherComments.map(comment => comment.deal.id)).toEqual(["d"]);
});

test("never treats an older edition or an empty native comment as evidence", () => {
  const summary = buildLossReasonSummary([deal("a", "Sin presupuesto")], false);
  expect(summary.comments).toEqual([]);
  expect(summary.topics).toEqual([]);
  expect(summary.total).toBe(1);
  const legacy = { ...deal("b", "<p>&nbsp;</p>"), lostReasonText: "Otro proveedor" };
  expect(buildLossReasonSummary([legacy], true).comments).toEqual([]);
});
