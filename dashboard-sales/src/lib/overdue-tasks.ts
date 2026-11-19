import { LOST_STAGES, WON_STAGES } from "./commercial-outcomes";
import type { RoleFilter } from "./owner-roles";
export const TASK_OPEN_STAGES: Record<string, string> = {
  "1144383754": "E0",
  "171385863": "E1",
  "171385864": "E2",
  "173996363": "E3",
  "1181334581": "E3.1",
  "171385866": "E4",
  "171385867": "E5",
  "1245768029": "E5.1",
};
export const TASK_OUTCOMES = ["active", "won", "lost"] as const;
export type TaskOutcome = (typeof TASK_OUTCOMES)[number];
export type TaskScope = {
  owner: string;
  role: RoleFilter;
  type: string;
  stages: string[];
  outcome?: TaskOutcome;
};
export function taskDealOutcome(stageId: string): TaskOutcome | undefined {
  if (Object.hasOwn(TASK_OPEN_STAGES, stageId)) return "active";
  if (WON_STAGES.has(stageId)) return "won";
  if (LOST_STAGES.has(stageId)) return "lost";
  return undefined;
}
export type TaskDeal = { id: string; name: string; url: string; owner: string; amount: number };
export type OverdueTask = {
  id: string;
  subject: string;
  dueAt: string;
  assignedTo: string;
  priority: string;
  type: string;
  dealIds: string[];
};
export type OverdueTaskReport = {
  readAt: string;
  businessDay: string;
  tasks: OverdueTask[];
  deals: TaskDeal[];
};
export const taskBusinessDay = (value: number | string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Coyhaique",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
export function taskDueTime(value: string | null | undefined) {
  const stamp = value && /^\d+$/.test(value) ? Number(value) : Date.parse(value ?? "");
  return Number.isFinite(stamp) ? stamp : null;
}
export function taskDaysOverdue(dueAt: string, businessDay: string) {
  // Compare calendar dates in Coyhaique, independent of the length of a day during DST.
  return (Date.parse(businessDay) - Date.parse(taskBusinessDay(dueAt))) / 86_400_000;
}
export function isOverduePendingTask(
  status: string | undefined | null,
  due: string | undefined | null,
  now: number,
) {
  const stamp = taskDueTime(due);
  return (
    ["NOT_STARTED", "WAITING", "IN_PROGRESS", "DEFERRED"].includes(status ?? "") &&
    stamp !== null &&
    taskBusinessDay(stamp) < taskBusinessDay(now)
  );
}
/** Deduplicate BOTH tasks and deals: a deal's MRR never multiplies by its task count. */
export function overdueTaskExposure(report: OverdueTaskReport) {
  const tasks = [...new Map(report.tasks.map((task) => [task.id, task])).values()];
  const involved = new Set(tasks.flatMap((task) => task.dealIds));
  const deals = [
    ...new Map(
      report.deals.filter((deal) => involved.has(deal.id)).map((deal) => [deal.id, deal]),
    ).values(),
  ];
  return {
    tasks: tasks.length,
    deals: deals.length,
    mrr: deals.reduce(
      (sum, deal) => sum + Math.max(0, Number.isFinite(deal.amount) ? deal.amount : 0),
      0,
    ),
    unvalued: deals.filter((deal) => !Number.isFinite(deal.amount) || deal.amount <= 0).length,
  };
}
