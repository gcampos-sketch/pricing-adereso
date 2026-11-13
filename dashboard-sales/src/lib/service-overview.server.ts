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
import { calendarDate, type ServiceOverview, type ServiceCustomer } from "./service-overview";
import { readCustomerEvidence } from "./customer-directory.server";
import { reconcileCustomerAccounts, CUSTOMER_WON_STAGES, CUSTOMER_CHURN_STAGE } from "./customer-accounts";

const batches = <T>(rows: T[], size = 100) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
    rows.slice(i * size, (i + 1) * size),
  );
/** Complete, global company/customer directory. No browser IDs or inferred lifecycle values. */
export async function readServiceOverview(): Promise<ServiceOverview> {
  return getCached("service-overview-accounts-v5", 90_000, async () => {
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
    const evidence = await getCached("customer-evidence-v1", 600_000, readCustomerEvidence);
    const reconciled = reconcileCustomerAccounts(evidence);
    const customer = (group: (typeof reconciled.active)[number]): ServiceCustomer => {
      const ordered = [...group.companies].sort((a, b) => a.id.localeCompare(b.id));
      const representative = ordered.find((row) => row.properties["nombre_holding"]) ?? ordered[0]!;
      const deals = group.deals
        .filter((deal) => CUSTOMER_WON_STAGES.has(deal.properties["dealstage"] ?? "") || (reconciled.churnOnly.includes(group) && deal.properties["dealstage"] === CUSTOMER_CHURN_STAGE))
        .map((deal) => ({
          id: deal.id,
          name: deal.properties["dealname"] || "Sin nombre",
          industry: industryName(deal.properties["industria_deal"]),
          instanceId: deal.properties["id_de_backoffice__negocio_"] || "",
          stage: deal.properties["dealstage"] || "",
        }));
      const reasons = [];
      if (ordered.some((row) => row.properties["tipo_de_cliente"] === "Churn"))
        reasons.push(
          reconciled.pending.includes(group)
            ? "Etiqueta Churn y negocio ganado vigente: confirmar estado real antes de incluir."
            : "Una empresa figura Churn; el holding conserva otro ganado asociado a una empresa sin esa etiqueta.",
        );
      if (!group.holdingId && !group.instanceIds.length)
        reasons.push("Sin ID Holding ni ID de instancia: identidad pendiente.");
      if (group.deals.some((deal) => reconciled.audit.mismatchedDealInstances.includes(deal.id)))
        reasons.push(
          "Hay un negocio cuyo ID de instancia difiere del de la empresa. Se conserva la identidad de la empresa, sin fusionarla por ese ID.",
        );
      return {
        id: representative.id,
        name:
          representative.properties["nombre_holding"] ||
          representative.properties["name"] ||
          "Sin nombre",
        owner: [
          ...new Set(ordered.map((row) => ownerName(row.properties["hubspot_owner_id"]))),
        ].join(" · "),
        owners: [...new Set(ordered.map((row) => ownerName(row.properties["hubspot_owner_id"])))],
        holdingId: group.holdingId,
        instanceIds: group.instanceIds,
        companies: ordered.map((row) => ({
          id: row.id,
          name: row.properties["name"] || "Sin nombre",
          owner: ownerName(row.properties["hubspot_owner_id"]),
          lifecycle: row.properties["lifecyclestage"] || "",
        })),
        industries: [...new Set(deals.map((deal) => deal.industry))].sort(),
        deals,
        reviewReasons: reasons,
      };
    };
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
      fetchedAt: evidence.fetchedAt,
      customers: reconciled.active.map(customer).sort((a, b) => a.name.localeCompare(b.name)),
      churnCustomers: reconciled.churnOnly
        .filter((group) => group.holdingId || group.instanceIds.length)
        .map(customer)
        .sort((a, b) => a.name.localeCompare(b.name)),
      pendingCustomers: reconciled.pending
        .map(customer)
        .sort((a, b) => a.name.localeCompare(b.name)),
      customerAudit: reconciled.audit,
      unresolvedCustomerDeals: evidence.deals
        .filter((deal) => reconciled.audit.unresolvedWon.includes(deal.id))
        .map((deal) => ({ id: deal.id, name: deal.properties["dealname"] || "Sin nombre" })),
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
