import { expect, test } from "bun:test";
import type { InsightDeal } from "../src/lib/insights-types";
import type { GhostingActivity } from "../src/lib/loss-ghosting";
import { ghostingByOwner, lossDealsByOwner, summarizeGhosting } from "../src/lib/loss-conclusion-detail";

const deal = (id: string, ownerId: string, owner: string, amountValue: number) =>
  ({ id, ownerId, owner, amountValue } as InsightDeal);

const activity = (calls: number | null, whatsapp: number | null, emails: number | null): GhostingActivity =>
  ({ calls, whatsapp, emails, meetings: null });

test("each ghosting deal appears in one status and every verified shortfall appears in its exact channel", () => {
  const rows = [deal("a", "1", "Holly", 80), deal("b", "1", "Holly", 0), deal("c", "2", "Felipe", 350), deal("d", "2", "Felipe", 150)];
  const evidence = { a: activity(2, 2, 3), b: activity(null, 1, 0), c: activity(2, 0, 2), outside: activity(0, 0, 0) };
  const audit = summarizeGhosting([...rows, rows[2]!], evidence);
  expect(Object.fromEntries(Object.entries(audit.groups).map(([status, deals]) => [status, deals.map(deal => deal.id)])))
    .toEqual({ met: ["a"], short: ["b", "c"], unknown: ["d"] });
  expect(audit.channels.map(channel => [channel.channel, channel.missing.map(deal => deal.id), channel.verified]))
    .toEqual([["calls", [], 2], ["whatsapp", ["b", "c"], 3], ["emails", ["b"], 3]]);
  expect(audit.leadingChannels.map(channel => channel.channel)).toEqual(["whatsapp"]);
  expect(ghostingByOwner(rows, evidence).map(owner => [owner.id, owner.audit.groups.short.length, owner.audit.groups.unknown.length]))
    .toEqual([["2", 1, 1], ["1", 1, 0]]);
});

test("tied channels are retained and owners are separated by ID and include zero-MRR records", () => {
  const rows = [deal("a", "1", "Alex", 0), deal("b", "2", "Alex", 50), deal("c", "", "", 0)];
  expect(lossDealsByOwner(rows).map(owner => [owner.id, owner.label, owner.deals.length, owner.mrr]))
    .toEqual([["2", "Alex", 1, 50], ["1", "Alex", 1, 0], ["", "Sin comercial", 1, 0]]);
  const audit = summarizeGhosting(rows, { a: activity(1, 1, 2) });
  expect(audit.leadingChannels.map(channel => channel.channel)).toEqual(["calls", "whatsapp"]);
});
