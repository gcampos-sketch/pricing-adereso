import {
  searchDealsCached,
  getAdoboPropertyHistory,
  getCached,
  COMMERCIAL_PIPELINE,
} from "./hubspot.server";
import { roleOwnerIds, type RoleFilter } from "./owner-roles";
import {
  MEETING_PROPS,
  meetingsFromHistory,
  mergeMeetingRecords,
  type MeetingReport,
} from "./meeting-metrics";
const MEETING_IDENTITY_PROPS = [MEETING_PROPS[0], MEETING_PROPS[1]] as const;
export async function readMeetingMetrics(role: RoleFilter): Promise<MeetingReport> {
  if (!import.meta.env.DEV) {
    const { readCommercialEvidence } = await import('./commercial-evidence.server');
    const edition = await readCommercialEvidence();
    if (edition) {
      const { scopeEvidenceMeetings } = await import('./commercial-evidence');
      return scopeEvidenceMeetings(edition, role);
    }
  }
  // Private validation edition for the local preview only. Never shipped or read in production.
  if (import.meta.env.DEV) {
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    let text: string | null = null;
    try {
      text = await readFile(
        resolve(process.cwd(), ".migration-backups/diio-meetings.json"),
        "utf8",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (text) {
      const report = JSON.parse(text) as MeetingReport;
      if (
        report.source !== "diio-hubspot" ||
        !Array.isArray(report.events) ||
        !report.validation ||
        !Number.isFinite(Date.parse(report.fetchedAt))
      )
        throw Error("Registro local de Diio inválido.");
      try {
        const companyEdition = JSON.parse(
          await readFile(
            resolve(process.cwd(), ".migration-backups/meeting-companies.json"),
            "utf8",
          ),
        );
        if (
          companyEdition.method !== "verified-meeting-account-company/v1" ||
          !Number.isFinite(Date.parse(companyEdition.checkedAt))
        )
          throw Error("Edición de empresas de reuniones inválida");
        if (companyEdition.accountIdentityAuthority === "hubspot-id-holding")
          report.accountIdentityAuthority = "hubspot-id-holding";
        if (
          companyEdition.portfolio?.complete === true &&
          Array.isArray(companyEdition.portfolio.companies)
        )
          report.portfolio = companyEdition.portfolio;
        report.events = report.events.map((event) => ({
          ...event,
          ...(companyEdition.byMeeting[event.id] ?? {
            companies: [],
            companyAttributionComplete: false,
          }),
        }));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (report.classificationAuthority !== "diio") {
        report.validation.classified = 0;
        report.events = report.events.map((event) => ({
          ...event,
          type: "unknown",
          classification: "Pendiente de clasificación verificable en Diio",
        }));
      }
      try {
        const [crm, calendar] = await Promise.all([
          readFile(resolve(process.cwd(), ".migration-backups/hubspot-meeting-audit.json"), "utf8"),
          readFile(
            resolve(process.cwd(), ".migration-backups/meeting-calendar-audit.json"),
            "utf8",
          ),
        ]);
        const { buildMeetingCoverage } = await import("./meeting-coverage");
        const registry = JSON.parse(crm);
        report.coverage = buildMeetingCoverage(
          registry.records,
          JSON.parse(calendar),
          report,
          registry,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const allowed = roleOwnerIds(role);
      if (!allowed) return report;
      if (report.portfolio)
        report.portfolio.companies = report.portfolio.companies.filter((company) =>
          allowed.has(company.ownerId ?? ""),
        );
      if (report.participationAuthority === "diio-recording") {
        if (report.coverage)
          report.coverage.events = report.coverage.events.filter((event) =>
            allowed.has(event.activityOwnerId),
          );
        return {
          ...report,
          events: report.events.flatMap((event) => {
            const participants =
              event.participants?.filter((person) => allowed.has(person.ownerId)) ?? [];
            return participants.length ? [{ ...event, participants }] : [];
          }),
        };
      }
      const deals = await searchDealsCached(
        "diio-meeting-role-deals",
        [{ propertyName: "pipeline", operator: "EQ", value: COMMERCIAL_PIPELINE }],
        ["hubspot_owner_id"],
        40,
      );
      const ids = new Set(
        deals
          .filter((row) => allowed.has(row.properties["hubspot_owner_id"] ?? ""))
          .map((row) => row.id),
      );
      if (report.coverage)
        report.coverage.events = report.coverage.events.flatMap((event) => {
          const dealIds = event.dealIds.filter((id) => ids.has(id));
          return dealIds.length ? [{ ...event, dealIds }] : [];
        });
      return {
        ...report,
        events: report.events.flatMap((event) => {
          const dealIds = event.dealIds.filter((id) => ids.has(id));
          return dealIds.length ? [{ ...event, dealIds }] : [];
        }),
      };
    }
  }
  return getCached(`meeting-identities-v2:${role}`, 300_000, async () => {
    const allowed = roleOwnerIds(role);
    const deals = (
      await searchDealsCached(
        "meeting-identity-candidates-v2",
        [{ propertyName: "pipeline", operator: "EQ", value: COMMERCIAL_PIPELINE }],
        [...MEETING_IDENTITY_PROPS, "adobo_reus_analizadas_count", "hubspot_owner_id"],
        40,
      )
    ).filter((deal) => !allowed || allowed.has(deal.properties["hubspot_owner_id"] ?? ""));
    const candidates = deals.filter(
      (deal) =>
        MEETING_IDENTITY_PROPS.some((key) => !!deal.properties[key]) ||
        Number(deal.properties["adobo_reus_analizadas_count"]) > 0,
    );
    const records: ReturnType<typeof meetingsFromHistory>["records"] = [];
    let unresolved = 0,
      scannedDeals = 0;
    let complete = true;
    // Bounded sequential reads, independent from score history and not persisted as CRM writes.
    for (let start = 0; start < candidates.length; start += 50) {
      const batch = candidates.slice(start, start + 50);
      const history = await getAdoboPropertyHistory(
        batch.map((row) => row.id),
        MEETING_IDENTITY_PROPS,
      );
      if (!history) {
        complete = false;
        continue;
      }
      complete &&= history.complete;
      for (const deal of batch) {
        const values = history.byDeal.get(deal.id);
        if (!values) {
          complete = false;
          continue;
        }
        scannedDeals++;
        const result = meetingsFromHistory(deal.id, values);
        records.push(...result.records);
        unresolved += result.unresolved;
        if (!result.records.length && !result.unresolved) unresolved++;
      }
    }
    const merged = mergeMeetingRecords(records);
    return {
      fetchedAt: new Date().toISOString(),
      ...merged,
      events: merged.events.map((event) => ({
        ...event,
        type: "unknown" as const,
        classification: "Pendiente de clasificación verificable en Diio",
      })),
      candidateDeals: candidates.length,
      scannedDeals,
      unresolved,
      complete,
    };
  });
}
