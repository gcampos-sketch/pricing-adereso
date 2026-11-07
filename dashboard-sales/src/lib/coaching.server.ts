/**
 * Calidad Comercial: oportunidades de mejora detectadas por Adobo en la última
 * reunión Tipo A/B de cada deal.
 *
 * HubSpot guarda solo el snapshot del último estado del deal
 * (`adobo_oportunidad_de_mejora` + `adobo_oportunidad_de_mejora_evidencia`),
 * así que cada lectura se acumula como evento histórico por reunión
 * (`coaching-improvement/<diio_id>`) en la base de la app. Eso permite ver la
 * evolución semanal y llevar el estado de los accionables.
 */
import {
  COMMERCIAL_PIPELINE,
  getOwners,
  getPropertyOptionLabels,
  invalidateCache,
  searchDealsCached,
} from "./hubspot.server";
import { STAGE_KEY } from "./pulse.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CoachingReport, CoachingRow, CoachingStatus } from "./coaching-types";

const PROPS = [
  "dealname",
  "dealstage",
  "hubspot_owner_id",
  "adobo_oportunidad_de_mejora",
  "adobo_oportunidad_de_mejora_evidencia",
  "adobo_last_reu_date",
  "adobo_last_reu_tipo",
  "adobo_reus_analizadas_count",
];

/** "tipo a" / "A" / vacío → "Tipo A" | "Tipo B" | "Sin tipo" */
function meetingType(raw: string | null | undefined): string {
  const value = (raw ?? "").toLowerCase();
  if (value.includes("a")) return "Tipo A";
  if (value.includes("b")) return "Tipo B";
  return "Sin tipo";
}

function iso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export async function buildCoachingReport(fresh = false): Promise<CoachingReport> {
  // Al refrescar a mano se descarta la caché para leer la propiedad tal cual está hoy.
  if (fresh) invalidateCache("deals:coaching");
  const [deals, owners, labels] = await Promise.all([
    searchDealsCached(
      "coaching",
      [{ propertyName: "pipeline", operator: "EQ", value: COMMERCIAL_PIPELINE }],
      PROPS,
      20,
    ),
    getOwners(),
    getPropertyOptionLabels("adobo_oportunidad_de_mejora"),
  ]);

  const ownerName = new Map(
    owners.map((owner) => [
      owner.id,
      [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email || owner.id,
    ]),
  );

  // Snapshot → eventos por reunión. Sin id de reunión usamos deal + fecha,
  // que identifica igual de bien la reunión analizada.
  const pending = deals
    .map((deal) => {
      const p = deal.properties;
      const key = p["adobo_oportunidad_de_mejora"];
      if (!key) return null;
      const date = iso(p["adobo_last_reu_date"]);
      const meetingId = `${deal.id}-${date ? date.slice(0, 10) : "sin-fecha"}`;
      return {
        event_key: `coaching-improvement/${meetingId}`,
        deal_id: deal.id,
        stage: STAGE_KEY.get(p["dealstage"] ?? "") ?? "",
        deal_name: p["dealname"] ?? "Sin nombre",
        owner_id: p["hubspot_owner_id"] ?? "",
        meeting_date: date,
        meeting_type: meetingType(p["adobo_last_reu_tipo"]),
        categoria_key: key,
        categoria_label: labels.get(key) ?? key,
        evidencia: p["adobo_oportunidad_de_mejora_evidencia"] ?? null,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (pending.length) {
    // El upsert solo toca las columnas enviadas: el estado del accionable se conserva.
    const { error } = await supabaseAdmin
      .from("coaching_events")
      .upsert(pending as never, { onConflict: "event_key" });
    if (error) console.warn("No se pudo guardar el histórico de coaching", error);
  }

  const stored = await supabaseAdmin
    .from("coaching_events")
    .select(
      "event_key, deal_id, deal_name, owner_id, stage, meeting_date, meeting_type, categoria_key, categoria_label, evidencia, status, action_note, closed_at",
    )
    .order("meeting_date", { ascending: false, nullsFirst: false })
    .limit(3000);
  if (stored.error) console.warn("No se pudo leer el histórico de coaching", stored.error);

  // Si la base no responde, el reporte se arma con la foto de HubSpot: la página
  // sigue viva (sin evolución histórica ni estado de accionables).
  const source =
    stored.data && stored.data.length
      ? stored.data
      : pending.map((row) => ({ ...row, status: "pendiente", action_note: null, closed_at: null }));

  // La foto de HubSpot manda sobre lo guardado: si el comercial cambia la
  // propiedad `adobo_oportunidad_de_mejora` (o su evidencia), el reporte lo
  // refleja en la siguiente lectura sin esperar a que expire nada.
  const live = new Map(pending.map((row) => [row.event_key, row]));
  // Deals cuyo snapshot ya no tiene oportunidad de mejora: se dejan de mostrar.
  const dealsWithSnapshot = new Set(pending.map((row) => row.deal_id));
  const dealsInPipeline = new Set(deals.map((deal) => deal.id));

  const rows: CoachingRow[] = source
    .filter((row) => {
      if (live.has(row.event_key)) return true;
      // Evento histórico de un deal que sigue en el pipeline pero ya sin gap
      // registrado en HubSpot: quedó obsoleto.
      if (dealsInPipeline.has(row.deal_id) && !dealsWithSnapshot.has(row.deal_id)) return false;
      return true;
    })
    .map((row) => {
      const fresh = live.get(row.event_key);
      return {
        eventKey: row.event_key,
        dealId: row.deal_id,
        dealName: fresh?.deal_name ?? row.deal_name ?? "Sin nombre",
        stage: fresh?.stage ?? row.stage ?? "",
        ownerId: fresh?.owner_id ?? row.owner_id ?? "",
        ownerName: ownerName.get(fresh?.owner_id ?? row.owner_id ?? "") ?? "Sin comercial",
        date: fresh?.meeting_date ?? row.meeting_date,
        meetingType: fresh?.meeting_type ?? row.meeting_type ?? "Sin tipo",
        categoryKey: fresh?.categoria_key ?? row.categoria_key,
        categoryLabel: fresh?.categoria_label ?? row.categoria_label,
        evidence: fresh ? fresh.evidencia : row.evidencia,
        status: (row.status === "abordado" ? "abordado" : "pendiente") as CoachingStatus,
        actionNote: row.action_note,
        closedAt: row.closed_at,
      };
    });


  const years = [
    ...new Set(rows.map((row) => (row.date ? row.date.slice(0, 4) : null)).filter(Boolean) as string[]),
  ].sort((a, b) => b.localeCompare(a));

  const seen = new Map<string, string>();
  for (const row of rows) if (!seen.has(row.ownerId)) seen.set(row.ownerId, row.ownerName);

  return {
    generatedAt: new Date().toISOString(),
    years: years.length ? years : [String(new Date().getUTCFullYear())],
    owners: [...seen.entries()]
      .filter(([id]) => id)
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    categories: [...labels.entries()].map(([key, label]) => ({ key, label })),
    rows,
  };
}

/** Marca un accionable como abordado (o lo devuelve a pendiente). */
export async function saveCoachingStatus(
  eventKey: string,
  status: CoachingStatus,
  note: string | null,
) {
  const { error } = await supabaseAdmin
    .from("coaching_events")
    .update({
      status,
      action_note: note,
      closed_at: status === "abordado" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("event_key", eventKey);
  if (error) throw new Error(`No se pudo guardar el accionable: ${error.message}`);
  return { ok: true };
}
