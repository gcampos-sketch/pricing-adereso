import { currentMonthKey } from "./deal-month-summary";
import { roleOfOwner, type RoleFilter } from "./owner-roles";

const GONZA_OWNER_ID = "331766554";

export function defaultPulsePeriod(now: number) {
  const [year, month] = currentMonthKey(now).split("-");
  return { year: year!, quarter: String(Math.ceil(Number(month) / 3)) };
}

/** Match the authenticated account to its native HubSpot owner, never by display name. */
export function defaultPulseOwner(
  accountEmail: string | null,
  ownerEmails: Record<string, string> | undefined,
  role: RoleFilter,
) {
  const email = accountEmail?.trim().toLowerCase();
  if (!email || !ownerEmails) return "team";

  const matches = Object.entries(ownerEmails).filter(([, ownerEmail]) => ownerEmail.trim().toLowerCase() === email);
  if (matches.length !== 1) return "team";

  const ownerId = matches[0]![0];
  const ownerRole = roleOfOwner(ownerId);
  return ownerId !== GONZA_OWNER_ID && ownerRole && (role === "all" || ownerRole === role)
    ? ownerId
    : "team";
}
