import type { DealDTO, StageJourney } from "./pulse-types";
import { hasOrderedActivation } from "./story-metrics";
import { roleOfOwner } from "./owner-roles";

export function generationEntryDate(row: StageJourney): string {
  return (
    [row.entered["E0"], row.entered["E1"]]
      .filter((date): date is string => !!date && Number.isFinite(Date.parse(date)))
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? ""
  );
}
const periodOf = (date: string) => {
  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp)) return "";
  const value = new Date(timestamp);
  return `${value.getUTCFullYear()}-Q${Math.floor(value.getUTCMonth() / 3) + 1}`;
};
/** Every card is an event population; creation/close/current stage never supply absent entry dates. */
export function generationStageEntries(input: StageJourney[], periods: string[]) {
  const rows = [...new Map(input.map((row) => [row.deal.id, row])).values()];
  const selected = new Set(periods);
  const inPeriod = (date: string) => selected.has(periodOf(date));
  const activatedAt = (row: StageJourney) =>
    roleOfOwner(row.deal.ownerId) === "KAM" && !hasOrderedActivation(row.entered)
      ? ""
      : (row.entered["E1"] ?? "");
  const generated = rows.filter((row) => inPeriod(generationEntryDate(row)));
  const activated = rows.filter((row) => inPeriod(activatedAt(row)));
  const valued = rows.filter(
    (row) => inPeriod(row.entered["E4"] ?? "") && row.deal.amountValue > 0,
  );
  const lost = rows.filter((row) => {
    const lostAt = row.entered["LOST"] ?? "";
    const activation = activatedAt(row);
    return (
      inPeriod(lostAt) &&
      Number.isFinite(Date.parse(activation)) &&
      Date.parse(activation) <= Date.parse(lostAt)
    );
  });
  const lostFromE1 = lost.filter(
    (row) =>
      !Object.entries(row.entered).some(
        ([stage, date]) =>
          !["E0", "E1", "LOST"].includes(stage) &&
          Number.isFinite(Date.parse(date)) &&
          Date.parse(date) <= Date.parse(row.entered["LOST"]!),
      ),
  );
  return { generated, activated, valued, lost, lostFromE1 };
}
const normalize = (raw: string) =>
  raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\[\]]/g, "")
    .replace(/[_\s-]+/g, " ");
/** Creation-source attribution, never CRM created-by or current commercial role. */
export function generationSourceRows(deals: DealDTO[], role: "AE" | "KAM" | "all") {
  const definitions =
    role === "KAM"
      ? [
          ["kam", "KAM Adereso"],
          ["cs", "CS Adereso"],
        ]
      : role === "AE"
        ? [
            ["ae", "AE Adereso"],
            ["sdr", "SDR Adereso"],
          ]
        : [
            ["kam", "KAM Adereso"],
            ["cs", "CS Adereso"],
            ["ae", "AE Adereso"],
            ["sdr", "SDR Adereso"],
          ];
  const keyOf = (raw: string) => {
    const value = normalize(raw);
    if (["kam", "kam adereso", "kam adereso recuperacion"].includes(value)) return "kam";
    if (["customer success", "cs adereso"].includes(value)) return "cs";
    if (["account exec", "ae adereso", "ae adereso recuperacion"].includes(value)) return "ae";
    if (
      [
        "prospeccion sdr",
        "prospeccion sdr adereso",
        "form de contacto inbound",
        "form de contacto inbound adereso",
        "form de calificacion inbound",
        "form calificacion inbound",
        "form calific. (inbound)",
      ].includes(value)
    )
      return "sdr";
    return value ? `source:${raw.trim()}` : "missing";
  };
  const buckets = new Map<string, DealDTO[]>();
  for (const deal of new Map(deals.map((deal) => [deal.id, deal])).values()) {
    const key = keyOf(deal.source ?? "");
    buckets.set(key, [...(buckets.get(key) ?? []), deal]);
  }
  const label = new Map(definitions.map(([key, label]) => [key!, label!]));
  // Other recorded sources remain explicit, so the chips always reconcile to the card total.
  const allLabels = new Map([
    ["kam", "KAM Adereso"],
    ["cs", "CS Adereso"],
    ["ae", "AE Adereso"],
    ["sdr", "SDR Adereso"],
    ["missing", "Sin fuente registrada"],
  ]);
  return [...new Set([...definitions.map(([key]) => key!), ...buckets.keys()])]
    .map((key) => ({
      key,
      label: label.get(key) ?? allLabels.get(key) ?? key.slice(7),
      deals: buckets.get(key) ?? [],
    }))
    .filter((row) => label.has(row.key) || row.deals.length > 0);
}
