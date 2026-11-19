import { z } from "zod";
import type { ChurnForecast } from "./churn-forecast";
import { churnTrackingSince, financeChurn, visibleSubmissions, type ChurnCompany, type ChurnSubmission } from "./churn-finance";
import { readCustomerCompanyLinks, searchAll } from "./customer-directory.server";
import { CUSTOMER_CHURN_STAGE } from "./customer-accounts";
import { COMMERCIAL_PIPELINE, gateway, getCached, type RawDeal } from "./hubspot.server";
import { isRenewalDeal } from "./quota-eligibility";

const formId = "845c2848-bebf-4a4e-90da-61be3323491b";
const date = z.iso.date();
const serviceStage = "173990327";
const riskStatus = "Riesgo Fuga";
const companyProperties = ["name", "id_empresa", "id_holding", "nombre_holding", "fecha_lost", "mrr_neto", "salud", "tipo_de_cliente"];
const batchesOf = <T>(rows: T[], limit: number) =>
  Array.from({ length: Math.ceil(rows.length / limit) }, (_, index) => rows.slice(index * limit, (index + 1) * limit));

async function readFinanceCompanies(): Promise<ChurnCompany[]> {
  const companies = await searchAll("companies", [
    { filters: [{ propertyName: "fecha_lost", operator: "GTE", value: String(Date.parse(churnTrackingSince)) }] },
    { filters: [{ propertyName: "salud", operator: "EQ", value: riskStatus }] },
  ], companyProperties);
  const dated = companies.filter(({ properties }) => (properties["fecha_lost"] ?? "") >= churnTrackingSince);
  const histories = new Map<string, ChurnCompany["history"]>();
  for (const batch of batchesOf(dated, 100)) {
    const result = await gateway<{ results: (RawDeal & { propertiesWithHistory?: { fecha_lost?: ChurnCompany["history"] } })[] }>(
      "/crm/v3/objects/companies/batch/read", {
        method: "POST",
        body: JSON.stringify({
          inputs: batch.map(({ id }) => ({ id })),
          properties: ["fecha_lost"],
          propertiesWithHistory: ["fecha_lost"],
        }),
      },
    );
    if (result.results.length !== batch.length) throw new Error("Lectura incompleta de fechas de baja.");
    for (const row of result.results) histories.set(row.id, row.propertiesWithHistory?.fecha_lost ?? []);
  }

  const dealIdsByCompany = new Map<string, string[]>();
  const instances = [...new Set(dated.map((row) => row.properties["id_empresa"]).filter((id): id is string => Boolean(id)))];
  const companyById = new Map(dated.map((row) => [row.id, row]));
  for (const batch of batchesOf(instances, 100)) {
    const deals = await searchAll("deals", [{ filters: [
      { propertyName: "pipeline", operator: "EQ", value: COMMERCIAL_PIPELINE },
      { propertyName: "dealstage", operator: "IN", values: [serviceStage, CUSTOMER_CHURN_STAGE] },
      { propertyName: "id_de_backoffice__negocio_", operator: "IN", values: batch },
      { propertyName: "amount", operator: "GT", value: "0" },
    ] }], ["id_de_backoffice__negocio_", "dealtype"]);
    const eligible = deals.filter((row) => !isRenewalDeal({ dealType: row.properties["dealtype"] ?? null }));
    for (const group of batchesOf(eligible, 25)) {
      const byId = new Map(group.map((row) => [row.id, row.properties["id_de_backoffice__negocio_"]]));
      const links = await readCustomerCompanyLinks(group.map(({ id }) => id));
      const accounted = new Set(links.errors?.flatMap((error) =>
        error.subCategory === "crm.associations.NO_ASSOCIATIONS_FOUND" ? error.context?.fromObjectId ?? [] : [],
      ));
      for (const row of links.results) {
        if (row.paging?.next) throw new Error("Asociaciones incompletas para bajas programadas.");
        accounted.add(row.from.id);
        const matched = row.to.map((link) => String(link.toObjectId)).filter((id) =>
          companyById.get(id)?.properties["id_empresa"] === byId.get(row.from.id) && companyById.has(id),
        );
        if (matched.length !== 1) continue;
        const companyId = matched[0]!;
        const existing = dealIdsByCompany.get(companyId) ?? [];
        existing.push(row.from.id);
        dealIdsByCompany.set(companyId, existing);
      }
      if (group.some(({ id }) => !accounted.has(id))) throw new Error("Asociaciones incompletas para bajas programadas.");
    }
  }

  return companies.map(({ id, properties }) => ({
    id,
    name: properties["name"] ?? "Empresa sin nombre",
    instance: properties["id_empresa"] ?? "",
    holding: properties["id_holding"] ?? "",
    holdingName: properties["nombre_holding"] ?? "",
    lossDate: date.safeParse(properties["fecha_lost"]).data ?? "",
    history: histories.get(id) ?? [],
    risk: properties["salud"] === riskStatus && properties["tipo_de_cliente"] !== "Churn",
    mrr: Math.max(0, Number(properties["mrr_neto"]) || 0),
    dealIds: dealIdsByCompany.get(id) ?? [],
  }));
}

type FormPage = {
  results: { conversionId: string; submittedAt: number; values: { name: string; value: string }[] }[];
  paging?: { next?: { after?: string } };
};

async function readSubmissions() {
  const submissions = new Map<string, ChurnSubmission>();
  let after: string | undefined;
  const cursors = new Set<string>();
  do {
    const params = new URLSearchParams({ limit: "50" });
    if (after) params.set("after", after);
    const page = await gateway<FormPage>(`/form-integrations/v1/submissions/forms/${formId}?${params}`);
    for (const row of page.results) {
      const values = new Map(row.values.map(({ name, value }) => [name, value]));
      const raw = values.get("fecha_lost")?.trim() ?? "";
      const calendar = /^\d{13}$/.test(raw)
        ? new Date(Number(raw)).toISOString().slice(0, 10)
        : raw.slice(0, 10);
      submissions.set(row.conversionId, {
        id: row.conversionId,
        name: values.get("company")?.trim() || "Instancia sin identificar",
        serviceEnd: date.safeParse(calendar).success ? calendar : null,
        submittedOn: new Date(row.submittedAt).toISOString().slice(0, 10),
      });
    }
    after = page.paging?.next?.after;
    if (after && cursors.has(after)) throw new Error("Paginación repetida en formulario de bajas.");
    if (after) cursors.add(after);
  } while (after);
  return [...submissions.values()];
}

export async function readChurnForecast(): Promise<ChurnForecast> {
  const [finance, submissions] = await Promise.allSettled([
    getCached("churn-finance-companies", 90_000, readFinanceCompanies),
    getCached("churn-form-submissions", 90_000, readSubmissions),
  ]);
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Coyhaique" }).format(now);
  const forms = submissions.status === "fulfilled" ? submissions.value : null;
  if (finance.status === "rejected") {
    console.warn("No se pudieron consultar las bajas de empresas en HubSpot.");
    return { confirmed: null, readOn: null, pending: visibleSubmissions(forms, today), risk: [] };
  }
  return { ...financeChurn(finance.value, forms, today), readOn: today };
}
