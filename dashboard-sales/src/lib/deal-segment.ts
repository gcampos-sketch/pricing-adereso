type OriginProps = Record<string, string | null>;
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const inboundForms = new Set(["form de contacto inbound", "form de contacto inbound adereso", "form de contacto inbound [adereso]", "form de contacto inbound cassper"]);
const prospectingSources = new Set(["prospeccion sdr", "prospeccion sdr adereso", "prospeccion sdr [adereso]", "prospeccion sdr cassper"]);

export const isSdrProspectingSource = (source: string) => prospectingSources.has(normalize(source));

/** Current deal evidence only; an empty/negative flag does not establish outbound. */
export function acquisitionOf(p: OriginProps): "Inbound" | "Outbound" | "Sin clasificar" {
  const source = normalize(p["fuente_de_creacion"] ?? "");
  if (inboundForms.has(source) || p["negocio_inbound"] === "true") return "Inbound";
  if (isSdrProspectingSource(source) && p["negocio_inbound"] === "false" && p["dealtype"] === "newbusiness") return "Outbound";
  return "Sin clasificar";
}

export function acquisitionWarning(p: OriginProps): string | null {
  const source = normalize(p["fuente_de_creacion"] ?? "");
  if (inboundForms.has(source) && p["negocio_inbound"] === "false") return "Revisar origen: formulario inbound con Negocio Inbound = No. Clasificado Inbound por la regla O.";
  if (isSdrProspectingSource(source) && p["negocio_inbound"] === "true") return "Revisar origen: Prospección SDR con Negocio Inbound = Sí. Clasificado Inbound por la regla O.";
  return null;
}

/** Business type stays independent from the acquisition origin. */
export function segmentOf(p: OriginProps): string {
  const type = p["dealtype"] ?? "";
  if (type.startsWith("Upsell")) return "Upsell";
  if (type.startsWith("Cross")) return "Cross sell";
  if (type.startsWith("Renovación")) return "Renovación";
  return acquisitionOf(p);
}
