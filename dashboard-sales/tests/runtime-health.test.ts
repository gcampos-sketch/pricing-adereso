import { expect, test } from 'bun:test';
import { runtimeHealthResponse } from '../src/lib/runtime-health.server';

const configured = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'public-test',
  SUPABASE_SERVICE_ROLE_KEY: 'private-test-must-not-leak',
};
test('hub readiness requires its authentication configuration', async () => {
  for (const key of Object.keys(configured)) {
    const response = runtimeHealthResponse({ ...configured, [key]: '' });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'not-ready' });
  }
});
test('readiness returns no credentials or configuration details and is not cached', async () => {
  const response = runtimeHealthResponse(configured);
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({ status: 'ready' });
});

test('missing HubSpot does not block the commercial hub', () => {
  expect(runtimeHealthResponse(configured).status).toBe(200);
});
