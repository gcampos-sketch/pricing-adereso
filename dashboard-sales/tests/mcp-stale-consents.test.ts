import { describe, expect, test } from "bun:test";
import { staleConsentClientIds } from "../src/lib/mcp/stale-consents";

describe("stale OAuth consents", () => {
  test("a remembered consent without an MFA grant is revoked so the consent screen is shown again", () => {
    expect(staleConsentClientIds(["chatgpt"], [])).toEqual(["chatgpt"]);
  });
  test("a consent with an active MFA grant is kept", () => {
    expect(staleConsentClientIds(["chatgpt", "codex"], ["codex"])).toEqual(["chatgpt"]);
  });
  test("nothing to revoke when every consent has a grant", () => {
    expect(staleConsentClientIds(["codex"], ["codex"])).toEqual([]);
  });
});
