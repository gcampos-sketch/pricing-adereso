import { expect, test } from "bun:test";
import {
  activityByActor,
  observeActivity,
  summarizeActivity,
  DAY_MS,
  type ActivityDeal,
  type ActivityReport,
  type DealActivity,
} from "../src/lib/deal-activity-analysis";

const cutoff = 40 * DAY_MS;
const won: ActivityDeal = {
  id: "1",
  name: "Prueba",
  url: "",
  ownerId: "7",
  owner: "Comercial",
  stage: "Negociación",
  industry: "Prueba",
  segment: "Inbound",
  lossType: "",
  lossReason: "",
  outcome: "won",
  created: DAY_MS,
  cutoff,
  stageFrom: null,
};
const event = (id: string, at: number, counted = true): DealActivity => ({
  id,
  at,
  counted,
  actor: "Responsable",
  actorId: "8",
  status: counted ? "Enviado" : "Borrador",
});
const empty = () => ({ events: {}, unavailable: [], undated: [] });
const report: ActivityReport = {
  readAt: cutoff,
  deals: [won],
  undated: [],
  channels: {
    emails: {
      ...empty(),
      events: { "1": [event("1", DAY_MS), event("2", cutoff - DAY_MS), event("3", cutoff)] },
    },
    communications: { ...empty(), events: { "1": [event("4", cutoff - DAY_MS, false)] } },
    calls: { ...empty(), unavailable: ["2"] },
    meetings: empty(),
  },
};

test("pre-close windows are strict at the cutoff and keep drafts only in the chronology", () => {
  const full = observeActivity(won, report, ["emails", "communications"], "all");
  expect(full.events.map((row) => row.id)).toEqual(["2", "4", "1"]);
  const recent = observeActivity(won, report, ["emails", "communications"], "recent");
  expect(recent.counted.map((row) => row.id)).toEqual(["2"]);
  const active = observeActivity(
    { ...won, outcome: "active", stageFrom: cutoff - DAY_MS },
    report,
    ["emails"],
    "stage",
  );
  expect(active.counted.map((row) => row.id)).toEqual(["3", "2"]);
});

test("missing activity and stage reads are distinct from observed zero", () => {
  const unknown = observeActivity({ ...won, id: "2" }, report, ["calls"], "all");
  const zero = observeActivity(won, report, ["calls"], "all");
  expect(summarizeActivity([unknown, zero])).toEqual({
    deals: 2,
    covered: 1,
    zero: 1,
    average: 0,
    median: 0,
  });
  const missingStage = observeActivity({ ...won, outcome: "active" }, report, ["emails"], "stage");
  expect(summarizeActivity([missingStage]).average).toBeNull();
});

test("actor totals deduplicate shared activities while keeping both linked deals", () => {
  const row = observeActivity(won, report, ["emails"], "recent");
  const second = { ...row, deal: { ...won, id: "2" } };
  const [actor] = activityByActor([row, second]);
  expect(actor?.total).toBe(1);
  expect(actor?.rows.size).toBe(2);
});
