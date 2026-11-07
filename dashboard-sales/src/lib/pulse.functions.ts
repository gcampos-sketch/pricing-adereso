import { createServerFn } from "@tanstack/react-start";
import { requireMfa } from "@/lib/require-mfa";
import type { PartnerReport, PulseReport } from "./pulse-types";
import type { TeamScorecardReport } from "./team-types";
import type { InsightsReport } from "./insights-types";
import type { CoachingReport } from "./coaching-types";
import { packReport } from './report-wire';
import type { PropertyHistoryV1 } from './adobo-intelligence';


/** `fresh: false` sirve la copia guardada (instantánea); `true` reconstruye. */
const freshInput = (input?: { fresh?: boolean }) => ({ fresh: Boolean(input?.fresh) });

/** `fresh` sirve la copia guardada; `role` recorta el reporte a AE o KAM. */
const pulseInput = (input?: { fresh?: boolean; role?: string | undefined }) => ({
  fresh: Boolean(input?.fresh),
  role: input?.role === "AE" || input?.role === "KAM" ? (input.role as "AE" | "KAM") : undefined,
});

export const getPulseReport = createServerFn({ method: "GET" })
  .middleware([requireMfa])
  .inputValidator(pulseInput)
  .handler(async ({ data }): Promise<string> => {
    const [{ buildPulseReport }, { withSnapshot, readActiveMrrHistory }] = await Promise.all([
      import("./pulse.server"),
      import("./report-cache.server"),
    ]);
    // Cada rol tiene su propia copia guardada; "all" usa la clave base.
    const key = data.role ? `pulse-${data.role.toLowerCase()}` : "pulse";
    const report = await withSnapshot(key, data.fresh, async () => {
      // Solo se necesita el historial de MRR; no cargar el reporte anterior completo.
      if (data.fresh) (await import("./hubspot.server")).invalidateCache("adobo-history:");
      const history = data.fresh ? await readActiveMrrHistory(key) : undefined;
      const previous = history ? ({ activeMrr: { history } } as unknown as PulseReport) : undefined;
      return buildPulseReport(previous, data.role);
    });
    // A compact JSON string also avoids the server-function serializer expanding every DTO field.
    return JSON.stringify(packReport(report));
  });

/** Bounded history reads, only requested by an opened Adobo panel. */
export const getAdoboHistory = createServerFn({ method: 'POST' })
  .middleware([requireMfa])
  .inputValidator((input: { ids: string[] }) => {
    const ids = [...new Set(input.ids)];
    if (!ids.length || ids.length > 50 || ids.some(id => typeof id !== 'string' || !/^\d+$/.test(id))) throw new Error('Selección de negocios inválida');
    return { ids };
  })
  .handler(async ({ data }): Promise<Record<string, PropertyHistoryV1 | null>> => {
    const [{ getAdoboPropertyHistory, invalidateCache }, { toPropertyHistory }, { ADOBO_HISTORY_PROPS }] = await Promise.all([
      import('./hubspot.server'), import('./adobo.server'), import('./adobo-intelligence'),
    ]);
    const history = await getAdoboPropertyHistory(data.ids, ADOBO_HISTORY_PROPS);
    const result = Object.fromEntries(data.ids.map(id => {
      const raw = history?.byDeal.get(id);
      return [id, raw && history ? toPropertyHistory(id, `https://app.hubspot.com/contacts/23480943/deal/${id}`, history.fetchedAt, raw, history.complete) : null];
    }));
    // Keep only bounded mapped versions in the browser; don't retain bulky raw histories in the worker.
    invalidateCache(`adobo-history:${[...new Set(ADOBO_HISTORY_PROPS)].sort().join(',')}:${[...data.ids].sort().join(',')}`);
    return result;
  });

export const getPartnerReport = createServerFn({ method: "GET" })
  .middleware([requireMfa])
  .inputValidator(freshInput)
  .handler(async ({ data }): Promise<PartnerReport> => {
    const [{ buildPartnerReport }, { withSnapshot }] = await Promise.all([
      import("./partner.server"),
      import("./report-cache.server"),
    ]);
    return withSnapshot("partner", data.fresh, buildPartnerReport);
  });

