import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { assertTeamCaller, loadPulse, usd } from "../report";

export default defineTool({
  name: "list_deal_alerts",
  title: "Deals con alertas",
  description: "Deals que requieren acción (ej. sin próxima actividad), con monto, comercial y link a HubSpot.",
  inputSchema: {
    owner: z.string().optional().describe("Filtrar por nombre del comercial."),
    limit: z.number().int().min(1).max(100).optional().describe("Máximo de resultados (por defecto 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ owner, limit }, ctx) => {
    await assertTeamCaller(ctx);
    const r = await loadPulse();
    const q = owner?.toLowerCase();
    const rows = r.alerts.filter((a) => !q || a.owner.toLowerCase().includes(q)).slice(0, limit ?? 25);
    const text = rows.map((a) => `${a.name} · ${a.owner} · ${usd(a.amount)} · ${a.reason} · ${a.url}`).join("\n") || "Sin alertas.";
    return { content: [{ type: "text", text }] };
  },
});
