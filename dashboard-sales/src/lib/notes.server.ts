import { gateway } from "./hubspot.server";
import { markdownToHubspotHtml } from "./markdown";

/** Crea una nota en HubSpot y la asocia al deal (association type note→deal = 214). */
export async function createDealNote(dealId: string, body: string) {
  const html = markdownToHubspotHtml(body);
  const payload = {
    properties: {
      hs_timestamp: new Date().toISOString(),
      hs_note_body: html,
    },
    associations: [
      {
        to: { id: dealId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 214 }],
      },
    ],
  };
  const created = await gateway<{ id: string }>("/crm/v3/objects/notes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { id: created.id };
}
