import { describe, expect, test } from "bun:test";
import { callOutcome, whatsappOutcome } from "../src/lib/contactability";

describe("Contactabilidad", () => {
  test("a prepared WhatsApp takes precedence over direction", () => {
    expect(
      whatsappOutcome(
        "Dirección: Saliente\nEstado del seguimiento: borrador preparado y pendiente de revisión; no enviado.",
      ),
    ).toBe("Borrador");
  });

  test("direction requires a structured marker with no conflicting evidence", () => {
    expect(whatsappOutcome("Dirección: Saliente\nHola, gracias.")).toBe("Enviado");
    expect(whatsappOutcome("WhatsApp: Recibido")).toBe("Recibido");
    expect(whatsappOutcome("El cliente dijo que había enviado sus datos")).toBe(
      "Sin dirección confirmada",
    );
    expect(whatsappOutcome("Dirección: Saliente\nDirección: Entrante")).toBe(
      "Sin dirección confirmada",
    );
  });

  test("completion and explicit connection are distinct", () => {
    expect(callOutcome("COMPLETED", false)).toBe("Completada");
    expect(callOutcome("COMPLETED", true)).toBe("Conectada");
    expect(callOutcome("NO_ANSWER", true)).toBe("Sin respuesta");
    expect(callOutcome("QUEUED", false)).toBeNull();
  });
});