export const getTeamReport = createServerFn({ method: "GET" })
  .middleware([requireMfa])
  .inputValidator(freshInput)
  .handler(async ({ data }): Promise<TeamScorecardReport> => {
    const [{ buildTeamReport }, { withSnapshot }] = await Promise.all([
      import("./team.server"),
      import("./report-cache.server"),
    ]);
    return withSnapshot("team", data.fresh, buildTeamReport);
  });

export const getInsightsReport = createServerFn({ method: "GET" })
  .middleware([requireMfa])
  .inputValidator(freshInput)
  .handler(async ({ data }): Promise<InsightsReport> => {
    const [{ buildInsightsReport }, { withSnapshot }] = await Promise.all([
      import("./insights.server"),
      import("./report-cache.server"),
    ]);
    return withSnapshot("insights", data.fresh, buildInsightsReport);
  });

export const getCoachingReport = createServerFn({ method: "GET" })
  .middleware([requireMfa])
  .inputValidator(freshInput)
  .handler(async ({ data }): Promise<CoachingReport> => {
    const [{ buildCoachingReport }, { withSnapshot }] = await Promise.all([
      import("./coaching.server"),
      import("./report-cache.server"),
    ]);
    return withSnapshot("coaching", data.fresh, () => buildCoachingReport(data.fresh));
  });

/** Marca un accionable de calidad comercial como abordado o pendiente. */
export const setCoachingStatus = createServerFn({ method: "POST" })
  .middleware([requireMfa])
  .inputValidator((input: { eventKey: string; status: string; note?: string }) => {
    const eventKey = String(input.eventKey ?? "").trim();
    if (!eventKey) throw new Error("Falta el accionable");
    const status = input.status === "abordado" ? "abordado" : "pendiente";
    const note = String(input.note ?? "").trim();
    return { eventKey, status: status as "abordado" | "pendiente", note: note ? note.slice(0, 2000) : null };
  })
  .handler(async ({ data }) => {
    const { saveCoachingStatus } = await import("./coaching.server");
    return saveCoachingStatus(data.eventKey, data.status, data.note);
  });

/** Cuánto tardó y cuándo se generó cada copia: alimenta la barra de progreso. */
export const getReportMeta = createServerFn({ method: "GET" }).middleware([requireMfa]).handler(async () => {
  const { readMeta } = await import("./report-cache.server");
  return readMeta(["pulse", "pulse-ae", "pulse-kam", "partner", "team", "insights", "coaching"]);
});



export const addDealNote = createServerFn({ method: "POST" })
  .middleware([requireMfa])
  .inputValidator((input: { dealId: string; body: string }) => {
    const dealId = String(input["dealId"] ?? "").trim();
    const body = String(input["body"] ?? "").trim();
    if (!dealId) throw new Error("Falta el deal");
    if (!body) throw new Error("La nota está vacía");
    return { dealId, body: body.slice(0, 8000) };
  })
  .handler(async ({ data }) => {
    const { createDealNote } = await import("./notes.server");
    return createDealNote(data.dealId, data.body);
  });

/** Edita fecha de cierre y/o probabilidad en HubSpot (individual o masivo). */
export const updateDeals = createServerFn({ method: "POST" })
  .middleware([requireMfa])
  .inputValidator(
    (input: { ids: string[]; closeDate?: string | null; probability?: number | null }) => {
      const ids = (Array.isArray(input.ids) ? input.ids : [])
        .map((id) => String(id ?? "").trim())
        .filter(Boolean)
        .slice(0, 500);
      if (!ids.length) throw new Error("No hay deals seleccionados");
      const rawDate = String(input.closeDate ?? "").trim();
      const closeDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
      const rawProb = input.probability;
      const probability =
        typeof rawProb === "number" && Number.isFinite(rawProb)
          ? Math.min(100, Math.max(0, Math.round(rawProb)))
          : null;
      if (!closeDate && probability === null) throw new Error("Indica una fecha o una probabilidad");
      return { ids, closeDate, probability };
    },
  )
  .handler(async ({ data }) => {
    const { updateDealFields } = await import("./deals.server");
    return updateDealFields(
      data.ids.map((id) => ({ id, closeDate: data.closeDate, probability: data.probability })),
    );
  });

