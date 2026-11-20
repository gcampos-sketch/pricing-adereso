import { gateway, type OwnerRecord } from "./hubspot.server";
import { searchAll } from "./customer-directory.server";
import { readCommercialEvidence } from "./commercial-evidence.server";
import { buildKamCoverage, kamPeriod } from "./kam-brief";
import { KAM_OWNER_IDS } from "./owner-roles";
import type { MeetingCompany } from "./meeting-metrics";

export async function readKamBrief(email: string, ownerId?: string, period?: string) {
  const owners: (OwnerRecord & { archived?: boolean })[] = [];
  let after: string | undefined;
  const seen = new Set<string>();
  do {
    const page = await gateway<{ results: typeof owners; paging?: { next?: { after: string } } }>(
      `/crm/v3/owners?limit=500${after ? `&after=${encodeURIComponent(after)}` : ""}`,
    );
    owners.push(...page.results);
    after = page.paging?.next?.after;
    if (after && seen.has(after)) throw Error("Lectura de owners incompleta.");
    if (after) seen.add(after);
  } while (after);
  const matches = owners.filter(
    (owner) =>
      !owner.archived &&
      (ownerId ? owner.id === ownerId : owner.email?.toLowerCase() === email.toLowerCase()),
  );
  const owner = matches.length === 1 ? matches[0] : undefined;
  if (!owner || !KAM_OWNER_IDS.has(owner.id))
    throw Error("No se encontró un único owner KAM vigente. No se asigna cartera por nombre.");
  const raw = await searchAll(
    "companies",
    [{ filters: [{ propertyName: "hubspot_owner_id", operator: "EQ", value: owner.id }] }],
    ["name", "hubspot_owner_id", "id_holding", "nombre_holding", "id_empresa"],
  );
  const portfolioCheckedAt = new Date().toISOString();
  const companies: MeetingCompany[] = raw.map((row) => ({
    id: row.id,
    name: row.properties["name"] || `Empresa ${row.id}`,
    ownerId: row.properties["hubspot_owner_id"] ?? "",
    holdingId: row.properties["id_holding"] ?? "",
    holdingName: row.properties["nombre_holding"] ?? "",
    url: `https://app.hubspot.com/contacts/23480943/company/${row.id}`,
  }));
  let edition = null,
    meetingsError: string | null = null;
  try {
    edition = await readCommercialEvidence();
  } catch {
    meetingsError = "No se pudo leer la edición privada de reuniones.";
  }
  const now = new Date();
  return {
    schema: "kam-brief/v1",
    checkedAt: now.toISOString(),
    owner: {
      id: owner.id,
      name: `${owner.firstName ?? ""} ${owner.lastName ?? ""}`.trim(),
      email: owner.email,
    },
    coverage: {
      ...buildKamCoverage({
        ownerId: owner.id,
        period: period ?? kamPeriod(now),
        companies,
        portfolioCheckedAt,
        meetings: edition?.meetings ?? null,
        now,
      }),
      meetingsError,
    },
    // Instance IDs are returned as identity evidence for the consumption join, never matched by client name.
    portfolio: {
      complete: true,
      checkedAt: portfolioCheckedAt,
      companies: companies.map((company) => ({
        ...company,
        instanceId: raw.find((row) => row.id === company.id)?.properties["id_empresa"] || null,
      })),
    },
    overages: {
      status: "unavailable",
      value: null,
      reason:
        "El conector no tiene una fuente vigente de consumo y cupo contratado conciliada por instancia/holding. La cartera KAM ya está disponible; no sustituirla por asignación CSM ni concluir cero excedentes.",
    },
    url: "https://adereso-hub-comercial.onrender.com/?dashboard=1",
  };
}
