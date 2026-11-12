import { describe, expect, test } from "bun:test";
import { encodeStoredReport, decodeStoredReport } from "../src/lib/report-storage";
import { acquireReportRefresh } from "../src/lib/report-refresh";

describe("lossless report persistence", () => {
  const report = {
    generatedAt: "first",
    activeMrr: { history: [{ value: 123.45 }], calculation: "v1" },
    nested: { generatedAt: "evidence-date" },
    deals: [
      { id: "42", name: "Ñandú", amount: 10 },
      { id: "42", name: "Ñandú", amount: 20 },
    ],
    empty: null,
  };
  test("preserves differing versions, unicode, amounts and chronology exactly", async () => {
    const encoded = await encodeStoredReport(report);
    expect(await decodeStoredReport(encoded.storage)).toEqual(report);
    expect(encoded.storage.activeMrr).toEqual(report.activeMrr);
    expect(await decodeStoredReport(report)).toEqual(report);
  });
  test("ignores only root build time for unchanged detection", async () => {
    const base = await encodeStoredReport(report);
    expect((await encodeStoredReport({ ...report, generatedAt: "second" })).hash).toBe(base.hash);
    expect(
      (await encodeStoredReport({ ...report, nested: { generatedAt: "changed evidence" } })).hash,
    ).not.toBe(base.hash);
    expect(
      (
        await encodeStoredReport({
          ...report,
          deals: [...report.deals, { id: "43", name: "New", amount: 0 }],
        })
      ).hash,
    ).not.toBe(base.hash);
  });
  test("corrupt compression is rejected instead of becoming an empty report", async () => {
    await expect(
      decodeStoredReport({ version: "report-storage/v1", gzip: "broken" }),
    ).rejects.toThrow();
  });
});

describe("request-owned refresh coordination", () => {
  test("waits for the active builder and reuses its checked result", async () => {
    let calls = 0;
    let waits = 0;
    const result = await acquireReportRefresh(
      async () => (++calls < 3 ? { busy: true } : { busy: false, checkedAt: "verified" }),
      async () => {
        waits++;
      },
    );
    expect(result).toEqual({ busy: false, checkedAt: "verified" });
    expect(waits).toBe(2);
  });
  test("grants replacement ownership after a failed or expired builder", async () => {
    expect(
      await acquireReportRefresh(
        async () => ({ busy: false, token: "exclusive" }),
        async () => {},
      ),
    ).toEqual({ busy: false, token: "exclusive" });
  });
  test("bounds waits and propagates database failures", async () => {
    await expect(
      acquireReportRefresh(
        async () => ({ busy: true }),
        async () => {},
        2,
      ),
    ).rejects.toThrow("Se conserva la última copia");
    await expect(
      acquireReportRefresh(
        async () => {
          throw Error("offline");
        },
        async () => {},
      ),
    ).rejects.toThrow("offline");
  });
});
