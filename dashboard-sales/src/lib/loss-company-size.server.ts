import { readCustomerCompanyLinks } from "./customer-directory.server";
import { gateway, type RawDeal } from "./hubspot.server";

/** Match the primary company, or the only associated company when there is no primary. */
export async function readLossCompanySizes(dealIds: string[]) {
  const companiesByDeal = new Map<string, string>();
  for (let offset = 0; offset < dealIds.length; offset += 50) {
    const batch = dealIds.slice(offset, offset + 50);
    await Promise.all([batch.slice(0, 25), batch.slice(25)].filter(ids => ids.length).map(async ids => {
      const page = await readCustomerCompanyLinks(ids);
      const checked = new Set<string>();
      for (const error of page.errors ?? []) {
        if (error.subCategory !== "crm.associations.NO_ASSOCIATIONS_FOUND")
          throw new Error("Error al leer las empresas asociadas");
        for (const id of error.context?.fromObjectId ?? []) checked.add(id);
      }
      for (const row of page.results) {
        const links = [...row.to];
        let after = row.paging?.next?.after;
        const cursors = new Set<string>();
        while (after) {
          if (cursors.has(after)) throw new Error("Asociaciones de empresa incompletas");
          cursors.add(after);
          const next = await gateway<{ results: typeof links; paging?: typeof row.paging }>(
            `/crm/v4/objects/deals/${row.from.id}/associations/companies?limit=500&after=${encodeURIComponent(after)}`,
          );
          links.push(...next.results);
          after = next.paging?.next?.after;
        }
        checked.add(row.from.id);
        const primary = links.filter(link => link.associationTypes.some(type =>
          type.category === "HUBSPOT_DEFINED" && type.typeId === 5,
        ));
        const targets = new Set((primary.length ? primary : links).map(link => String(link.toObjectId)));
        if (targets.size === 1) companiesByDeal.set(row.from.id, [...targets][0]!);
      }
      if (ids.some(id => !checked.has(id))) throw new Error("Faltan asociaciones de empresa");
    }));
  }
  const companyIds = [...new Set(companiesByDeal.values())];
  const sizes = new Map<string, string>();
  for (let offset = 0; offset < companyIds.length; offset += 100) {
    const ids = companyIds.slice(offset, offset + 100);
    const page = await gateway<{ results: RawDeal[]; errors?: unknown[] }>("/crm/v3/objects/companies/batch/read", {
      method: "POST",
      body: JSON.stringify({ properties: ["segmentacion"], inputs: ids.map(id => ({ id })) }),
    });
    if (page.errors?.length || new Set(page.results.map(row => row.id)).size !== ids.length)
      throw new Error("Faltan datos de segmentación de las empresas");
    for (const row of page.results) {
      const segment = row.properties["segmentacion"]?.trim();
      if (segment) sizes.set(row.id, segment);
    }
  }
  return new Map([...companiesByDeal].map(([dealId, companyId]) => [dealId, sizes.get(companyId) ?? null]));
}
