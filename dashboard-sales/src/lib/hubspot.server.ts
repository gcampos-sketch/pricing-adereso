/**
 * Capa compartida de acceso a HubSpot: gateway con throttling, caché en memoria
 * con stale-while-revalidate y fetchers reutilizados por todos los reportes.
 */

import { hubspotConfig } from './hubspot-config.server';
import { ADOBO_INTELLIGENCE_PROPS } from './adobo-intelligence';

export type Props = Record<string, string | null>;
export type RawDeal = { id: string; properties: Props };

export function headers() {
  return hubspotConfig().headers;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// HubSpot limita las búsquedas a pocas llamadas por segundo: espaciamos el
// *inicio* de cada request (no su término) para poder solapar la latencia.
const MIN_GAP_MS = 130;
let nextStartAt = 0;

async function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const startAt = Math.max(now, nextStartAt);
  nextStartAt = startAt + MIN_GAP_MS;
  if (startAt > now) await sleep(startAt - now);
  return withSlot(task);
}

// Los batch/read y lecturas simples toleran concurrencia: semáforo en vez de cola serial.
// Sin cola compartida: un resolver de otra petición del worker nunca debe
// desbloquear a ésta (Workers cancela la espera como "code had hung"). El
// runtime ya limita a 6 conexiones salientes por invocación.
async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  return task();
}

const FETCH_TIMEOUT_MS = 25_000;

export class HubSpotRequestError extends Error {
  constructor(public status:number, public correlationId:string|null) { super(`HubSpot ${status}${correlationId ? ` · referencia ${correlationId}` : ""}`); }
}

export async function gateway<T>(path: string, init?: RequestInit): Promise<T> {
  const config = hubspotConfig();
  const limiter = path.includes("/search") ? enqueue : withSlot;
  return limiter(async () => {

    let lastBody = "";
    let lastStatus = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch(`${config.baseUrl}${path}`, { ...init, headers: config.headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.ok) return (await res.json()) as T;
      lastStatus = res.status;
      lastBody = await res.text();
      const readOnly = !init?.method || init.method === "GET" || /\/(search|batch\/read)$/.test(path);
      const retryable = readOnly && (res.status === 429 || res.status >= 500);
      if (!retryable) break;
      const retryAfter = Number(res.headers.get("retry-after") ?? 0);
      const wait = retryAfter > 0 ? retryAfter * 1000 : Math.min(8000, 500 * 2 ** attempt);
      console.warn(`HubSpot ${res.status} en ${path}, reintento ${attempt + 1} en ${wait}ms`);
      await sleep(wait);
    }
    let correlationId: string | null = null;
    try { const parsed=JSON.parse(lastBody); if(typeof parsed.correlationId==="string" && /^[a-zA-Z0-9-]+$/.test(parsed.correlationId)) correlationId=parsed.correlationId; } catch { /* non-JSON upstream error */ }
    console.error(`HubSpot gateway failed [${lastStatus}]${correlationId ? ` ref ${correlationId}` : ""}`);
    throw new HubSpotRequestError(lastStatus,correlationId);
  });
}

/* ------------------------------------------------------------------ */
/* Caché en memoria: dedupe de llamadas + stale-while-revalidate      */
/* ------------------------------------------------------------------ */

type Entry<T> = { value?: T; expiresAt: number };
const store = new Map<string, Entry<unknown>>();

export const TTL_DEALS = 90_000;
export const TTL_SLOW = 600_000;

