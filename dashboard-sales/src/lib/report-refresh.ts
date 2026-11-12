/** No shared promises: each request owns its I/O; the lease lives in Postgres. */
export type RefreshClaim = {
  token?: string;
  busy: boolean;
  checkedAt?: string | null;
  hash?: string | null;
};
export async function acquireReportRefresh(
  claim: () => Promise<RefreshClaim>,
  wait: () => Promise<void>,
  maxWaits = 90,
): Promise<RefreshClaim> {
  for (let count = 0; count <= maxWaits; count++) {
    const result = await claim();
    if (!result.busy) return result;
    if (count === maxWaits) break;
    await wait();
  }
  throw Error("El reporte sigue actualizándose. Se conserva la última copia; vuelve a intentar.");
}
