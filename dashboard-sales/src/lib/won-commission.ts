export type CommissionEvidence = {
  projectType: string | null;
  contract: string | null;
  firstMrr: string | null;
};

export const commissionMilestones = [
  { key: "projectType", label: "Proyecto Solución", weight: 5 },
  { key: "contract", label: "Contrato firmado de 12 meses o más", weight: 80 },
  { key: "firstMrr", label: "Primer MRR pagado", weight: 15 },
] as const;

type MilestoneState = "Cumple" | "Pendiente" | "Sin dato" | "Por verificar";

const shortOrUnsigned = new Set([
  "NO COMENZADO",
  "Elaboración de contrato",
  "2. Contrato entregado a Comercial (Finanzas)",
  "3. Contrato enviado a Cliente (Comercial)",
  "4. En revisión de acuerdos",
  "Firmado 90 dias/ Licitacion",
  "Firmado 60 dias",
  "Firmado 30 dias",
]);

const pendingMrr = new Set([
  "0. No Comenzado (MRR)", "MRR 0", "Facturado MRR anticipado",
  "1. Nota Venta enviada (MRR)", "4. Factura enviada (MRR)",
  "2.1 Factura parcial enviada (MRR)", "3.1 Pago parcial recibido",
]);

function milestone(value: string | null | undefined, meets: boolean, pending: boolean): MilestoneState {
  if (!value) return "Sin dato";
  if (meets) return "Cumple";
  return pending ? "Pendiente" : "Por verificar";
}

export const commissionGroups = [
  { key: "ready", label: "3 hitos cumplidos" },
  { key: "paidWithGaps", label: "MRR pagado · faltan otros hitos" },
  { key: "awaitingPayment", label: "Primer MRR pendiente" },
  { key: "unverifiedPayment", label: "Pago por verificar" },
] as const;

export function evaluateCommission(evidence?: CommissionEvidence) {
  const { projectType, contract, firstMrr } = evidence ?? {};
  const states = {
    projectType: milestone(projectType, projectType === "Solución", projectType === "Piloto" || projectType === "PoC"),
    contract: milestone(contract, contract === "Firmado > 12 meses", shortOrUnsigned.has(contract ?? "")),
    firstMrr: milestone(firstMrr, firstMrr === "5. Pago recibido" || firstMrr === "Pagado MRR anticipado", pendingMrr.has(firstMrr ?? "")),
  };
  const progress = commissionMilestones.reduce((sum, item) => sum + (states[item.key] === "Cumple" ? item.weight : 0), 0);
  const group = progress === 100 ? "ready" : states.firstMrr === "Cumple" ? "paidWithGaps"
    : states.firstMrr === "Pendiente" ? "awaitingPayment" : "unverifiedPayment";
  return { states, progress, group } as const;
}
