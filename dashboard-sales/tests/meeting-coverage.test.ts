import { expect, test } from "bun:test";
import {
  buildMeetingCoverage,
  googleCalendarKey,
  isPerformedMeeting,
  type RegistryRecord,
  type CalendarAudit,
} from "../src/lib/meeting-coverage";
import type { MeetingReport } from "../src/lib/meeting-metrics";
const id = "343f605a-0bde-11f0-a454-06254876e271";
const url = (event = "event", calendar = "owner@adere.so") =>
  `https://www.google.com/calendar/event?eid=${btoa(`${event} ${calendar}`)}`;
const row: RegistryRecord = {
  hubspotMeetingId: "123",
  name: "Synthetic",
  ownerId: "owner",
  startedAt: "2026-10-09T12:00:00Z",
  outcome: "COMPLETED",
  dealIds: ["deal"],
  externalUrl: url(),
  recordingUrl: `https://adereso.diio.com/meetings/${id}`,
};
const calendar: CalendarAudit = {
  checkedAt: "2026-11-11T12:00:00Z",
  start: "2026-10-01T03:00:00Z",
  end: "2027-01-01T03:00:00Z",
  complete: true,
  calendars: [
    {
      id: "owner@adere.so",
      complete: true,
      events: [
        {
          id: "event",
          name: "Synthetic",
          start: row.startedAt,
          end: "2026-10-09T13:00:00Z",
          status: "confirmed",
          url: url(),
        },
      ],
    },
  ],
};
const diio: MeetingReport = {
  fetchedAt: calendar.checkedAt,
  classificationAuthority: "diio",
  events: [{ id, date: "2026-10-09", type: "C", dealIds: ["deal"] }],
  candidateDeals: 1,
  scannedDeals: 1,
  unresolved: 0,
  conflicts: 0,
  complete: true,
};
const window = {
  start: "2026-01-01T03:00:00Z",
  end: calendar.end,
  checkedAt: calendar.checkedAt,
  complete: true,
};
test("exact provider keys reconcile without merging sources or leaking private payloads", () => {
  expect(googleCalendarKey(url())).toEqual({ eventId: "event", calendarId: "owner@adere.so" });
  expect(googleCalendarKey(url().replace("www.google.com", "evil.test"))).toBeNull();
  const result = buildMeetingCoverage(
    [row, row, { ...row, hubspotMeetingId: "private", dealIds: [], body: "private" }],
    calendar,
    diio,
    { ...window, records: "must not leak" } as typeof window,
  );
  expect(result.events).toHaveLength(1);
  expect(result.events[0]).toMatchObject({
    type: "C",
    calendarState: "verified",
    diioState: "verified",
  });
  expect(JSON.stringify(result)).not.toContain("must not leak");
  expect(JSON.stringify(result.events)).not.toContain("private");
});
test("same titles and times cannot establish identity; date contradictions stay pending", () => {
  const wrong = buildMeetingCoverage(
    [{ ...row, externalUrl: url("other"), recordingUrl: null }],
    calendar,
    diio,
    window,
  ).events[0]!;
  expect(wrong).toMatchObject({
    calendarState: "not_found",
    diioState: "not_verified",
    type: "unknown",
  });
  const conflict = buildMeetingCoverage(
    [{ ...row, startedAt: "2026-10-10T12:00:00Z" }],
    calendar,
    diio,
    window,
  ).events[0]!;
  expect(conflict).toMatchObject({
    calendarState: "different_date",
    diioState: "different_date",
    type: "unknown",
  });
});
test("a guest copy requires exact event ID, instant and organizer; it proves agenda presence only", () => {
  const guest: CalendarAudit = {
    ...calendar,
    calendars: [
      {
        id: "guest@adere.so",
        complete: true,
        events: [{ ...calendar.calendars[0]!.events[0]!, organizer: "owner@adere.so" }],
      },
    ],
  };
  expect(buildMeetingCoverage([row], guest, diio, window).events[0]?.calendarState).toBe(
    "guest_copy",
  );
  guest.calendars[0]!.events[0]!.organizer = "other@adere.so";
  expect(buildMeetingCoverage([row], guest, diio, window).events[0]?.calendarState).toBe(
    "calendar_not_covered",
  );
  expect(isPerformedMeeting({ ...row, outcome: "SCHEDULED" }, Date.parse(calendar.checkedAt))).toBe(
    false,
  );
  expect(
    isPerformedMeeting(
      { ...row, startedAt: "2026-12-01T12:00:00Z" },
      Date.parse(calendar.checkedAt),
    ),
  ).toBe(false);
  expect(isPerformedMeeting(row, Date.parse(calendar.checkedAt))).toBe(true);
});
test("calendar coverage cannot claim zeros or verification for an unread period", () => {
  expect(
    buildMeetingCoverage([{ ...row, startedAt: "2026-07-01T12:00:00Z" }], calendar, diio, window)
      .events[0]?.calendarState,
  ).toBe("outside_coverage");
});

test("an exact event read verifies presence without claiming full agenda coverage", () => {
  const partial = {
    ...calendar,
    calendars: calendar.calendars.map((cal) => ({ ...cal, complete: false })),
  };
  const result = buildMeetingCoverage([row], partial, diio, window);
  expect(result.events[0]!.calendarState).toBe("verified");
  expect(result.calendarComplete).toBe(false);
  expect(result.calendarCount).toBe(0);
  const absent = buildMeetingCoverage(
    [{ ...row, externalUrl: url("unread-event") }],
    partial,
    diio,
    window,
  );
  expect(absent.events[0]!.calendarState).toBe("calendar_not_covered");
});
