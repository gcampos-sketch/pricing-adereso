import { createServerFn } from "@tanstack/react-start";
import { requireMfa } from "./require-mfa";

export const getDealActivityAnalysis = createServerFn({ method: "POST" })
  .middleware([requireMfa])
  .inputValidator((input: { year: string; quarter: string; fresh?: boolean }) => {
    if (
      typeof input?.year !== "string" ||
      !/^20[2-4]\d$/.test(input.year) ||
      !["1", "2", "3", "4", "all"].includes(input.quarter)
    )
      throw Error("Período inválido");
    return { year: input.year, quarter: input.quarter, fresh: input.fresh === true };
  })
  .handler(async ({ data }) => {
    const { readDealActivityAnalysis } = await import("./deal-activity-analysis.server");
    return readDealActivityAnalysis(data.year, data.quarter, data.fresh);
  });
