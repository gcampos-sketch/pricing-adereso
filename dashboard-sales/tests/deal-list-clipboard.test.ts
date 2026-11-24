import { expect, test } from "bun:test";
import { buildDealListClipboard } from "../src/lib/deal-list-clipboard";

test("copies rich links and all related details with a plain-text equivalent", () => {
  const deals = [
    { name: "Cliente & socio", url: "https://app.hubspot.com/contacts/1/record/0-3/42", details: ["MRR perdido: $0 USD", "Cierre:\nNo respondió."] },
    { name: "Cliente & socio", url: "https://app.hubspot.com/contacts/1/record/0-3/42", details: ["MRR perdido: $0 USD", "WhatsApp: 0 / 2"] },
  ];
  const payload = buildDealListClipboard(deals, ["Ghosting", "Q4 · Equipo"]);
  expect(payload.count).toBe(1);
  expect(payload.html).toBe('<p>Ghosting</p><p>Q4 · Equipo</p><ul><li><a href="https://app.hubspot.com/contacts/1/record/0-3/42">Cliente &amp; socio</a><br>MRR perdido: $0 USD<br>Cierre:<br>No respondió.<br>WhatsApp: 0 / 2</li></ul>');
  expect(payload.text).toContain("Cliente & socio — https://app.hubspot.com/contacts/1/record/0-3/42\nMRR perdido: $0 USD");
  expect(payload.text).toContain("Cierre:\nNo respondió.\nWhatsApp: 0 / 2");
});

test("keeps comments as text and skips invalid URLs in both formats", () => {
  const payload = buildDealListClipboard([
    { name: '<img src=x>', url: "javascript:alert(1)", details: ['<a href="x">Texto</a>'] },
  ]);
  expect(payload.html).toBe("<ul><li>&lt;img src=x&gt;<br>&lt;a href=&quot;x&quot;&gt;Texto&lt;/a&gt;</li></ul>");
  expect(payload.text).toBe('• <img src=x>\n<a href="x">Texto</a>');
});
