import { describe, expect, test } from "bun:test";
import { decideMcpAccess } from "../src/lib/mcp/access";

const grants = new Map<string, { expiresAt: number; revoked: boolean }>();
const lookup = async (id: string) => {
  const g = grants.get(id);
  return Boolean(g && !g.revoked && g.expiresAt > Date.now());
};
const me = { email: "gonzalo@adere.so", aal: "aal1" };

describe("MCP access", () => {
  test("rejects a connection approved without completing MFA (no grant)", async () => {
    expect(await decideMcpAccess(me, "codex", lookup)).toEqual({ ok: false, reason: "no_grant" });
  });
  test("accepts after MFA grant, also for a refreshed token of the same client", async () => {
    grants.set("codex", { expiresAt: Date.now() + 30 * 86_400_000, revoked: false });
    expect(await decideMcpAccess(me, "codex", lookup)).toEqual({ ok: true });
    expect(await decideMcpAccess({ ...me, aal: "aal1" }, "codex", lookup)).toEqual({ ok: true });
  });
  test("rejects revoked grants", async () => {
    grants.set("codex", { expiresAt: Date.now() + 1000, revoked: true });
    expect((await decideMcpAccess(me, "codex", lookup)).ok).toBe(false);
  });
  test("rejects expired grants", async () => {
    grants.set("codex", { expiresAt: Date.now() - 1, revoked: false });
    expect((await decideMcpAccess(me, "codex", lookup)).ok).toBe(false);
  });
  test("rejects non-adere.so accounts even with a grant", async () => {
    grants.set("codex", { expiresAt: Date.now() + 1000, revoked: false });
    expect(await decideMcpAccess({ email: "x@gmail.com" }, "codex", lookup)).toEqual({ ok: false, reason: "domain" });
  });
  test("rejects tokens without an OAuth client", async () => {
    expect(await decideMcpAccess(me, undefined, lookup)).toEqual({ ok: false, reason: "no_client" });
  });
});
