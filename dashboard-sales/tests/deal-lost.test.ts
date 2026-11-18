import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { markDealLost, type LostForm } from "../src/lib/deals.server";

const originalToken = process.env["HUBSPOT_ACCESS_TOKEN"];
const form: LostForm = {
  id: "123",
  reason: "Motivo de prueba",
  mainReason: "Presupuesto",
  waba: "Sí",
  industry: "Retail",
  country: "Chile",
  departments: ["Ventas", "Operaciones"],
  source: "Form de Contacto Inbound",
};

let fetchMock: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

beforeEach(() => {
  process.env["HUBSPOT_ACCESS_TOKEN"] = "synthetic-test-token";
  fetchMock = spyOn(globalThis, "fetch");
});

afterEach(() => {
  fetchMock.mockRestore();
  if (originalToken === undefined) delete process.env["HUBSPOT_ACCESS_TOKEN"];
  else process.env["HUBSPOT_ACCESS_TOKEN"] = originalToken;
});

test.each(["Retail", "Retail/Ecommerce", "Salud"])("sends the native industry value for %s", async (industry) => {
  fetchMock.mockResolvedValue(Response.json({ id: form.id }));

  expect(await markDealLost({ ...form, industry })).toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, request] = fetchMock.mock.calls[0]!;
  expect(url).toBe("https://api.hubapi.com/crm/v3/objects/deals/123");
  expect(request?.method).toBe("PATCH");
  expect(JSON.parse(String(request?.body))).toEqual({
    properties: {
      dealstage: "171385869",
      closed_lost_reason: form.reason,
      razones_de_cierre_perdidos_especifico: form.mainReason,
      adobo_tiene_whatsapp_b_api_negociacion: "si",
      industria_deal: industry === "Salud" ? "Salud" : "Retail",
      pais: "Chile",
      deptcliente: "Ventas;Operaciones",
      fuente_de_creacion: form.source,
    },
  });
});

test("names rejected fields from HubSpot validation without exposing raw error text", async () => {
  fetchMock.mockResolvedValue(Response.json({
    category: "VALIDATION_ERROR",
    correlationId: "example-ref",
    errors: [{ context: { propertyName: ["industria_deal", "unrecognized_property"] } }],
    message: 'Property values were not valid: [{"isValid":false,"name":"deptcliente","message":"private entered value"}]',
  }, { status: 400 }));

  await expect(markDealLost(form)).rejects.toThrow(
    /^HubSpot rechazó el cierre\. Revisa estos campos: Industria Deal, Departamentos del cliente\. Referencia example-ref\.$/,
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("reports the reference when HubSpot provides no property details", async () => {
  fetchMock.mockResolvedValue(Response.json({ correlationId: "example-ref" }, { status: 400 }));

  await expect(markDealLost(form)).rejects.toThrow(/^HubSpot rechazó el cierre del deal\. Referencia example-ref\.$/);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
