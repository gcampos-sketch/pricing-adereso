import type { InsightDeal } from './insights-types';
import { roleOfOwner } from './owner-roles';
import { lossActivityBucket, lossActivityFor, type LossActivityChannel, type LossActivityEvidence } from './loss-sankey-activity';

export type LossSankeyGrouping = 'owner' | 'team' | 'activity';

export type LossSankeyNode = { key: string; name: string; kind: 'owner' | 'stage' | 'reason' | 'activity'; deals: InsightDeal[]; amount: number };
export type LossSankeyLink = { key: string; source: number; target: number; value: number; deals: InsightDeal[]; amount: number };

export function lossSankeyColumns(grouping: LossSankeyGrouping) {
  return grouping === 'activity' ? ['reason', 'stage', 'activity'] as const : ['owner', 'stage', 'reason'] as const;
}

/** Each lost deal occurs once per column and once per adjacent connection. Width is deal count, including $0 deals. */
export function buildLossSankey(input: InsightDeal[], grouping: LossSankeyGrouping = 'owner',
  activity?: { evidence: Readonly<Record<string, LossActivityEvidence>> | undefined; channel: LossActivityChannel },
) {
  const columns = lossSankeyColumns(grouping);
  const deals = [...new Map(input.filter(deal => deal.status === 'lost').map(deal => [deal.id, deal])).values()];
  const nodes: LossSankeyNode[] = [];
  const indices = new Map<string, number>();
  const paths = deals.map(deal => {
    const team = roleOfOwner(deal.ownerId);
    const first = grouping === 'team' ? { id: team ?? 'unknown', name: team ?? 'Sin equipo' } :
      { id: deal.ownerId || deal.owner || 'unknown', name: deal.owner || 'Sin comercial' };
    const reason = { kind: 'reason' as const, id: deal.lostReason || 'unknown', name: deal.lostReason || 'Sin motivo listado' };
    if (grouping === 'activity') {
      const row = lossActivityFor(deal, activity?.evidence);
      const stage = row?.previousStage ?? 'Etapa sin verificar';
      const volume = lossActivityBucket(row, activity?.channel ?? 'all');
      return { deal, parts: [
        reason,
        { kind: 'stage' as const, id: stage, name: stage },
        { kind: 'activity' as const, id: volume, name: volume },
      ] };
    }
    const parts = [
      { kind: 'owner' as const, ...first },
      { kind: 'stage' as const, id: deal.lostStage || 'unknown', name: deal.lostStage || 'Sin recorrido' },
      reason,
    ];
    return { deal, parts };
  });
  for (const kind of columns) {
    const buckets = new Map<string, LossSankeyNode>();
    for (const { deal, parts } of paths) {
      const part = parts.find(part => part.kind === kind)!;
      const key = `${kind}:${part.id}`;
      const node = buckets.get(key) ?? { key, kind, name: part.name, deals: [], amount: 0 };
      node.deals.push(deal); node.amount += deal.amountValue;
      buckets.set(key, node);
    }
    for (const node of [...buckets.values()].sort((a, b) => b.deals.length - a.deals.length || a.name.localeCompare(b.name))) {
      indices.set(node.key, nodes.length); nodes.push(node);
    }
  }
  const buckets = new Map<string, LossSankeyLink>();
  for (const { deal, parts } of paths) {
    for (let i = 0; i < 2; i++) {
      const sourcePart = parts[i]!; const targetPart = parts[i + 1]!;
      const source = indices.get(`${sourcePart.kind}:${sourcePart.id}`)!;
      const target = indices.get(`${targetPart.kind}:${targetPart.id}`)!;
      const key = `${source}:${target}`;
      const link = buckets.get(key) ?? { key, source, target, value: 0, deals: [], amount: 0 };
      link.deals.push(deal); link.value++; link.amount += deal.amountValue;
      buckets.set(key, link);
    }
  }
  return { nodes, links: [...buckets.values()], deals };
}
