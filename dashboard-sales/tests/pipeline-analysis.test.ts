import { describe, expect, test } from 'bun:test';
import {
  contactRole, creationPeriod, currentOutcome, isProspectingCandidate, layoutPipelineFlow, meetingBooked, meetingHeld,
  pipelineColumns, serviceToChurn, trackedMetaAd, wasWon, type PipelineDeal,
} from '../src/lib/pipeline-analysis';

const deal = (id: string, overrides: Partial<PipelineDeal> = {}): PipelineDeal => ({
  id, name: id, stage: '171385866', entries: {}, commercial: true, createdAt: '2026-01-03T12:00:00Z',
  motion: 'Inbound', segment: 'Inbound', source: 'Form de Contacto Inbound', sourceLabel: 'Formulario',
  industry: 'Retail', dealType: 'Oportunidad', role: 'Sin rol registrado', campaign: 'Sin campaña rastreada', adId: null,
  contactRead: true, ...overrides,
});

describe('pipeline analysis', () => {
  test('uses the Chilean creation cohort and rejects an unknown or future date', () => {
    const now = Date.parse('2026-04-05T12:00:00Z');
    expect(creationPeriod('2026-04-01T01:00:00Z', now)).toBe('2026-Q1');
    expect(creationPeriod('2026-04-01T05:00:00Z', now)).toBe('2026-Q2');
    expect(creationPeriod('2026-04-06T01:00:00Z', now)).toBeNull();
    expect(creationPeriod(null, now)).toBeNull();
  });

  test('counts the SDR stage history on the same commercial deal without inferring skipped stages', () => {
    const moved = deal('1', { entries: { '1300101808': '2026-01-07T12:00:00Z' } });
    expect(meetingBooked(moved)).toBe(true);
    expect(meetingHeld(moved)).toBe(false);
    expect(wasWon(moved)).toBe(false);
    expect(pipelineColumns('all', 'sdr').map(column => column.title).slice(3, 7))
      .toEqual(['Prospección ABM', 'Reunión agendada', 'No show 1', 'Reunión reagendada']);
    expect(pipelineColumns('all', 'sales').some(column => column.title === 'E3.1 Cotización SP')).toBe(true);
  });

  test('keeps historic wins and requires a chronological E8 to current churn sequence', () => {
    const churn = deal('1', { stage: '178228041', entries: {
      '173990327': '2026-02-01T12:00:00Z', '178228041': '2026-02-02T12:00:00Z',
    } });
    expect(wasWon(churn)).toBe(true);
    expect(serviceToChurn(churn)).toBe(true);
    expect(currentOutcome(churn)).toBe('Churn tras E8');
    expect(currentOutcome({ ...churn, entries: {} })).toBe('Churn sin secuencia E8 verificada');
    expect(serviceToChurn({ ...churn, entries: { ...churn.entries, '178228041': '2026-01-03T13:00:00Z' } })).toBe(false);
  });

  test('attributes the earliest valid Meta visit once and prioritizes labeled key contacts', () => {
    const contact = (id: string, url: string, time: string, key = 'false', labels: string[] = []) => ({
      id, labels, properties: { hs_analytics_first_url: url, hs_analytics_first_visit_timestamp: time, key_contact: key },
    });
    const earlier = '2026-01-01T12:00:00Z';
    const contacts = [
      contact('5', 'https://example.com?hsa_net=facebook&hsa_ad=111', earlier, 'true', ['Champion']),
      contact('4', 'https://example.com?hsa_net=facebook&hsa_ad=222&hsa_cam=300', earlier, 'false', ['Usuario final']),
      contact('2', 'https://example.com?hsa_net=google&hsa_ad=333', earlier),
      contact('3', 'https://example.com?hsa_net=facebook&hsa_ad=444', '2026-01-05T12:00:00Z'),
      contact('1', 'https://example.com?hsa_net=facebook&hsa_ad=555&hsa_ad=666', earlier),
    ];
    expect(trackedMetaAd(contacts, '2026-01-02T12:00:00Z')).toMatchObject({ id: '222', campaign: 'Campaña Meta 300' });
    expect(contactRole(contacts)).toBe('Champion');
    expect(isProspectingCandidate({ motion: 'Inbound', source: 'Prospección SDR' })).toBe(false);
    expect(isProspectingCandidate({ motion: 'Sin clasificar', source: 'Prospección SDR' })).toBe(true);
  });

  test('conserves exact cohort membership through every Sankey column and connection', () => {
    const deals = Array.from({ length: 12 }, (_, index) => deal(String(index), {
      stage: index % 2 ? '171385866' : '1300101811', industry: `Industria ${index}`,
    }));
    const graph = layoutPipelineFlow(deals, pipelineColumns('all', 'summary'));
    const ids = deals.map(row => row.id).sort();
    for (const [depth, column] of graph.columns.entries()) {
      expect(column.nodes.flatMap(node => node.members.map(row => row.id)).sort()).toEqual(ids);
      if (depth < graph.columns.length - 1) {
        expect(graph.links.filter(link => link.depth === depth).flatMap(link => link.members.map(row => row.id)).sort()).toEqual(ids);
      }
    }
    expect(graph.columns[2]?.nodes.at(-1)?.members).toHaveLength(4);
  });
});
