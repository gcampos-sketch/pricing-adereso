import type { ActivityReport, DealActivity } from "../src/lib/deal-activity-analysis";
import { expect, test } from "bun:test";
import { WARNING_STAGE, warningActivity, warningHealth, warningTimeline, type WarningDetail } from "../src/lib/warning-deals";

const at = (day: string) => `2026-11-${day}T12:00:00.000Z`;
const now = Date.parse(at("24"));
const properties = { [`hs_v2_date_entered_${WARNING_STAGE}`]: at("17") };
const version = (day: string, value: string) => ({ timestamp: at(day), value });
const won = "174677684";
const development = "1086544542";

test("uses the immediately preceding stage of the current warning stay, including after re-entry", () => {
  const versions = [
    version("21", WARNING_STAGE), version("17", WARNING_STAGE), version("15", development),
    version("12", development), version("10", WARNING_STAGE), version("08", won),
  ];
  expect(warningTimeline(properties, versions, now)).toMatchObject({
    enteredAt: at("17"), days: 7, previousStageId: development, previousDays: 5,
  });
  expect(warningTimeline(properties, [version("17", WARNING_STAGE), version("16", won)], now).previousStageId).toBe(won);
});

test("retains the native warning duration without inferring an origin across a gap or conflict", () => {
  for (const versions of [
    [version("17", WARNING_STAGE), version("16", ""), version("15", development)],
    [version("17", WARNING_STAGE), version("16", won), version("16", development)],
    [version("18", WARNING_STAGE), version("16", won)],
    [version("17", WARNING_STAGE), { value: won }],
  ]) {
    expect(warningTimeline(properties, versions, now)).toMatchObject({ days: 7, previousStageId: null, previousDays: null });
  }
});

test("uses a verified stage entry from history if the native date is missing", () => {
  expect(warningTimeline({}, [version("17", WARNING_STAGE), version("16", won)], now)).toMatchObject({
    enteredAt: at("17"), previousStageId: won, days: 7,
  });
  expect(warningTimeline({}, [version("25", WARNING_STAGE)], now).days).toBeNull();
});

test("classifies health with explicit age boundaries, operational evidence and missing data", () => {
  const row = (days: WarningDetail["days"], fields: WarningDetail["fields"] = {}): WarningDetail => ({
    days, fields, previousStage: null, previousDays: null, enteredAt: null,
  });
  expect(warningHealth(row(6, { alerta_finanazas_negocio: ["Deal en warning"] }))).toBe("watch");
  expect(warningHealth(row(7))).toBe("priority");
  expect(warningHealth(row(29))).toBe("priority");
  expect(warningHealth(row(30))).toBe("priority");
  expect(warningHealth({ ...row(30), activity: warningActivity("1", { "notes_last_contacted": at("08") }, channels(), now) })).toBe("critical");
  expect(warningHealth(row(null, { alerta_sspp: ["BM no creado"] }))).toBe("priority");
  expect(warningHealth(row(null))).toBe("unknown");
});

const emptyChannel = () => ({ events: {}, unavailable: [], undated: [] });
const channels = (): ActivityReport["channels"] => ({
  emails: emptyChannel(), calls: emptyChannel(), communications: emptyChannel(), meetings: emptyChannel(),
});
const event = (day: string, status: string, counted = true): DealActivity => ({
  id: day + status, at: Date.parse(at(day)), status, counted, actor: "", actorId: "",
});

test("distinguishes outreach, customer replies and completed meetings in Warning", () => {
  const data = channels();
  data.communications.events["1"] = [event("23", "Borrador", false), event("22", "Enviado")];
  data.meetings.events["1"] = [event("23", "No asistió", false), event("26", "Realizada")];
  expect(warningActivity("1", {}, data, now)).toMatchObject({ contact: "attempts", lastReply: null, lastMeeting: null, recentCounts: { communications: 1, meetings: 0 } });
  data.emails.events["1"] = [event("21", "Entrante")];
  expect(warningActivity("1", {}, data, now).contact).toBe("recent");
  data.meetings.events["1"].push(event("23", "Realizada"));
  const activity = warningActivity("1", {}, data, now);
  expect(activity).toMatchObject({ contact: "continuous", lastReply: at("21"), lastMeeting: at("23") });
  expect(warningHealth({ days: 45, previousDays: null, previousStage: null, enteredAt: null, fields: {}, activity })).toBe("priority");
});

test("does not infer missing replies or silence when activity reads are incomplete", () => {
  const data = channels();
  data.communications.unavailable.push("1");
  data.emails.events["1"] = [event("22", "Enviado")];
  expect(warningActivity("1", { "notes_last_contacted": at("09") }, data, now)).toMatchObject({ contact: "unknown", complete: false, lastContact: at("09") });
});

test("uses connected calls as contact and distinguishes a CRM timestamp from verified interaction", () => {
  const data = channels();
  const props = { "notes_last_contacted": at("20") };
  expect(warningActivity("1", props, data, now).contact).toBe("logged");
  data.calls.events["1"] = [event("22", "Conectada · Saliente"), event("23", "Completada · Saliente")];
  expect(warningActivity("1", props, data, now)).toMatchObject({ contact: "recent", lastConnectedCall: at("22"), recentCounts: { calls: 2 } });
});
