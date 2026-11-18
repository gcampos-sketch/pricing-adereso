import { expect, test } from 'bun:test';
import { lossCreationSource, lossCreationSources, scopeLossCreationSource } from '../src/lib/loss-creation-source';
import { scopeLossSankey } from '../src/lib/loss-sankey-scope';
import type { InsightDeal } from '../src/lib/insights-types';
const deal = (id: string, source: string | null, sourceLabel = '', status = 'lost') => ({ id, source, sourceLabel, status, lostEnteredAt: '2026-11-01', closeDateValue: '2026-10-01' } as InsightDeal);
test('uses the native source exactly, preserving distinct inbound and outbound options and explicit missing source', () => {
  const rows = [deal('a', 'Form de Contacto Inbound'), deal('b', 'Prospección SDR'), deal('c', '', 'Form de Contacto Inbound'), deal('d', null, 'Otro')];
  expect(lossCreationSource(rows[2])).toBe('Sin fuente');
  expect(scopeLossCreationSource(rows, 'Form de Contacto Inbound').map(d => d.id)).toEqual(['a']);
  expect(scopeLossCreationSource(rows, 'Sin fuente').map(d => d.id)).toEqual(['c']);
  expect(scopeLossCreationSource(rows, '')).toBe(rows);
  expect(scopeLossCreationSource(rows, 'Inexistente')).toEqual([]);
});
test('available choices include all lost sources, including unknown, without unrelated won-only options', () => {
  expect(lossCreationSources([deal('a', ' B '), deal('b', 'A'), deal('c', 'B'), deal('d', ''), deal('w', 'Solo ganado', '', 'won')]).map(option => option.value)).toEqual(['A', 'B', 'Sin fuente']);
});
test('master source supports outbound Sankey entry and close modes without an extra inbound restriction', () => {
  const rows = scopeLossCreationSource([deal('a', 'Prospección SDR'), deal('b', 'Form de Contacto Inbound')], 'Prospección SDR');
  for (const basis of ['entry', 'close'] as const) {
    expect(scopeLossSankey(rows, { periods: ['2026-Q4'], origin: 'all', basis, readAt: '2026-11-18' }).deals.map(d => d.id)).toEqual(['a']);
  }
});

test('matches native HubSpot order and labels, grouping without changing filter values', () => {
  const options = lossCreationSources(['Referal', 'Partner ITNG', 'KAM', 'Prospección SDR', 'Account Exec', 'Form de Contacto Inbound', 'Customer Success', 'Partner Sixbell'].map((source, index) => deal(String(index), source)));
  expect(options.map(option => option.value)).toEqual(['Form de Contacto Inbound', 'Prospección SDR', 'Account Exec', 'KAM', 'Customer Success', 'Partner Sixbell', 'Partner ITNG', 'Referal']);
  expect(options.map(option => option.label)).toEqual(['Form de Contacto Inbound Adereso', 'Prospección SDR Adereso', 'AE Adereso', 'KAM Adereso', 'CS Adereso', 'Partner Sixbell', 'Partner ITNG', 'Referral']);
  expect(options[0].group).toBe('Captación');
  expect(options[5].group).toBe('Partners');
  expect(scopeLossCreationSource([deal('a', 'Account Exec')], options[2].value).map(row => row.id)).toEqual(['a']);
});