/** Borra entradas de caché cuyo key empieza con el prefijo (tras escribir en HubSpot). */
export function invalidateCache(prefix: string) {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export async function getCached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const entry = (store.get(key) as Entry<T> | undefined) ?? { expiresAt: 0 };
  const fresh = entry.value !== undefined && entry.expiresAt > Date.now();
  if (fresh) return entry.value as T;

  // Cada petición carga por su cuenta: no se comparten promesas en curso entre
  // peticiones (si la original se cancela, las que esperan quedarían colgadas).
  const value = await loader();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/* ------------------------------------------------------------------ */
/* Fetchers compartidos                                              */
/* ------------------------------------------------------------------ */

export const COMMERCIAL_PIPELINE = "93085851";

/** Unión de propiedades que necesitan Pipeline Comercial, Equipo e Insights. */
function commercialProps(managedStageIds: string[]): string[] {
  const base = [
    "dealname",
    "amount",
    "dealstage",
    "closedate",
    "createdate",
    "hubspot_owner_id",
    "hs_deal_stage_probability",
    "hs_deal_score",
    "adobo_closing_score",
    "adobo_pain_categoria",
    "adobo_current_urgencia",
    "adobo_current_timing",
    "adobo_current_objecion",
    "adobo_current_competidor",
    "adobo_next_step_claro",
    "adobo_decisor_presente",
    "adobo_presupuesto_mencionado",
    "adobo_riesgos_restricciones",
    "adobo_snapshot_confidence",
    "adobo_compromisos_especiales",
    "adobo_stakeholders_mapeados",
    "adobo_last_reu_quality",
    "adobo_reus_analizadas_count",
    "adobo_last_reu_date",
    "adobo_last_reu_tipo",
    "adobo_motivo_compra",
    "adobo_score_trend",
    "adobo_score_driver_principal",
    "adobo_score_last_change_reason",
    "adobo_score_last_changed_at",
    "adobo_icp_fit",
    "adobo_icp_fit_evidencia",
    "adobo_intentos_contacto_prospecto",
    "adobo_respuestas_prospecto",
    "adobo_tiene_whatsapp_b_api_negociacion",
    "closed_lost_reason",
    "razones_de_cierre_perdidos_especifico",
    "deal_perdido_en_desarrollo",
    "motivo_de_deal_perdido_en_desarrollo",
    "dealtype",
    "negocio_inbound",
    "fuente_de_creacion",
    "notes_next_activity_date",
    "num_contacted_notes",
    "notes_last_contacted",
    "hs_v2_date_entered_1144383754",
    "hs_v2_cumulative_time_in_1144383754",
    "hs_next_step",
    "hs_lastmodifieddate",
    "on_track",
    "seguimiento_con_pinzas",
    "plan_de_bot",
    "otf",
    "hs_mrr",
    "fecha_kickoff",
    "fin_de_la_piloto",
    "productos_a_contratar",
    "tipo_de_proyecto",
    "tamano_de_empresa_deal",
    "tamano_empresa_empleados",
    "hs_v2_time_in_current_stage",
    "hs_v2_date_entered_174677684",
    "hs_v2_date_entered_173990327",
    "hs_v2_date_entered_1086544542",
    // entrega: avance hacia kick off, portal cliente, contratos y finanzas
    "adobo_avance_kickoff_pct",
    "adobo_etapa_actual_portal_cliente",
    "adobo_dias_en_etapa_actual",
    "adobo_tasa_contactabilidad_prospecto",
    "status_contrato",
    "status_cobranza_otf_setup",
    "status_cobranzofacturacion",
    "status_proyecto",
    "inicio_del_servicio",
    "pais",
    "motivo_deal_warning",
    "alerta_finanazas_negocio",
    "alerta_sspp",
    "candidato_perdido_prioridad",
    "candidato_perdido_competencia",
    ...ADOBO_INTELLIGENCE_PROPS,
  ];
  for (const id of managedStageIds) {
    base.push(`hs_v2_date_entered_${id}`, `hs_v2_cumulative_time_in_${id}`);
  }
  return [...new Set(base)];
}

type SearchPage = { results: RawDeal[]; total?: number; paging?: { next?: { after?: string } } };

const searchDeals = (payload: Record<string, unknown>) =>
  gateway<SearchPage>("/crm/v3/objects/deals/search", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/**
 * Pagina la búsqueda de deals. La primera página trae el `total`, así que el
 * resto se pide en paralelo por offset (HubSpot acepta `after` numérico hasta
 * 10.000); si hay más que eso, seguimos con el cursor secuencial.
 */
async function paginate(body: Record<string, unknown>, maxPages: number): Promise<RawDeal[]> {
  const limit = Number(body["limit"] ?? 100) || 100;
  const first = await searchDeals(body);
  const out: RawDeal[] = [...(first.results ?? [])];
  let after = first.paging?.next?.after;
  if (!after) return out;

  const total = Number(first.total ?? 0);
  const pages = total > 0 ? Math.min(maxPages, Math.ceil(total / limit)) : 0;
  const offsets: number[] = [];
  for (let page = 1; page < pages; page++) {
    const offset = page * limit;
    if (offset + limit > 10_000) break;
    offsets.push(offset);
  }

  if (offsets.length) {
    const chunks = await Promise.all(
      offsets.map((offset) => searchDeals({ ...body, after: String(offset) })),
    );
    for (const chunk of chunks) out.push(...(chunk.results ?? []));
    const last = chunks[chunks.length - 1];
    after = last?.paging?.next?.after;
    const reached = (offsets[offsets.length - 1] ?? 0) + limit;
    if (reached >= total) return out;
    if (!after || Number(after) < reached) after = String(reached);
  }

  // Cola secuencial para lo que quede (o cuando HubSpot no informa total).
  for (let page = offsets.length + 1; page < maxPages && after; page++) {
    if (Number.isFinite(Number(after)) && Number(after) + limit > 10_000) break;
    const data = await searchDeals({ ...body, after });
    out.push(...(data.results ?? []));
    after = data.paging?.next?.after;
  }
  return out;
}

/** Deals del pipeline Comercial, un solo recorrido cacheado para todos los tabs. */
export function getCommercialDeals(managedStageIds: string[]): Promise<RawDeal[]> {
  return getCached("commercial-deals", TTL_DEALS, () =>
    paginate(
      {
        filterGroups: [
          { filters: [{ propertyName: "pipeline", operator: "EQ", value: COMMERCIAL_PIPELINE }] },
        ],
        properties: commercialProps(managedStageIds),
        limit: 200,
      },
      40,
    ),
  );
}

/** Búsqueda de deals cacheada por clave (usada por el pipeline de partners). */
export function searchDealsCached(
  key: string,
  filters: Record<string, unknown>[],
  properties: string[],
  maxPages = 20,
): Promise<RawDeal[]> {
  return getCached(`deals:${key}`, TTL_DEALS, () =>
    paginate({ filterGroups: [{ filters }], properties, limit: 200 }, maxPages),
  );
}

const DAY_MS = 86_400_000;

/** Cuotas trimestrales de MRR por comercial (goal_targets), cacheadas. */
export function getQuotas(): Promise<Record<string, Record<string, number>>> {
  return getCached("quotas", TTL_SLOW, async () => {
    const data = await gateway<{ results: { properties: Props }[] }>(
      "/crm/v3/objects/goal_targets/search",
      {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [
            { filters: [{ propertyName: "hs_start_datetime", operator: "GTE", value: "2025-01-01" }] },
          ],
          properties: [
            "hs_goal_name",
            "hs_target_amount",
            "hs_start_datetime",
            "hs_end_datetime",
            "hubspot_owner_id",
          ],
          limit: 200,
        }),
      },
    );
    const quotas: Record<string, Record<string, number>> = {};
    for (const row of data.results ?? []) {
      const p = row.properties;
      const name = p["hs_goal_name"] ?? "";
      const owner = p["hubspot_owner_id"];
      const start = p["hs_start_datetime"];
      const end = p["hs_end_datetime"];
      const amount = Number(p["hs_target_amount"] ?? 0);
      if (!owner || !start || !end || !name.startsWith("MRR")) continue;
      const days = (Date.parse(end) - Date.parse(start)) / DAY_MS;
      if (days < 60 || days > 120) continue;
      const d = new Date(start);
      const period = `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
      quotas[period] = quotas[period] ?? {};
      quotas[period][owner] = amount;
    }
    return quotas;
  });
}

/** Propietarios de HubSpot, cacheados (cambian poquísimo). */
export type OwnerRecord = {
  id: string;
  email?: string;
  userId?: number;
  firstName?: string;
  lastName?: string;
  teams?: { id: string; name: string; primary?: boolean }[];
};

export function getOwners(): Promise<OwnerRecord[]> {
  return getCached("owners", TTL_SLOW, async () => {
    const data = await gateway<{ results: OwnerRecord[] }>("/crm/v3/owners?limit=200");
    return data.results ?? [];
  });
}

/** Mapa de valor interno → etiqueta visible para una propiedad enumerada de deals. */
type PropertyOption = { value: string; label: string };
type PropertyDefinition = { options?: PropertyOption[] };

export function getPropertyOptionLabels(propertyName: string): Promise<Map<string, string>> {
  return getCached(`prop-options:${propertyName}`, TTL_SLOW, async () => {
    const data = await gateway<PropertyDefinition>(`/crm/v3/properties/deals/${propertyName}`);
    const map = new Map<string, string>();
    for (const opt of data.options ?? []) {
      if (opt.value) map.set(opt.value, opt.label || opt.value);
    }
    return map;
  });
}

/* ------------------------------------------------------------------ */
/* Empresas: tipo de cliente (para excluir churn)                     */
/* ------------------------------------------------------------------ */

type CompanyProperty = { name: string; label: string };

/** Nombre interno de la propiedad de empresa cuya etiqueta es "tipo de cliente". */
export function getCompanyTypeProperty(): Promise<string | null> {
  return getCached("company-type-prop", TTL_SLOW, async () => {
    const data = await gateway<{ results: CompanyProperty[] }>("/crm/v3/properties/companies");
    const norm = (value: string) =>
      value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const exact = (data.results ?? []).find((prop) => norm(prop.label ?? "") === "tipo de cliente");
    const loose = (data.results ?? []).find((prop) => norm(prop.label ?? "").includes("tipo de cliente"));
    return exact?.name ?? loose?.name ?? null;
  });
}

const chunked = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/**
 * Ids de deals cuya empresa asociada tiene tipo de cliente = churn.
 * Tolerante a fallos: si HubSpot no responde devolvemos un set vacío.
 */
export function getChurnedDealIds(dealIds: string[]): Promise<Set<string>> {
  const key = `churn-deals:${dealIds.length}`;
  return getCached(key, TTL_SLOW, async () => {
    const empty = new Set<string>();
    if (!dealIds.length) return empty;
    try {
      const property = await getCompanyTypeProperty();
      if (!property) return empty;

      const companiesOfDeal = new Map<string, string[]>();
      const assocBatches = await Promise.all(
        chunked(dealIds, 100).map((batch) =>
          gateway<{ results: { from: { id: string }; to: { toObjectId: string | number }[] }[] }>(
            "/crm/v4/associations/deals/companies/batch/read",
            { method: "POST", body: JSON.stringify({ inputs: batch.map((id) => ({ id })) }) },
          ),
        ),
      );
      for (const data of assocBatches) {
        for (const row of data.results ?? []) {
          const ids = (row.to ?? []).map((target) => String(target.toObjectId));
          if (ids.length) companiesOfDeal.set(row.from.id, ids);
        }
      }

      const companyIds = [...new Set([...companiesOfDeal.values()].flat())];
      if (!companyIds.length) return empty;
      const churnedCompanies = new Set<string>();
      const readBatches = await Promise.all(
        chunked(companyIds, 100).map((batch) =>
          gateway<{ results: { id: string; properties: Props }[] }>(
            "/crm/v3/objects/companies/batch/read",
            {
              method: "POST",
              body: JSON.stringify({ properties: [property], inputs: batch.map((id) => ({ id })) }),
            },
          ),
        ),
      );
      for (const data of readBatches) {
        for (const row of data.results ?? []) {
          const raw = row.properties[property] ?? "";
          if (/churn/i.test(raw)) churnedCompanies.add(row.id);
        }
      }

      const churnedDeals = new Set<string>();
      for (const [dealId, ids] of companiesOfDeal) {
        if (ids.some((id) => churnedCompanies.has(id))) churnedDeals.add(dealId);
      }
      return churnedDeals;
    } catch (error) {
      console.warn("No pudimos leer el tipo de cliente de las empresas", error);
      return empty;
    }
  });
}

type HistoryVersion = { value?: string | null; timestamp?: string; sourceType?: string };
/**
 * Lectura de historial de propiedades Adobo del registro exacto de cada deal (batch/read ya autorizado).
 * `complete` es false si algún lote falló parcialmente o faltan registros; null si la lectura falla.
 * La clave de caché usa los IDs exactos ordenados y el conjunto de propiedades; el refresco manual la invalida.
 */
export function getAdoboPropertyHistory(dealIds: string[], props: readonly string[]):
  Promise<{ fetchedAt: string; complete: boolean; byDeal: Map<string, Record<string, HistoryVersion[]>> } | null> {
  const ids = [...new Set(dealIds)].sort();
  const propKey = [...new Set(props)].sort().join(",");
  return getCached(`adobo-history:${propKey}:${ids.join(",")}`, TTL_SLOW, async () => {
    if (!ids.length) return { fetchedAt: new Date().toISOString(), complete: true, byDeal: new Map() };
    try {
      const pages = await Promise.all(chunked(ids, 50).map((batch) =>
        gateway<{ status?: string; results?: { id: string; propertiesWithHistory?: Record<string, HistoryVersion[]> }[]; errors?: unknown[]; numErrors?: number }>(
          "/crm/v3/objects/deals/batch/read",
          { method: "POST", body: JSON.stringify({ properties: [], propertiesWithHistory: props, inputs: batch.map((id) => ({ id })) }) },
        )));
      const fetchedAt = new Date().toISOString();
      const byDeal = new Map<string, Record<string, HistoryVersion[]>>();
      let complete = true;
      for (const page of pages) {
        if ((page.status && page.status !== "COMPLETE") || (page.errors?.length ?? 0) > 0 || (page.numErrors ?? 0) > 0) complete = false;
        for (const row of page.results ?? []) if (row.propertiesWithHistory) byDeal.set(String(row.id), row.propertiesWithHistory);
      }
      if (ids.some((id) => !byDeal.has(id))) complete = false;
      return { fetchedAt, complete, byDeal };
    } catch (error) {
      console.error("[adobo-history] lectura fallida", error instanceof Error ? error.message : error);
      return null;
    }
  });
}
