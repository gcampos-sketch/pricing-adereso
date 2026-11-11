import {
  gateway,
  getCached,
  getOwners,
  getPropertyOptionLabels,
  searchDealsCached,
  getCompanyTypeProperty,
  type Props,
  type OwnerRecord,
} from "./hubspot.server";
import { calendarDate, type ServiceOverview } from "./service-overview";

const batches = <T>(rows: T[], size = 100) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
    rows.slice(i * size, (i + 1) * size),
  );
/** Complete, global company/customer directory. No browser IDs or inferred lifecycle values. */
export async function readServiceOverview(): Promise<ServiceOverview> {
  return getCached("service-overview-v1", 90_000, async () => {
    const [owners, industries, development] = await Promise.all([
      getOwners(),
      getPropertyOptionLabels("industria_deal"),
      searchDealsCached(
        "service-development-v1",
        [
          { propertyName: "pipeline", operator: "EQ", value: "93085851" },
          { propertyName: "dealstage", operator: "IN", values: ["174677684", "1086544542"] },
        ],
        [
          "dealname",
          "dealstage",
          "amount",
          "hubspot_owner_id",
          "inicio_del_servicio",
          "industria_deal",
        ],
        40,
      ),
    ]);
    // Historical customer companies can still belong to archived CRM owners.
    const archivedOwners = await getCached("service-archived-owners", 600_000, async () => {
      const rows: OwnerRecord[] = [];
      let cursor: string | undefined;
      do {
        const page = await gateway<{
          results: OwnerRecord[];
          paging?: { next?: { after: string } };
        }>(
          `/crm/v3/owners?archived=true&limit=200${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`,
        );
        rows.push(...page.results);
        cursor = page.paging?.next?.after;
      } while (cursor);
      return rows;
    });
    const names = new Map(
      [...archivedOwners, ...owners].map((owner) => [
        owner.id,
        `${owner.firstName ?? ""} ${owner.lastName ?? ""}`.trim() || owner.email || "Sin nombre",
      ]),
    );
    const ownerName = (id: string | null | undefined) =>
      id ? (names.get(id) ?? "Propietario no disponible") : "Sin propietario";
    const industryName = (value: string | null | undefined) =>
      value ? (industries.get(value) ?? value) : "Sin industria";
    const companies: { id: string; properties: Props }[] = [];
    let after: string | undefined;
    let expectedTotal: number | undefined;
    do {
      const page = await gateway<{
        total: number;
        results: typeof companies;
        paging?: { next?: { after: string } };
      }>("/crm/v3/objects/companies/search", {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [
            { filters: [{ propertyName: "lifecyclestage", operator: "EQ", value: "customer" }] },
          ],
          properties: ["name", "hubspot_owner_id", "lifecyclestage"],
          limit: 200,
          ...(after ? { after } : {}),
        }),
      });
      expectedTotal ??= page.total;
      if (page.total !== expectedTotal) throw new Error('El directorio cambió durante la lectura. Vuelve a intentar para obtener una foto completa.');
      companies.push(...page.results);
      after = page.paging?.next?.after;
      if (after && Number(after) >= 10000)
        throw new Error(
          "El directorio supera el límite de búsqueda de HubSpot; no se muestra un conteo parcial.",
        );
    } while (after);
    if (new Set(companies.map(company => company.id)).size !== expectedTotal) throw new Error('La lectura de clientes está incompleta. Vuelve a intentar.');
    const associations = new Map<string, string[]>();
    for (const batch of batches(companies)) {
      const result = await gateway<{
        results: {
          from: { id: string };
          to: { toObjectId: string | number }[];
          paging?: { next?: { after: string } };
        }[];
        errors?: { subCategory?: string; context?: { fromObjectId?: string[] } }[];
      }>("/crm/v4/associations/companies/deals/batch/read", {
        method: "POST",
        body: JSON.stringify({ inputs: batch.map((row) => ({ id: row.id })) }),
      });
      // HubSpot returns an explicit NO_ASSOCIATIONS_FOUND error for an empty company.
      // Only those exact records are empty; other errors or unexplained missing rows fail closed.
      const emptyIds = (result.errors ?? [])
        .filter((error) => error.subCategory === "crm.associations.NO_ASSOCIATIONS_FOUND")
        .flatMap((error) => error.context?.fromObjectId ?? []);
      const covered = new Set([...result.results.map((row) => row.from.id), ...emptyIds]);
      if (
        result.errors?.some(
          (error) => error.subCategory !== "crm.associations.NO_ASSOCIATIONS_FOUND",
        ) ||
        batch.some((row) => !covered.has(row.id))
      )
        throw new Error("No se pudo completar la lectura de negocios asociados a clientes.");
      for (const id of emptyIds) associations.set(id, []);
      for (const row of result.results) {
        const ids = row.to.map((target) => String(target.toObjectId));
        let cursor = row.paging?.next?.after;
        while (cursor) {
          const page = await gateway<{
            results: { toObjectId: string | number }[];
            paging?: { next?: { after: string } };
          }>(
            `/crm/v4/objects/companies/${row.from.id}/associations/deals?limit=500&after=${encodeURIComponent(cursor)}`,
          );
          ids.push(...page.results.map((target) => String(target.toObjectId)));
          cursor = page.paging?.next?.after;
        }
        associations.set(row.from.id, [...new Set(ids)]);
      }
    }
    const linked = new Map<string, { id: string; name: string; industry: string }>();
    for (const batch of batches([...new Set([...associations.values()].flat())])) {
      const result = await gateway<{
        results: { id: string; properties: Props }[];
        errors?: unknown[];
      }>("/crm/v3/objects/deals/batch/read", {
        method: "POST",
        body: JSON.stringify({
          properties: ["dealname", "industria_deal", "pipeline"],
          inputs: batch.map((id) => ({ id })),
        }),
      });
      if (result.errors?.length || result.results.length !== batch.length)
        throw new Error("No se pudieron leer todas las industrias de los negocios asociados.");
      for (const row of result.results)
        if (row.properties["pipeline"] === "93085851")
          linked.set(row.id, {
            id: row.id,
            name: row.properties["dealname"] || "Sin nombre",
            industry: industryName(row.properties["industria_deal"]),
          });
    }
    // A failed churn lookup must not silently turn an excluded company into active MRR.
    const churnProperty = await getCompanyTypeProperty();
    if (!churnProperty) throw new Error("No está disponible la clasificación de clientes para verificar churn.");
    const developmentCompanies = new Map<string, string[]>();
    for (const batch of batches(development)) {
      const result = await gateway<{
        results: { from: { id: string }; to: { toObjectId: string | number }[]; paging?: { next?: { after: string } } }[];
        errors?: { subCategory?: string; context?: { fromObjectId?: string[] } }[];
      }>("/crm/v4/associations/deals/companies/batch/read", {
        method: "POST", body: JSON.stringify({ inputs: batch.map(row => ({ id: row.id })) }),
      });
      const empty = (result.errors ?? []).filter(error => error.subCategory === "crm.associations.NO_ASSOCIATIONS_FOUND").flatMap(error => error.context?.fromObjectId ?? []);
      const covered = new Set([...result.results.map(row => row.from.id), ...empty]);
      if (result.errors?.some(error => error.subCategory !== "crm.associations.NO_ASSOCIATIONS_FOUND") || batch.some(row => !covered.has(row.id))) throw new Error("No se pudo verificar churn de todos los negocios.");
      for (const row of result.results) {
        const ids = row.to.map(target => String(target.toObjectId));
        let cursor = row.paging?.next?.after;
        while (cursor) {
          const page = await gateway<{ results: { toObjectId: string | number }[]; paging?: { next?: { after: string } } }>(`/crm/v4/objects/deals/${row.from.id}/associations/companies?limit=500&after=${encodeURIComponent(cursor)}`);
          ids.push(...page.results.map(target => String(target.toObjectId)));
          cursor = page.paging?.next?.after;
        }
        developmentCompanies.set(row.from.id, [...new Set(ids)]);
      }
    }
    const churnedCompanies = new Set<string>();
    for (const batch of batches([...new Set([...developmentCompanies.values()].flat())])) {
      const result = await gateway<{ results: { id: string; properties: Props }[]; errors?: unknown[] }>("/crm/v3/objects/companies/batch/read", {
        method: "POST", body: JSON.stringify({ properties: [churnProperty], inputs: batch.map(id => ({ id })) }),
      });
      if (result.errors?.length || new Set(result.results.map(row => row.id)).size !== batch.length || batch.some(id => !result.results.some(row => row.id === id))) throw new Error("Lectura de churn incompleta.");
      for (const row of result.results) if (/churn/i.test(row.properties[churnProperty] ?? "")) churnedCompanies.add(row.id);
    }
    const churned = new Set([...developmentCompanies].filter(([, ids]) => ids.some(id => churnedCompanies.has(id))).map(([id]) => id));
    return {
      fetchedAt: new Date().toISOString(),
      customers: [...new Map(companies.map((company) => [company.id, company])).values()]
        .map((company) => {
          const deals = (associations.get(company.id) ?? []).flatMap((id) =>
            linked.has(id) ? [linked.get(id)!] : [],
          );
          return {
            id: company.id,
            name: company.properties["name"] || "Empresa sin nombre",
            owner: ownerName(company.properties["hubspot_owner_id"]),
            industries: [...new Set(deals.map((deal) => deal.industry))].sort(),
            deals,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
      development: development
        .filter((deal) => !churned.has(deal.id))
        .map((deal) => ({
          id: deal.id,
          name: deal.properties["dealname"] || "Sin nombre",
          owner: ownerName(deal.properties["hubspot_owner_id"]),
          industry: industryName(deal.properties["industria_deal"]),
          date: calendarDate(deal.properties["inicio_del_servicio"]),
          mrr: Math.max(0, Number(deal.properties["amount"]) || 0),
          stage:
            deal.properties["dealstage"] === "174677684" ? "E6 · Firmado" : "6.2 · En desarrollo",
        })),
    };
  });
}
