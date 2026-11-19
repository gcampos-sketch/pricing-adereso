import { describe, expect, test } from "bun:test";
import { evaluateCommission } from "../src/lib/won-commission";

const complete = { projectType: "Solución", contract: "Firmado > 12 meses", firstMrr: "5. Pago recibido" };

describe("won deal commission milestones", () => {
  test("awards 100% for the three verified milestones, including an advance payment", () => {
    expect(evaluateCommission(complete)).toEqual({
      group: "ready",
      progress: 100,
      states: { projectType: "Cumple", contract: "Cumple", firstMrr: "Cumple" },
    });
    expect(evaluateCommission({ ...complete, firstMrr: "Pagado MRR anticipado" }).group).toBe("ready");
  });

  test("does not unlock payment for invoicing or partial payment at 85% progress", () => {
    for (const firstMrr of ["Facturado MRR anticipado", "3.1 Pago parcial recibido", "MRR 0"]) {
      expect(evaluateCommission({ ...complete, firstMrr })).toMatchObject({
        progress: 85, group: "awaitingPayment", states: { firstMrr: "Pendiente" },
      });
    }
  });

  test("separates a paid deal with other requirements outstanding from a ready deal", () => {
    expect(evaluateCommission({ ...complete, projectType: "Piloto", contract: "Firmado 30 dias" }))
      .toMatchObject({ progress: 15, group: "paidWithGaps" });
    expect(evaluateCommission({ ...complete, contract: "Firmado + Anexo Firmado" }))
      .toMatchObject({ progress: 20, states: { contract: "Por verificar" }, group: "paidWithGaps" });
  });

  test("keeps missing or unrecognized payment evidence separate from known pending payments", () => {
    expect(evaluateCommission()).toMatchObject({ progress: 0, group: "unverifiedPayment", states: { firstMrr: "Sin dato" } });
    expect(evaluateCommission({ ...complete, firstMrr: "Pago no verificado" }))
      .toMatchObject({ progress: 85, group: "unverifiedPayment", states: { firstMrr: "Por verificar" } });
  });
});
