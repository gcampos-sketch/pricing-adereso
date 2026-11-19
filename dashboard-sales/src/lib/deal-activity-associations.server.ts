import { gateway } from "./hubspot.server";

/** IDs de objetos asociados por deal, vía batch read de asociaciones v4. */
export async function readDealActivityLinks(
  dealIds: string[], type: "emails" | "calls" | "communications" | "meetings",
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < dealIds.length; i += 100) {
    const chunk = dealIds.slice(i, i + 100);
    const res = await gateway<{
      results: { from: { id: string }; to: { toObjectId: string | number }[]; paging?: {next?: {after?: string}} }[];
      errors?: { subCategory?: string; context?: { fromObjectId?: string[] } }[];
      numErrors?: number;
      status?: string;
    }>(`/crm/v4/associations/deals/${type}/batch/read`, {
      method: "POST",
      body: JSON.stringify({ inputs: chunk.map((id) => ({ id })) }),
    });
    if (res.status && res.status !== "COMPLETE") throw new Error("Lectura incompleta de asociaciones");
    const found = new Set<string>();
    for (const row of res.results ?? []) {
      if (!chunk.includes(row.from.id) || found.has(row.from.id) || !Array.isArray(row.to))
        throw new Error("Asociación inesperada");
      found.add(row.from.id);
    }
    const empty = new Set<string>();
    for (const error of res.errors ?? []) {
      if (error.subCategory !== "crm.associations.NO_ASSOCIATIONS_FOUND" ||
          !error.context?.fromObjectId?.length || !error.context.fromObjectId.every(id => chunk.includes(id))) throw new Error("Lectura incompleta de asociaciones");
      for (const id of error.context.fromObjectId) empty.add(id);
    }
    if ((res.numErrors ?? 0) > (res.errors?.length ?? 0) ||
        chunk.some(id => found.has(id) === empty.has(id))) throw new Error("Lectura incompleta de asociaciones");
    for (const id of empty) out.set(id, []);
    for (const row of res.results ?? []) {
      const ids = row.to.map(t => String(t.toObjectId));
      let after = row.paging?.next?.after;
      const seen=new Set<string>();
      while (after) {
        if (seen.has(after)) throw new Error('Paginación de asociaciones incompleta');
        seen.add(after);
        const page=await gateway<{results:{toObjectId:string|number}[];paging?:{next?:{after?:string}}}>(`/crm/v4/objects/deals/${row.from.id}/associations/${type}?limit=500&after=${encodeURIComponent(after)}`);
        ids.push(...page.results.map(t => String(t.toObjectId)));
        after = page.paging?.next?.after;
      }
      if (ids.some(id => !/^\d+$/.test(id))) throw new Error("ID de actividad inválido");
      out.set(row.from.id, [...new Set(ids)]);
    }
  }
  return out;
}
