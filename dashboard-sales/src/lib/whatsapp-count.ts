import { whatsappOutcome } from "./contactability";

function isNativeWhatsAppChannel(channel: string) {
  return ["WHATS_APP", "WHATSAPP"].includes(channel.trim().toUpperCase());
}

/** Only native timeline log entries count; preparation records do not attest to a message. */
export function isRecordedWhatsApp(channel: string | null | undefined, bodyText: () => string): boolean | null {
  if (!channel?.trim()) return null;
  return isNativeWhatsAppChannel(channel) && whatsappOutcome(bodyText()) !== "Borrador";
}
