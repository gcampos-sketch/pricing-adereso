import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { assertTeamCaller } from "../report";

export default defineTool({
  name: "get_kam_brief",
  title: "Cartera y cobertura KAM",
  description:
    "Cartera KAM vigente de HubSpot y cobertura de reuniones confirmadas con el mismo cálculo del dashboard. Devuelve identidad, holdings, IDs de instancia, detalle y cortes separados. Historial parcial solo establece un mínimo; no prueba falta de contacto. Informa si falta la fuente de excedentes.",
  inputSchema: {
    owner_id: z
      .string()
      .regex(/^\d+$/)
      .optional()
      .describe(
        "Owner KAM exacto de HubSpot. Omitir para usar el email autenticado; nunca asignar por nombre.",
      ),
    period: z
      .string()
      .regex(/^\d{4}-Q[1-4]$/)
      .optional()
      .describe("YYYY-Qn; por defecto trimestre actual America/Coyhaique."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ owner_id, period }, ctx) => {
    await assertTeamCaller(ctx);
    const email = String((ctx.getClaims() as { email?: unknown })?.email ?? "");
    const { readKamBrief } = await import("@/lib/kam-brief.server");
    try {
      const result = await readKamBrief(email, owner_id, period);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      throw new ToolError(
        error instanceof Error ? error.message : "No se pudo completar la lectura KAM.",
      );
    }
  },
});
