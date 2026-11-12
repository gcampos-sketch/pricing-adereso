import { packReport, unpackReport } from "./report-wire";
export type StoredReport = {
  version: "report-storage/v1";
  gzip: string;
  /** Kept small and queryable for the existing MRR chronology reader. */
  activeMrr?: { history?: unknown; calculation?: unknown };
};
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
export async function encodeStoredReport(report: unknown) {
  const packed = packReport(report);
  const json = JSON.stringify(packed);
  const body = new Response(json).body!;
  const compressed = new Uint8Array(
    await new Response(body.pipeThrough(new CompressionStream("gzip"))).arrayBuffer(),
  );
  let binary = "";
  for (let offset = 0; offset < compressed.length; offset += 32768)
    binary += String.fromCharCode(...compressed.subarray(offset, offset + 32768));
  const record = report && typeof report === "object" ? (report as Record<string, unknown>) : {};
  const activeMrr = record["activeMrr"] as Record<string, unknown> | undefined;
  const storage: StoredReport = {
    version: "report-storage/v1",
    gzip: btoa(binary),
    ...(activeMrr
      ? { activeMrr: { history: activeMrr["history"], calculation: activeMrr["calculation"] } }
      : {}),
  };
  // Only the build timestamp is excluded. Evidence timestamps and every actual value remain authoritative.
  const semantic = packReport(
    Object.fromEntries(Object.entries(record).filter(([key]) => key !== "generatedAt")),
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(semantic)),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return { storage, hash, rawBytes: bytes(json), storedBytes: bytes(JSON.stringify(storage)) };
}
export async function decodeStoredReport<T>(input: unknown): Promise<T> {
  if (
    !input ||
    typeof input !== "object" ||
    (input as Record<string, unknown>)["version"] !== "report-storage/v1"
  )
    return unpackReport(input) as T;
  const stored = input as StoredReport;
  if (typeof stored.gzip !== "string") throw Error("Copia comprimida inválida");
  const binary = atob(stored.gzip);
  const array = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const stream = new Blob([array]).stream().pipeThrough(new DecompressionStream("gzip"));
  return unpackReport(JSON.parse(await new Response(stream).text())) as T;
}
