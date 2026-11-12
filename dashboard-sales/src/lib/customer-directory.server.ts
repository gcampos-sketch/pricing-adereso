import { gateway, type RawDeal } from "./hubspot.server";
import { CUSTOMER_WON_STAGES, CUSTOMER_CHURN_STAGE } from "./customer-accounts";

type CompanyLink = {
  toObjectId: string | number;
  associationTypes: { typeId: number; category?: string; label?: string | null }[];
};
type LinkPage = { results: CompanyLink[]; paging?: { next?: { after: string } } };
type BatchLinks = {
  results: { from: { id: string }; to: CompanyLink[]; paging?: { next?: { after: string } } }[];
  errors?: { subCategory: string; context?: { fromObjectId?: string[] } }[];
};
/** Some association batches time out; exact individual reads are a safe fallback, never an empty result. */
export async function readCustomerCompanyLinks(
  ids: string[],
  request = gateway,
): Promise<BatchLinks> {
  try {
    return await request<BatchLinks>("/crm/v4/associations/deals/companies/batch/read", {
      method: "POST",
      body: JSON.stringify({ inputs: ids.map((id) => ({ id })) }),
    });
  } catch (error) {
    if (!error || !["TimeoutError", "AbortError", "TypeError"].includes((error as Error).name))
      throw error;
    const results: BatchLinks["results"] = [];
    for (let offset = 0; offset < ids.length; offset += 3) {
      const rows = await Promise.all(
        ids.slice(offset, offset + 3).map(async (id) => {
          const page = await request<LinkPage>(
            `/crm/v4/objects/deals/${id}/associations/companies?limit=500`,
          );
          return {
            from: { id },
            to: page.results,
            ...(page.paging ? { paging: page.paging } : {}),
          };
        }),
      );
      results.push(...rows);
    }
    return { results };
  }
}

/** Complete bounded searches; fail closed on changed totals, missing pages or API ceiling. */
async function searchAll(kind: string, filterGroups: unknown[], properties: string[]) {
  const rows: RawDeal[] = [];
  let after: string | undefined;
  let total: number | undefined;
  const seen = new Set<string>();
  do {
    const page = await gateway<{
      total: number;
      results: RawDeal[];
      paging?: { next?: { after: string } };
    }>(`/crm/v3/objects/${kind}/search`, {
      method: "POST",
      body: JSON.stringify({ filterGroups, properties, limit: 200, ...(after ? { after } : {}) }),
    });
    total ??= page.total;
    if (total !== page.total) throw Error("El directorio cambió durante la lectura. Reintenta.");
    rows.push(...page.results);
    after = page.paging?.next?.after;
    if (after && (seen.has(after) || Number(after) >= 10000))
      throw Error("Lectura de clientes incompleta.");
    if (after) seen.add(after);
  } while (after);
  if (new Set(rows.map((row) => row.id)).size !== total)
    throw Error("Faltan registros del directorio de clientes.");
  return rows;
}
export async function readCustomerEvidence() {
  const companyProps = [
    "name",
    "hubspot_owner_id",
    "lifecyclestage",
    "tipo_de_cliente",
    "id_holding",
    "nombre_holding",
    "id_empresa",
  ];
  const companies = await searchAll(
    "companies",
    [
      { filters: [{ propertyName: "lifecyclestage", operator: "EQ", value: "customer" }] },
      { filters: [{ propertyName: "id_holding", operator: "HAS_PROPERTY" }] },
      { filters: [{ propertyName: "id_empresa", operator: "HAS_PROPERTY" }] },
    ],
    companyProps,
  );
  const deals = await searchAll(
    "deals",
    [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: "93085851" }] }],
    [
      "dealname",
      "dealstage",
      "pipeline",
      "industria_deal",
      "id_de_backoffice__negocio_",
      "nombre_instancia",
      "dealtype",
    ],
  );
  const associations: Record<string, { id: string; primary: boolean }[]> = {};
  // Small batches avoid HubSpot association timeouts on large sets of empty links.
  // Only current won/churn records can establish customer status or instance identity.
  // Open/lost deals cannot turn prospects into clients and need no association reads here.
  const relevant = deals.filter(
    (deal) =>
      CUSTOMER_WON_STAGES.has(deal.properties["dealstage"] ?? "") ||
      deal.properties["dealstage"] === CUSTOMER_CHURN_STAGE,
  );
  const batches = Array.from({ length: Math.ceil(relevant.length / 25) }, (_, index) =>
    relevant.slice(index * 25, index * 25 + 25),
  );
  for (let offset = 0; offset < batches.length; offset += 2) {
    await Promise.all(
      batches.slice(offset, offset + 2).map(async (batch) => {
        const page = await readCustomerCompanyLinks(batch.map((row) => row.id));
        for (const error of page.errors ?? []) {
          if (error.subCategory !== "crm.associations.NO_ASSOCIATIONS_FOUND")
            throw Error("No se pudieron verificar las empresas de todos los negocios.");
          for (const id of error.context?.fromObjectId ?? []) associations[id] = [];
        }
        for (const row of page.results) {
          const links = [...row.to];
          let after = row.paging?.next?.after;
          const seen = new Set<string>();
          while (after) {
            if (seen.has(after)) throw Error("Asociaciones incompletas.");
            seen.add(after);
            const next = await gateway<{
              results: CompanyLink[];
              paging?: { next?: { after: string } };
            }>(
              `/crm/v4/objects/deals/${row.from.id}/associations/companies?limit=500&after=${encodeURIComponent(after)}`,
            );
            links.push(...next.results);
            after = next.paging?.next?.after;
          }
          associations[row.from.id] = links.map((link) => ({
            id: String(link.toObjectId),
            primary: link.associationTypes.some(
              (type) => type.typeId === 5 && type.category === "HUBSPOT_DEFINED",
            ),
          }));
        }
        if (batch.some((row) => !(row.id in associations)))
          throw Error("Faltan asociaciones de negocios.");
      }),
    );
  }
  const known = new Set(companies.map((row) => row.id));
  const missing = [
    ...new Set(
      Object.values(associations)
        .flat()
        .map((row) => row.id),
    ),
  ].filter((id) => !known.has(id));
  for (let offset = 0; offset < missing.length; offset += 100) {
    const ids = missing.slice(offset, offset + 100);
    const page = await gateway<{ results: RawDeal[]; errors?: unknown[] }>(
      "/crm/v3/objects/companies/batch/read",
      {
        method: "POST",
        body: JSON.stringify({ properties: companyProps, inputs: ids.map((id) => ({ id })) }),
      },
    );
    if (page.errors?.length || new Set(page.results.map((row) => row.id)).size !== ids.length)
      throw Error("No se pudieron verificar todas las empresas asociadas.");
    companies.push(...page.results);
  }
  return { fetchedAt: new Date().toISOString(), companies, deals, associations };
}
