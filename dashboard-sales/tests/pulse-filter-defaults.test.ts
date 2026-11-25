import { expect, test } from "bun:test";
import { defaultPulseOwner, defaultPulsePeriod } from "../src/lib/pulse-filter-defaults";

const owners = {
  "82596016": "ae@example.com",
  "91603512": "kam@example.com",
  "331766554": "gonza@example.com",
  "123": "other@example.com",
};

test("defaults an authenticated AE or KAM to their own owner, with Gonza on Equipo", () => {
  expect(defaultPulseOwner(" AE@EXAMPLE.COM ", owners, "all")).toBe("82596016");
  expect(defaultPulseOwner("kam@example.com", owners, "all")).toBe("91603512");
  expect(defaultPulseOwner("gonza@example.com", owners, "all")).toBe("team");
  expect(defaultPulseOwner("other@example.com", owners, "all")).toBe("team");
  expect(defaultPulseOwner("kam@example.com", owners, "AE")).toBe("team");
});

test("uses Equipo when account identity is missing or ambiguous", () => {
  expect(defaultPulseOwner(null, owners, "all")).toBe("team");
  expect(defaultPulseOwner("ae@example.com", undefined, "all")).toBe("team");
  expect(defaultPulseOwner("ae@example.com", { ...owners, "123": "ae@example.com" }, "all")).toBe("team");
});

test("starts in the current calendar quarter in America/Coyhaique", () => {
  expect(defaultPulsePeriod(Date.parse("2026-11-25T12:00:00Z"))).toEqual({ year: "2026", quarter: "4" });
  expect(defaultPulsePeriod(Date.parse("2027-01-01T02:59:59Z"))).toEqual({ year: "2026", quarter: "4" });
  expect(defaultPulsePeriod(Date.parse("2027-01-01T03:00:00Z"))).toEqual({ year: "2027", quarter: "1" });
});
