import type { FlowNode, PipelineDeal, layoutPipelineFlow } from './pipeline-analysis';

type Anchor = { key: string; label: string; ids: ReadonlySet<string> };
type Path = Anchor[];
export type PipelineTrace = Path[];

function follows(path: Path, id: string) {
  return path.every(anchor => anchor.ids.has(id));
}

export function selectPipelineTrace(paths: PipelineTrace, anchor: Anchor, addPath: boolean): PipelineTrace {
  const current = paths.at(-1);
  if (!current || addPath) return [...paths, [anchor]];
  const previous = paths.slice(0, -1);
  if (current.some(point => point.key === anchor.key)) {
    const remaining = current.filter(point => point.key !== anchor.key);
    return remaining.length ? [...previous, remaining] : previous;
  }
  const compatible = [...anchor.ids].some(id => follows(current, id));
  return [...previous, compatible ? [...current, anchor] : [anchor]];
}

export function pipelineTraceIds(paths: PipelineTrace) {
  const ids = new Set<string>();
  for (const path of paths) {
    for (const id of path[0]?.ids ?? []) {
      if (follows(path, id)) ids.add(id);
    }
  }
  return ids;
}

export function layoutPipelineTrace(graph: ReturnType<typeof layoutPipelineFlow>, ids: ReadonlySet<string>) {
  const counts = new Map<FlowNode, number>();
  const incoming = new Map<FlowNode, number>();
  const outgoing = new Map<FlowNode, number>();
  for (const { nodes } of graph.columns) {
    for (const node of nodes) {
      const count = node.members.filter(deal => ids.has(deal.id)).length;
      const top = node.y + node.height * (1 - count / node.members.length) / 2;
      counts.set(node, count);
      incoming.set(node, top);
      outgoing.set(node, top);
    }
  }
  const links = graph.links.flatMap(link => {
    const count = link.members.filter(deal => ids.has(deal.id)).length;
    if (!count) return [];
    const width = link.width * count / link.members.length;
    const y1 = outgoing.get(link.source)!;
    const y2 = incoming.get(link.target)!;
    outgoing.set(link.source, y1 + width);
    incoming.set(link.target, y2 + width);
    return [{ ...link, width, y1, y2 }];
  });
  return { counts, links };
}
