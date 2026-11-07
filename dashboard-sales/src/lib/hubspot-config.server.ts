/** Native HubSpot access; credentials never enter the browser bundle. */
export function hubspotConfig(env: Record<string, string | undefined> = process.env) {
  const token = env['HUBSPOT_ACCESS_TOKEN'];
  if (!token) throw new Error('Configura HUBSPOT_ACCESS_TOKEN en .env.local para leer HubSpot.');
  return {
    baseUrl: 'https://api.hubapi.com',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
}