export const addDealTask = createServerFn({ method: "POST" })
  .middleware([requireMfa])
  .inputValidator((input: { dealId: string; subject: string; body?: string; dueDate?: string }) => {
    const dealId = String(input["dealId"] ?? "").trim();
    const subject = String(input["subject"] ?? "").trim();
    if (!dealId) throw new Error("Falta el deal");
    if (!subject) throw new Error("La tarea necesita un título");
    const dueDate = String(input["dueDate"] ?? "").trim();
    return {
      dealId,
      subject: subject.slice(0, 250),
      body: String(input["body"] ?? "").trim().slice(0, 8000),
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null,
    };
  })
  .handler(async ({ data }) => {
    const { createDealTask } = await import("./tasks.server");
    return createDealTask(data.dealId, data.subject, data.body, data.dueDate);
  });

/** Contactos y estado de secuencia por deal (panel Fix). */
export const getDealContacts = createServerFn({ method: "POST" })
  .middleware([requireMfa])
  .inputValidator((input: { ids: string[] }) => {
    const ids = (Array.isArray(input.ids) ? input.ids : [])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean)
      .slice(0, 300);
    if (!ids.length) throw new Error("No hay deals para revisar");
    return { ids };
  })
  .handler(async ({ data }) => {
    const { getDealContacts: load } = await import("./sequences.server");
    return load(data.ids);
  });

/** Manda el deal a "Deal perdido" con su formulario de cierre. */
export const markDealLostFn = createServerFn({ method: "POST" })
  .middleware([requireMfa])
  .inputValidator((input: {
    id: string;
    reason: string;
    mainReason: string;
    waba: string;
    recontact?: string;
    amount?: number | null;
    industry: string;
    country: string;
    departments: string[];
    source: string;
  }) => {
    const id = String(input.id ?? "").trim();
    const reason = String(input.reason ?? "").trim();
    const mainReason = String(input.mainReason ?? "").trim();
    const waba = String(input.waba ?? "").trim();
    const industry = String(input.industry ?? "").trim();
    const country = String(input.country ?? "").trim();
    const source = String(input.source ?? "").trim();
    const departments = (Array.isArray(input.departments) ? input.departments : [])
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
    if (!id) throw new Error("Falta el deal");
    if (!reason) throw new Error("Escribe el motivo de cierre perdido");
    if (!mainReason) throw new Error("Elige el motivo principal de cierre perdido");
    if (!waba) throw new Error("Indica si tiene WhatsApp B. API");
    if (!industry) throw new Error("Elige la industria del deal");
    if (!country) throw new Error("Elige el país");
    if (!departments.length) throw new Error("Elige al menos un departamento del cliente");
    if (!source) throw new Error("Elige la fuente de creación");
    const rawDate = String(input.recontact ?? "").trim();
    const amount = typeof input.amount === "number" && Number.isFinite(input.amount) ? input.amount : null;
    return {
      id,
      reason: reason.slice(0, 4000),
      mainReason,
      waba,
      recontact: /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : undefined,
      amount,
      industry,
      country,
      departments,
      source,
    };
  })
  .handler(async ({ data }) => {
    const { markDealLost } = await import("./deals.server");
    return markDealLost(data);
  });

/** Inscribe el contacto principal de cada deal en «Touchpoint seguimiento II», enviado por el dueño del deal. */
export const enrollTouchpoint = createServerFn({ method: "POST" })
  .middleware([requireMfa])
  .inputValidator((input: { ids: string[] }) => {
    const ids = (Array.isArray(input.ids) ? input.ids : [])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean)
      .slice(0, 200);
    if (!ids.length) throw new Error("No hay deals seleccionados");
    return { ids };
  })
  .handler(async ({ data }) => {
    const { enrollDealsInTouchpoint } = await import("./enroll.server");
    return enrollDealsInTouchpoint(data.ids);
  });
