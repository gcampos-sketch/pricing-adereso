/** Shared current deal segmentation; matches the existing report definition. */
export function segmentOf(p: Record<string, string | null>): string {
  const type = p["dealtype"] ?? "";
  if (type.startsWith("Upsell")) return "Upsell";
  if (type.startsWith("Cross")) return "Cross sell";
  if (type.startsWith("Renovación")) return "Renovación";
  return p["negocio_inbound"] === "true" ? "Inbound" : "Outbound";
}
