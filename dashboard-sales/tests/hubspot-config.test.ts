import { test, expect } from 'bun:test';
import { hubspotConfig } from '../src/lib/hubspot-config.server';

test('native transport requires a HubSpot token, never a connector key', () => {
  expect(() => hubspotConfig({ HUBSPOT_API_KEY: 'connector-only', LOVABLE_API_KEY: 'legacy' })).toThrow('HUBSPOT_ACCESS_TOKEN');
});
test('native transport sends only the HubSpot token to the official API', () => {
  const config = hubspotConfig({ HUBSPOT_ACCESS_TOKEN: 'native-token', LOVABLE_API_KEY: 'legacy', HUBSPOT_TRANSPORT: 'lovable' });
  expect(config.baseUrl).toBe('https://api.hubapi.com');
  expect(config.headers.Authorization).toBe('Bearer native-token');
  expect(config.headers).not.toHaveProperty('X-Connection-Api-Key');
});
