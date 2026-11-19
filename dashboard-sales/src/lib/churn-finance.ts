import type { ConfirmedChurn } from "./churn-forecast";

type DateVersion = { value: string; timestamp: string; sourceType: string; sourceId?: string };

export type ChurnCompany = {
  id: string;
  name: string;
  instance: string;
  holding: string;
  holdingName: string;
  lossDate: string;
  history: DateVersion[];
  risk: boolean;
  mrr: number;
  dealIds: string[];
};

export type ChurnSubmission = {
  id: string;
  name: string;
  serviceEnd: string | null;
  submittedOn: string;
};

export const churnTrackingSince = "2026-10-01";

const companyKey = (name: string) =>
  name.normalize("NFD").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Finance's reconciled cohort uses human-reviewed first-of-month loss dates.
 * Submitting the form can write Fecha Lost by itself, so retain its provenance. */
export function reviewedLossDate(company: ChurnCompany) {
  const versions = [...company.history].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const latest = versions[0];
  return latest && latest.sourceType === "CRM_UI" && latest.sourceId?.startsWith("userId:") &&
    latest.value === company.lossDate && company.lossDate.endsWith("-01") &&
    versions.every((version) => version.timestamp !== latest.timestamp || version.value === latest.value)
    ? latest : null;
}

export function financeChurn(
  companies: ChurnCompany[],
  submissions: ChurnSubmission[] | null,
  today: string,
) {
  const instances = new Map<string, number>();
  for (const row of companies) {
    if (row.instance) instances.set(row.instance, (instances.get(row.instance) ?? 0) + 1);
  }
  const confirmed = new Map<string, ConfirmedChurn>();
  const reconciled = new Set<string>();
  const confirmedNames = new Map<string, Set<string>>();
  const risk: { name: string; mrr: number }[] = [];
  const pendingCompanies: Pick<ChurnSubmission, "id" | "name" | "serviceEnd">[] = [];
  for (const row of companies) {
    const unique = Boolean(row.instance && instances.get(row.instance) === 1);
    if (row.lossDate >= churnTrackingSince) {
      if (!unique || !row.dealIds.length || row.mrr <= 0 || !reviewedLossDate(row)) {
        pendingCompanies.push({ id: `company-${row.id}`, name: row.name, serviceEnd: row.lossDate });
        continue;
      }
      const month = row.lossDate.slice(0, 7);
      const key = row.holding ? `holding:${row.holding}:${month}` : `company:${row.id}:${month}`;
      const group = confirmed.get(key) ?? { name: row.name, month, mrr: 0, dealIds: [] };
      if (confirmed.has(key) && row.holdingName) group.name = row.holdingName;
      group.mrr = Math.round((group.mrr + row.mrr) * 100) / 100;
      group.dealIds.push(...row.dealIds);
      confirmed.set(key, group);
      const names = confirmedNames.get(companyKey(row.name)) ?? new Set<string>();
      confirmedNames.set(companyKey(row.name), names);
      for (const version of row.history) {
        names.add(version.value);
        if (version.sourceType === "FORM" && version.sourceId) reconciled.add(version.sourceId);
      }
    } else if (row.risk && unique && row.mrr > 0 && !row.lossDate) {
      risk.push({ name: row.name, mrr: row.mrr });
    }
  }
  const pendingForms = visibleSubmissions(submissions, today)?.filter((row) =>
    !reconciled.has(row.id) && (!row.serviceEnd || !confirmedNames.get(companyKey(row.name))?.has(row.serviceEnd)),
  );
  return {
    confirmed: [...confirmed.values()],
    pending: pendingForms ? [...pendingForms, ...pendingCompanies] : null,
    risk: risk.sort((a, b) => b.mrr - a.mrr),
  };
}

export function visibleSubmissions(submissions: ChurnSubmission[] | null, today: string) {
  return submissions?.filter((row) =>
    (row.serviceEnd && row.serviceEnd >= today) || row.submittedOn >= churnTrackingSince,
  ).map(({ id, name, serviceEnd }) => ({ id, name, serviceEnd })) ?? null;
}
