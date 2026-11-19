import { expect, test } from "bun:test";
import { isRecordedWhatsApp } from "../src/lib/whatsapp-count";

test("recognizes native WhatsApp logs, including manually registered messages without a direction", () => {
  expect(isRecordedWhatsApp("WHATS_APP", () => "Seguimiento de propuesta")).toBe(true);
  expect(isRecordedWhatsApp("WHATSAPP", () => "Dirección: Saliente\nEstado: Enviado")).toBe(true);
  expect(isRecordedWhatsApp("SMS", () => "WhatsApp en el mensaje")).toBe(false);
  expect(isRecordedWhatsApp("LINKEDIN_MESSAGE", () => "WhatsApp")).toBe(false);
  expect(isRecordedWhatsApp(null, () => "WhatsApp")).toBeNull();
});

test("a native WhatsApp activity for a prepared draft does not attest to a message", () => {
  expect(isRecordedWhatsApp("WHATS_APP", () => "Estado: Borrador preparado en WhatsApp Web, pendiente de revisión; no enviado")).toBe(false);
});
