// TEST-ONLY fixture render; not used by the application.
import { test, expect } from 'bun:test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { AdoboIntelligence } from '../src/components/pulse/AdoboIntelligence';
import { RefreshProvider } from '../src/contexts/RefreshContext';
import { dealIntelligence } from '../src/lib/adobo-intelligence';
test('renders TEST-ONLY fixture', () => {
  const url = 'https://app.hubspot.com/contacts/1/deal/a';
  const d: any = { id: 'a', name: 'FIXTURE · deal de prueba', owner: 'Owner prueba', ownerId: 'o', stage: 'E2', stageFull: 'E2', segment: 'Inbound', url,
    adobo: { properties: { adobo_closing_score: '60', seguimiento_con_pinzas: 'true' }, propertyHistory: { version: 'hubspot-property-history/v1', dealId: 'a', fetchedAt: '2026-10-19T11:00:00Z', recordUrl: url, complete: true,
      properties: { adobo_closing_score: { truncated: false, versions: [{ value: '60', at: '2026-10-10T00:00:00Z', sourceType: 'INTEGRATION' }, { value: '80', at: '2026-10-01T00:00:00Z', sourceType: 'INTEGRATION' }] },
        seguimiento_con_pinzas: { truncated: false, versions: [{ value: 'true', at: '2026-10-05T00:00:00Z', sourceType: 'INTEGRATION' }] } } } } };
  const html = renderToString(<RefreshProvider><AdoboIntelligence deals={[d]} readAt="2026-10-19T11:00:00Z" now={Date.parse('2026-10-19T12:00:00Z')}/></RefreshProvider>);
  const signal = dealIntelligence(d, Date.parse('2026-10-19T12:00:00Z'));
  expect(signal.delta).toBe(-20);
  expect(signal.pinzas).toBe(true);
  if (process.env['ADOBO_FIXTURE_OUT']) { mkdirSync('/tmp/browser/adobo', { recursive: true }); writeFileSync('/tmp/browser/adobo/fixture.html', html); }
});
