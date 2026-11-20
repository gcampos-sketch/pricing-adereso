import { expect, test } from "bun:test";
import {
  createTanStackMcpHandler,
  createTanStackOAuthProtectedResourceMetadataHandler,
} from "@lovable.dev/mcp-js/stacks/tanstack";
import mcp from "../src/lib/mcp";
const options = {
  resourcePath: "/mcp",
  metadataPath: "/.well-known/oauth-protected-resource",
  trustForwardedHost: false,
  trustForwardedProto: false,
};
test("TLS termination and spoofed proxy headers cannot change the public MCP resource or discovery URL", async () => {
  const headers = { "x-forwarded-host": "attacker.example", "x-forwarded-proto": "http" };
  const response = await createTanStackMcpHandler(
    mcp,
    options,
  )({
    request: new Request("http://internal:10000/mcp", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        },
      }),
    }),
  });
  expect(response.status).toBe(401);
  expect(response.headers.get("www-authenticate")).toContain(
    'resource_metadata="https://adereso-hub-comercial.onrender.com/.well-known/oauth-protected-resource"',
  );
  const metadata = await createTanStackOAuthProtectedResourceMetadataHandler(
    mcp,
    options,
  )({
    request: new Request("http://internal:10000/.well-known/oauth-protected-resource", { headers }),
  });
  expect(metadata.status).toBe(200);
  expect((await metadata.json()).resource).toBe("https://adereso-hub-comercial.onrender.com/mcp");
});
