/** Process/config readiness only: provider access is verified separately after sign-in. */
export function runtimeHealthResponse(env: Record<string, string | undefined> = process.env): Response {
  const ready = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'HUBSPOT_ACCESS_TOKEN']
    .every((key) => Boolean(env[key]?.trim()));
  return Response.json({ status: ready ? 'ready' : 'not-ready' }, {
    status: ready ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
