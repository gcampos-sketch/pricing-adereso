import { expect, test } from 'bun:test';
import { buildLossSankey } from '../src/lib/loss-sankey';
import type { InsightDeal } from '../src/lib/insights-types';
const row = (id: string, ownerId: string, stage: string, reason: string | null, amount = 100) => ({ id, ownerId, owner: ownerId, lostStage: stage, lostReason: reason, amountValue: amount, status: 'lost' } as InsightDeal);
test('every column and both connection sets conserve the exact unique deal population and MRR', () => {
  const a = row('a', 'Gonza', 'E5', 'Precio', 0);
  const graph = buildLossSankey([a, a, row('b', 'Holly', 'E5', 'Ghosting'), row('c', 'Holly', 'E2', 'Precio', 200), { ...a, id: 'won', status: 'won' }]);
  for (const kind of ['owner', 'stage', 'reason']) {
    const nodes = graph.nodes.filter(node => node.kind === kind);
    expect(nodes.reduce((n, node) => n + node.deals.length, 0)).toBe(3);
    expect(nodes.reduce((n, node) => n + node.amount, 0)).toBe(300);
  }
  for (const kind of ['owner', 'stage']) {
    const links = graph.links.filter(link => graph.nodes[link.source]!.kind === kind);
    expect(links.reduce((n, link) => n + link.value, 0)).toBe(3);
    expect(links.reduce((n, link) => n + link.amount, 0)).toBe(300);
  }
  const link = graph.links.find(link => graph.nodes[link.source]!.name === 'E5' && graph.nodes[link.target]!.name === 'Precio')!;
  expect(link.deals.map(deal => deal.id)).toEqual(['a']);
  expect([link.value, link.amount]).toEqual([1, 0]);
});
test('missing fields remain visible and same labels in distinct columns or distinct owners never merge', () => {
  const graph = buildLossSankey([row('a', '', '', null), row('b', 'E5', 'E5', 'E5'), { ...row('c', 'other', 'E5', 'E5'), owner: 'E5' }]);
  expect(graph.nodes.filter(node => node.name === 'E5')).toHaveLength(4);
  expect(graph.nodes.find(node => node.name === 'Sin motivo listado')?.deals.map(deal => deal.id)).toEqual(['a']);
  expect(buildLossSankey([])).toEqual({ nodes: [], links: [], deals: [] });
});
