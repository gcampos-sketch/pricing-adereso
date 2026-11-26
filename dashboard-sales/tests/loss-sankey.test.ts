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

test('team grouping uses shared owner roles, retains unknowns and preserves exact memberships including zero MRR', () => {
  const a = row('a', '331766554', 'E5', 'Presupuesto', 0);
  const b = row('b', '82596016', 'E2', 'Presupuesto', 300);
  const c = row('c', '91603512', 'E5', 'Ghosting', 100);
  const d = row('d', 'unmapped', 'E5', 'Ghosting', 50);
  const e = row('e', '', '', null, 0);
  const input = [a, a, b, c, d, e, { ...a, id: 'won', status: 'won' } as InsightDeal];
  const graph = buildLossSankey(input, 'team');
  const owners = graph.nodes.filter(node => node.kind === 'owner');
  expect(owners.find(node => node.name === 'AE')?.deals.map(deal => deal.id)).toEqual(['a', 'b']);
  expect(owners.find(node => node.name === 'KAM')?.deals.map(deal => deal.id)).toEqual(['c']);
  expect(owners.find(node => node.name === 'Sin equipo')?.deals.map(deal => deal.id)).toEqual(['d', 'e']);
  expect(graph.deals).toHaveLength(5);
  for (const kind of ['owner', 'stage', 'reason']) {
    const nodes = graph.nodes.filter(node => node.kind === kind);
    expect(nodes.reduce((n, node) => n + node.deals.length, 0)).toBe(5);
    expect(nodes.reduce((n, node) => n + node.amount, 0)).toBe(450);
  }
  for (const kind of ['owner', 'stage']) {
    const links = graph.links.filter(link => graph.nodes[link.source]!.kind === kind);
    expect(links.reduce((n, link) => n + link.value, 0)).toBe(5);
    expect(links.reduce((n, link) => n + link.amount, 0)).toBe(450);
  }
  const link = graph.links.find(link => graph.nodes[link.source]!.name === 'AE' && graph.nodes[link.target]!.name === 'E5');
  expect(link?.deals.map(deal => deal.id)).toEqual(['a']);
  expect(link?.amount).toBe(0);
  expect(buildLossSankey(input).nodes.filter(node => node.kind === 'owner')).toHaveLength(5);
});
test('grouping only uses the supplied master scope and never infers role from owner label', () => {
  const rows = [{ ...row('a', 'unknown', 'E5', 'Presupuesto'), owner: 'Gonza' }, row('b', '93662868', 'E2', null)];
  expect(buildLossSankey(rows.slice(1), 'team').nodes.find(node => node.kind === 'owner')?.name).toBe('KAM');
  expect(buildLossSankey(rows.slice(0, 1), 'team').nodes.find(node => node.kind === 'owner')?.name).toBe('Sin equipo');
  expect(buildLossSankey([], 'team')).toEqual({ nodes: [], links: [], deals: [] });
});

test('activity grouping conserves deals and distinguishes verified zero from missing channel or changed loss date', () => {
  const lostEnteredAt = '2026-11-01T12:00:00Z';
  const enteredAt = Date.parse(lostEnteredAt);
  const a = { ...row('a', 'Gonza', 'E5', 'Ghosting', 0), lostEnteredAt };
  const b = { ...row('b', 'Gonza', 'E5', 'Ghosting', 200), lostEnteredAt };
  const c = { ...row('c', 'Gonza', 'E5', 'Precio'), lostEnteredAt };
  const zero = { emails: 0, communications: 0, calls: 0, meetings: 0 };
  const evidence = {
    a: { enteredAt, previousStage: 'Reunión concretada', counts: zero },
    b: { enteredAt, previousStage: 'Reunión concretada', counts: { ...zero, emails: 4, communications: null } },
    c: { enteredAt: enteredAt + 60_000, previousStage: 'E5', counts: zero },
  };
  const graph = buildLossSankey([a, a, b, c], 'activity', { evidence, channel: 'all' });
  expect(graph.nodes.find(node => node.name === '0 actividades')?.deals).toEqual([a]);
  expect(graph.nodes.find(node => node.name === 'Actividad sin verificar')?.deals).toEqual([b, c]);
  expect(graph.nodes.find(node => node.name === 'Etapa sin verificar')?.deals).toEqual([c]);
  for (const [source, target] of [['reason', 'stage'], ['stage', 'activity']]) {
    const links = graph.links.filter(link => graph.nodes[link.source]!.kind === source && graph.nodes[link.target]!.kind === target);
    expect(links.reduce((total, link) => total + link.value, 0)).toBe(3);
    expect(links.reduce((total, link) => total + link.amount, 0)).toBe(300);
  }
  const emails = buildLossSankey([a, b, c], 'activity', { evidence, channel: 'emails' });
  expect(emails.nodes.find(node => node.name === '3–5 actividades')?.deals).toEqual([b]);
});
