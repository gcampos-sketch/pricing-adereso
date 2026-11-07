import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { assertTeamCaller, loadPulse, usd } from "../report";

export default defineTool({
  name: "list_owner_performance",
  title: "Rendimiento por comercial",
  description: "Pipeline abierto, ponderado y probabilidad promedio de cada comercial.",
  inputSchema: { role: z.enum(["AE", "KAM"]).optional().describe("Limitar a AE o KAM.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ role }, ctx) => {
    await assertTeamCaller(ctx);
    const r = await loadPulse(role);
    const text = r.ownerRows
      .map((o) => `${o.name}: abierto ${usd(o.openAmount)} (${o.openCount} deals) · ponderado ${usd(o.weightedQ)} · prob. ${Math.round(o.avgProbability)}%`)
      .join("\n") || "Sin comerciales en este alcance.";
    return { content: [{ type: "text", text }] };
  },
});
