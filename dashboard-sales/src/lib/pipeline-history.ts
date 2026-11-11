import type { DealDTO, StageJourney } from "./pulse-types";
import { wonAcquisitionSource } from "./won-distribution";
export type PipelineEventKind = "generated" | "valued" | "won" | "lost";
export const PIPELINE_EVENTS: { key: PipelineEventKind; label: string; stages: string[] }[] = [
  { key: "generated", label: "Entradas E0 / E1", stages: ["E0", "E1"] },
  { key: "valued", label: "Valorizados · E4", stages: ["E4"] },
  { key: "won", label: "Ganados · E6+", stages: ["E6", "E6.1", "E6.2", "E8"] },
  { key: "lost", label: "Perdidos", stages: ["LOST"] },
];
export const PIPELINE_SOURCES: Record<string, string> = {
  outbound: "Outbound",
  inbound: "Inbound",
  cs: "Oportunidad desde CS",
  kam: "Oportunidad desde KAM",
  other: "Otras fuentes",
  unknown: "Sin fuente registrada",
};
export type PipelineEvent = {
  deal: DealDTO;
  kind: PipelineEventKind;
  date: string;
  stage: string;
  source: string;
};
/** One recorded entry per deal/milestone, independent of creation, close and current stage. */
export function pipelineHistory(journeys: StageJourney[]): PipelineEvent[] {
  return [...new Map(journeys.map((row) => [row.deal.id, row])).values()]
    .flatMap((row) =>
      PIPELINE_EVENTS.flatMap((definition) => {
        const entries = definition.stages
          .map((stage) => ({ stage, date: row.entered[stage] ?? "" }))
          .filter((entry) => Number.isFinite(Date.parse(entry.date)))
          .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
        const entry = entries[0];
        if (!entry || (definition.key === "valued" && !(row.deal.amountValue > 0))) return [];
        return [
          {
            deal: row.deal,
            kind: definition.key,
            date: new Date(entry.date).toISOString().slice(0, 10),
            stage: entry.stage,
            source: wonAcquisitionSource(row.deal),
          },
        ];
      }),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.deal.name.localeCompare(b.deal.name));
}
