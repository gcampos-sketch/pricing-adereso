import { commercialShortName } from "@/lib/report-title-scope";

export function ReportTitleScope({ period, owner }: { period?: string | undefined; owner?: string | undefined }) {
  const ownerSuffix = owner ? ` - ${commercialShortName(owner)}` : "";
  const context = `${period ? ` ${period}` : ""}${ownerSuffix}`;
  return context ? <span className="pulse-title-scope">{context}</span> : null;
}
