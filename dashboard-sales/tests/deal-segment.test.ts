import { expect, test } from 'bun:test';
import { acquisitionOf, acquisitionWarning, segmentOf } from '../src/lib/deal-segment';

test('inbound uses OR across exact native sources and the explicit checkbox', () => {
  for (const source of ['Form de Contacto Inbound', 'Form de Contacto Inbound Adereso', 'Form de Contacto Inbound Cassper']) {
    for (const flag of [null, '', 'false', 'true']) expect(acquisitionOf({ fuente_de_creacion: source, negocio_inbound: flag })).toBe('Inbound');
  }
  for (const source of [null, '', 'KAM', 'Prospección SDR']) expect(acquisitionOf({ fuente_de_creacion: source, negocio_inbound: 'true' })).toBe('Inbound');
});

test('outbound requires prospecting evidence; missing and other evidence stays unknown', () => {
  for (const source of ['Prospección SDR', 'Prospección SDR Adereso', 'Prospección SDR Cassper']) expect(acquisitionOf({ fuente_de_creacion: source, negocio_inbound: null })).toBe('Outbound');
  for (const source of [null, '', 'KAM', 'Customer Success', 'Otra campaña inbound']) {
    for (const flag of [null, '', 'false']) expect(acquisitionOf({ fuente_de_creacion: source, negocio_inbound: flag })).toBe('Sin clasificar');
  }
});

test('only explicit contradictory evidence raises a warning', () => {
  expect(acquisitionWarning({ fuente_de_creacion: 'Prospección SDR', negocio_inbound: 'true' })).toContain('Revisar origen');
  expect(acquisitionWarning({ fuente_de_creacion: 'Form de Contacto Inbound', negocio_inbound: 'false' })).toContain('Revisar origen');
  expect(acquisitionWarning({ fuente_de_creacion: 'Form de Contacto Inbound', negocio_inbound: null })).toBeNull();
});

test('expansion type stays independent and native input stays unchanged', () => {
  for (const [type, segment] of [['Upsell (mas de los mismo)', 'Upsell'], ['Cross sell (producto nuevo)', 'Cross sell'], ['Renovación (valida)', 'Renovación']]) {
    const p = { dealtype: type, negocio_inbound: 'true' }; const before = { ...p };
    expect(segmentOf(p)).toBe(segment); expect(p).toEqual(before);
  }
  expect(segmentOf({ dealtype: 'newbusiness' })).toBe('Sin clasificar');
});
