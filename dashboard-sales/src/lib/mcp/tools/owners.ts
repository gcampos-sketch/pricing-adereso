import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import type { OwnerRow } from "@/lib/pulse-types";
import { assertTeamCaller, loadPulse, usd } from "../report";

export function formatOwnerPerformance(
  owner: Pick<OwnerRow, "name" | "openAmount" | "openCount" | "weightedQ" | "avgProbability">,
): string {
  // Pulse stores the arithmetic mean of open-deal probabilities as a 0–1 fraction.
  const probabilityPercent = Math.round(owner.avgProbability * 100);
  return `${owner.name}: abierto ${usd(owner.openAmount)} (${owner.openCount} deals) · ponderado ${usd(owner.weightedQ)} · prob. ${probabilityPercent}%`;
}

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
      .map(formatOwnerPerformance)
      .join("\n") || "Sin comerciales en este alcance.";
    return { content: [{ type: "text", text }] };
  },
});
