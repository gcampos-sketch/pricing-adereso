import { createServerFn } from "@tanstack/react-start";
import { requireMfa } from "./require-mfa";

export const getContactability = createServerFn({ method: "GET" })
  .middleware([requireMfa])
  .inputValidator((input: { fresh?: boolean }) => ({ fresh: input?.fresh === true }))
  .handler(async ({ data }) => {
    const { readContactability } = await import("./contactability.server");
    return readContactability(data.fresh);
  });
