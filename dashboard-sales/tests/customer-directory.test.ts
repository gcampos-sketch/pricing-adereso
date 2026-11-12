import { expect, test } from "bun:test";
import { readCustomerCompanyLinks } from "../src/lib/customer-directory.server";
import type { gateway } from "../src/lib/hubspot.server";

test("a transport timeout falls back to exact record reads and retains pagination", async () => {
  const calls: string[] = [];
  const request = (async (path: string) => {
    calls.push(path);
    if (path.endsWith("/batch/read")) throw new DOMException("timeout", "TimeoutError");
    return {
      results: path.includes("/1/") ? [{ toObjectId: "company", associationTypes: [] }] : [],
      paging: { next: { after: "next" } },
    };
  }) as typeof gateway;
  const page = await readCustomerCompanyLinks(["1", "2"], request);
  expect(page.results.map((row) => [row.from.id, row.to.length, row.paging?.next?.after])).toEqual([
    ["1", 1, "next"],
    ["2", 0, "next"],
  ]);
  expect(calls).toHaveLength(3);
});

test("failed individual reads never become empty associations", async () => {
  const request = (async () => {
    throw new DOMException("timeout", "TimeoutError");
  }) as typeof gateway;
  await expect(readCustomerCompanyLinks(["1"], request)).rejects.toThrow("timeout");
});

test("authorization failures are not retried through a fallback", async () => {
  let calls = 0;
  const request = (async () => {
    calls++;
    throw Error("HubSpot 403");
  }) as typeof gateway;
  await expect(readCustomerCompanyLinks(["1"], request)).rejects.toThrow("HubSpot 403");
  expect(calls).toBe(1);
});
