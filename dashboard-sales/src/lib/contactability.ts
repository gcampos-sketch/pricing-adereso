export const CONTACT_CHANNELS = ["calls", "whatsapp", "emails"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export type ContactActivity = {
  id: string;
  ownerId: string;
  at: string;
  outcome: string;
  direction: "Saliente" | "Entrante" | null;
  deals: { id: string; name: string }[];
};

export type ContactabilityReport = {
  generatedAt: string;
  owners: { id: string; name: string }[];
  channels: Record<ContactChannel, ContactActivity[] | null>;
};

export function whatsappOutcome(text: string) {
  const normalized = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (/\bborrador preparado\b|\bno enviado\b/.test(normalized)) return "Borrador";
  const outgoing =
    /^\s*(?:direccion\s*:\s*(?:saliente|outbound)|(?:estado|whatsapp)\s*:\s*(?:mensaje )?enviado)\s*\.?\s*$/m.test(
      normalized,
    );
  const incoming =
    /^\s*(?:direccion\s*:\s*(?:entrante|inbound)|(?:estado|whatsapp)\s*:\s*(?:mensaje )?recibido)\s*\.?\s*$/m.test(
      normalized,
    );
  if (outgoing !== incoming) return outgoing ? "Enviado" : "Recibido";
  return "Sin dirección confirmada";
}

export function callOutcome(status: string | null | undefined, connected: boolean) {
  switch (status) {
    case "COMPLETED":
      return connected ? "Conectada" : "Completada";
    case "NO_ANSWER":
      return "Sin respuesta";
    case "BUSY":
      return "Ocupado";
    case "MISSED":
      return "Perdida";
    default:
      return null;
  }
}
