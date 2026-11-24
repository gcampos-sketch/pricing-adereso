import { expect, test } from "bun:test";
import { WARNING_STAGE, warningHealth, warningTimeline, type WarningDetail } from "../src/lib/warning-deals";

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
  expect(warningHealth(row(30))).toBe("critical");
  expect(warningHealth(row(null, { alerta_sspp: ["BM no creado"] }))).toBe("priority");
  expect(warningHealth(row(null))).toBe("unknown");
});
