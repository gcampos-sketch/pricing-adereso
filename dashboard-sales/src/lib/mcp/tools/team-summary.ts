import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { assertTeamCaller, loadPulse, usd } from "../report";

export default defineTool({
  name: "get_team_summary",
  title: "Resumen del equipo comercial",
  description: "Resumen del trimestre actual: pipeline abierto, ponderado, ganado, cuota y win rate.",
  inputSchema: { role: z.enum(["AE", "KAM"]).optional().describe("Limitar a AE o KAM; vacío = todo el equipo.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ role }, ctx) => {
    await assertTeamCaller(ctx);
    const r = await loadPulse(role);
    const t = r.team;
    const text = [
      `Periodo: ${r.currentLabel} (datos de ${r.generatedAt})`,
      `Pipeline abierto: ${usd(t.openAmount)} en ${t.openCount} deals`,
      `Ponderado del trimestre: ${usd(t.weightedQ)}`,
      `Ganado: ${usd(t.wonQAmount)} en ${t.wonQCount} deals`,
      `Cuota: ${usd(t.quotaTotal)} · ${Math.round(t.quotaPct)}% cumplido`,
      `Win rate: ${t.wr.won} ganados / ${t.wr.lost} perdidos`,
      r.activeMrr ? `MRR en servicio: ${usd(r.activeMrr.value)} (${r.activeMrr.count} deals)` : "",
    ].filter(Boolean).join("\n");
    return { content: [{ type: "text", text }] };
  },
});
