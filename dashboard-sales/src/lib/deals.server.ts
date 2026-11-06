import { gateway, invalidateCache } from "./hubspot.server";

export type DealFieldUpdate = {
  id: string;
  /** Fecha de cierre en formato YYYY-MM-DD; null = no tocar */
  closeDate?: string | null;
  /** Probabilidad en porcentaje 0-100; null = no tocar */
  probability?: number | null;
};

type BatchResponse = { results?: { id: string }[] };

/**
 * Actualiza fecha de cierre y/o probabilidad en HubSpot (uno o varios deals).
 * `hs_deal_stage_probability` se guarda como fracción 0-1.
 */
export async function updateDealFields(updates: DealFieldUpdate[]) {
  const inputs = updates
    .map((update) => {
      const properties: Record<string, string> = {};
      if (update.closeDate) properties["closedate"] = update.closeDate;
      if (typeof update.probability === "number") {
        const pct = Math.min(100, Math.max(0, update.probability));
        properties["hs_deal_stage_probability"] = String(pct / 100);
      }
      return { id: update.id, properties };
    })
    .filter((input) => Object.keys(input.properties).length > 0);

  if (!inputs.length) throw new Error("No hay cambios que guardar");

  let updated = 0;
  for (let i = 0; i < inputs.length; i += 100) {
    const chunk = inputs.slice(i, i + 100);
    const res = await gateway<BatchResponse>("/crm/v3/objects/deals/batch/update", {
      method: "POST",
      body: JSON.stringify({ inputs: chunk }),
    });
    updated += res.results?.length ?? chunk.length;
  }

  // El próximo refresco debe traer los datos ya editados.
  invalidateCache("commercial-deals");
  invalidateCache("deals:");
  return { updated };
}

/* ------------------------------------------------------------------ */
/* Cierre perdido                                                      */
/* ------------------------------------------------------------------ */

/** Etapa "Deal perdido" del pipeline comercial. */
export const LOST_STAGE_ID = "171385869";

export type LostForm = {
  id: string;
  /** Motivo de cierres perdidos (texto libre) */
  reason: string;
  /** Motivo principal de cierre perdido (lista de opciones) */
  mainReason: string;
  /** ¿Tiene WhatsApp B. API? durante negociación */
  waba: string;
  /** Fecha para recontactar (YYYY-MM-DD) */
  recontact?: string | undefined;
  /** Valor del negocio */
  amount?: number | null;
  industry: string;
  country: string;
  /** Departamentos del cliente (multi) */
  departments: string[];
  source: string;
};

/** Mueve el deal a "Deal perdido" guardando el formulario de cierre. */
export async function markDealLost(form: LostForm) {
  const properties: Record<string, string> = {
    dealstage: LOST_STAGE_ID,
    closed_lost_reason: form.reason,
    razones_de_cierre_perdidos_especifico: form.mainReason,
    // HubSpot solo acepta los valores internos "si"/"no" en esta propiedad.
    adobo_tiene_whatsapp_b_api_negociacion: /^s/i.test(form.waba.trim()) ? "si" : "no",
    industria_deal: form.industry,
    pais: form.country,
    deptcliente: form.departments.join(";"),
    fuente_de_creacion: form.source,
  };
  if (form.recontact) properties["recontactar"] = form.recontact;
  if (typeof form.amount === "number" && Number.isFinite(form.amount)) {
    properties["amount"] = String(form.amount);
  }

  await gateway(`/crm/v3/objects/deals/${form.id}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });

  invalidateCache("commercial-deals");
  invalidateCache("deals:");
  return { ok: true };
}
