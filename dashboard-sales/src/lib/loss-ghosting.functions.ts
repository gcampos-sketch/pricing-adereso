import { createServerFn } from "@tanstack/react-start";
import { GHOSTING_BATCH_SIZE } from "./loss-ghosting";
import { requireMfa } from "./require-mfa";

export const getLossGhostingActivity = createServerFn({ method: "POST" }).middleware([requireMfa])
  .inputValidator((input: { ids: string[] }) => {
    if (!Array.isArray(input?.ids) || !input.ids.length || input.ids.length > GHOSTING_BATCH_SIZE ||
        input.ids.some(id => typeof id !== "string" || !/^\d+$/.test(id))) throw new Error("Selección de negocios inválida");
    return { ids: [...new Set(input.ids)] };
  })
  .handler(async ({ data }) => {
    const { readLossGhostingActivity } = await import("./loss-ghosting.server");
    return readLossGhostingActivity(data.ids);
  });
