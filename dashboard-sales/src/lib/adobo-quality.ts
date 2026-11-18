import type { DealDTO } from "./pulse-types";
import { ADOBO_COMMERCIAL_GROUPS, numericValue, type AdoboProperty } from "./adobo-intelligence";
import { roleOfOwner, type RoleFilter } from "./owner-roles";

export function activeQualityDeal(
  p: Record<string, string | null | undefined>,
  won: ReadonlySet<string>,
  lost: ReadonlySet<string>,
) {
  const stage = p["dealstage"] ?? "";
  return !!stage && p["hs_is_closed"] !== "true" && !won.has(stage) && !lost.has(stage);
}
export function qualityScope(deals: DealDTO[], owner: string, role: RoleFilter, stages: string[]) {
  return [
    ...new Map(
      deals
        .filter(
          (d) =>
            (owner === "team" || d.ownerId === (owner === "__unassigned" ? "" : owner)) &&
            (role === "all" || roleOfOwner(d.ownerId) === role) &&
            (!stages.length || stages.includes(d.stage)),
        )
        .map((d) => [d.id, d]),
    ).values(),
  ];
}
export const fieldValue = (d: DealDTO, key: AdoboProperty) =>
  d.adobo?.properties?.[key]?.trim() || null;
export function qualityScore(d: DealDTO) {
  const n = numericValue(fieldValue(d, "adobo_closing_score"));
  return n != null && n >= 0 && n <= 100 ? n : null;
}
export function scoreBand(d: DealDTO) {
  const s = qualityScore(d);
  return s == null
    ? "Sin score válido"
    : s < 25
      ? "0–24"
      : s < 50
        ? "25–49"
        : s < 75
          ? "50–74"
          : "75–100";
}
export function qualityBuckets(deals: DealDTO[], value: (d: DealDTO) => string) {
  const buckets = new Map<string, DealDTO[]>();
  for (const d of deals) {
    const k = value(d);
    buckets.set(k, [...(buckets.get(k) ?? []), d]);
  }
  return [...buckets]
    .map(([label, deals]) => ({ label, deals }))
    .sort((a, b) => b.deals.length - a.deals.length || a.label.localeCompare(b.label));
}
export function propertyCoverage(deals: DealDTO[]) {
  return ADOBO_COMMERCIAL_GROUPS.map((group) => ({
    name: group.name,
    fields: group.fields.map(([key, label]) => ({
      key,
      label,
      present: deals.filter((d) => fieldValue(d, key) != null),
      missing: deals.filter((d) => fieldValue(d, key) == null),
    })),
  }));
}
export const qualityInPeriod = (at: string, year: string, quarter: string) => {
  if (!Number.isFinite(Date.parse(at))) return false;
  return (
    at.slice(0, 4) === year &&
    (quarter === "all" || String(Math.floor((Number(at.slice(5, 7)) - 1) / 3) + 1) === quarter)
  );
};

/** Never turn capped, changing or duplicated pages into a complete coverage denominator. */
export async function completeQualityInventory<T extends { id: string }>(
  load: (
    after?: string,
  ) => Promise<{ results: T[]; total?: number; paging?: { next?: { after?: string } } }>,
) {
  const rows = new Map<string, T>(),
    seen = new Set<string>();
  let after: string | undefined, total: number | undefined;
  for (let page = 0; page < 50; page++) {
    const data = await load(after);
    if (
      !Array.isArray(data.results) ||
      !Number.isInteger(data.total) ||
      data.total! < 0 ||
      data.total! > 10000
    )
      throw Error("Inventario Adobo incompleto: total no verificable.");
    if (total != null && data.total !== total)
      throw Error("El inventario cambió durante la lectura. Actualiza para conciliar.");
    total = data.total;
    for (const row of data.results) {
      if (rows.has(row.id)) throw Error("Inventario Adobo con registros duplicados.");
      rows.set(row.id, row);
    }
    after = data.paging?.next?.after;
    if (!after) {
      if (rows.size !== total) throw Error("Inventario Adobo incompleto: faltan registros.");
      return [...rows.values()];
    }
    if (seen.has(after)) throw Error("Inventario Adobo incompleto: cursor repetido.");
    seen.add(after);
  }
  throw Error("Inventario Adobo incompleto: límite de búsqueda alcanzado.");
}

export function qualityDisplayValue(raw: string | null): string {
  if (raw == null) return "Sin dato · pendiente de validar";
  if (raw === "true") return "Sí";
  if (raw === "false") return "No";
  return raw;
}
