import { useRef, useState } from "react";
import { ArrowUpRight, LoaderCircle, RefreshCw, X } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TASK_OUTCOMES,
  overdueTaskExposure,
  taskDaysOverdue,
  type OverdueTask,
  type TaskOutcome,
  type TaskScope,
} from "@/lib/overdue-tasks";
import { useOverdueTasks, type OverdueTasksController } from "@/hooks/use-overdue-tasks";

const outcomes: Record<TaskOutcome, string> = {
  active: "Activos",
  won: "Ganados",
  lost: "Perdidos",
};
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
const due = (value: string) =>
  new Date(value).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Coyhaique",
  });

type Props = {
  controller: OverdueTasksController;
  scope: TaskScope;
  dealIds: Record<TaskOutcome, string[]>;
  readAt: string;
  businessDay: string;
  onChanged: () => void;
  compact?: boolean;
};

export function OverdueTasks({
  controller,
  scope,
  dealIds,
  readAt,
  businessDay,
  onChanged,
  compact,
}: Props) {
  const origin = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [placement, setPlacement] = useState<{
    side: "left" | "right" | "top" | "bottom";
    width: number;
  }>({ side: "bottom", width: 580 });
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<TaskOutcome>("active");
  const closed = useOverdueTasks(
    dealIds[outcome],
    { ...scope, stages: [], outcome },
    readAt,
    businessDay,
    open && outcome !== "active",
    onChanged,
  );
  const current = outcome === "active" ? controller : closed;
  const active = controller.data ? overdueTaskExposure(controller.data) : null;
  const amount = active
    ? `${money(active.mrr)} MRR`
    : controller.error
      ? "Sin lectura"
      : "Cargando…";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor virtualRef={origin} />
      <button
        type="button"
        ref={origin}
        className={compact ? "overdue-task-shortcut" : "exec-health-widget exec-overdue-task"}
        title="Ver tareas vencidas por estado del deal"
        aria-label="Ver tareas vencidas"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          const rect = origin.current!.getBoundingClientRect();
          const right = window.innerWidth - rect.right;
          const left = rect.left;
          const available = Math.max(right, left);
          const horizontal = available >= 380;
          setPlacement({
            side: horizontal
              ? right >= left
                ? "right"
                : "left"
              : rect.top > window.innerHeight - rect.bottom
                ? "top"
                : "bottom",
            width: Math.min(580, window.innerWidth - 24, ...(horizontal ? [available - 22] : [])),
          });
          setOutcome("active");
          setOpen(true);
        }}
      >
        <span>Tareas</span>
        {compact ? (
          <b>{active?.tasks ?? "—"}</b>
        ) : (
          <strong>
            {active?.tasks ?? "—"}
            <ArrowUpRight size={14} aria-hidden="true" />
          </strong>
        )}
        <small>{amount}</small>
      </button>
      <PopoverContent
        className="overdue-tasks-popup won-mix-popover"
        aria-label="Tareas vencidas"
        side={placement.side}
        style={{ width: placement.width }}
        align={placement.side === "left" || placement.side === "right" ? "center" : "end"}
        sideOffset={10}
        collisionPadding={12}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          origin.current?.focus({ preventScroll: true });
        }}
      >
        <header>
          <h4>Tareas vencidas</h4>
          <button ref={closeRef} type="button" aria-label="Cerrar" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </header>
        <div className="overdue-task-filters" role="group" aria-label="Estado del deal">
          {TASK_OUTCOMES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={outcome === value}
              onClick={() => setOutcome(value)}
            >
              {outcomes[value]}
            </button>
          ))}
        </div>
        <OverdueTaskList
          key={current.scopeKey}
          controller={current}
          showAssignee={scope.owner === "team"}
        />
      </PopoverContent>
    </Popover>
  );
}

function OverdueTaskList({
  controller,
  showAssignee,
}: {
  controller: OverdueTasksController;
  showAssignee: boolean;
}) {
  const { data, error, loading, reload, complete } = controller;
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const exposure = data ? overdueTaskExposure(data) : null;
  const deals = new Map(data?.deals.map((deal) => [deal.id, deal]));
  // The service sorts by native due timestamp, also ordering calendar days from oldest to newest.
  const tasks = data?.tasks ?? [];
  const businessDay = data?.businessDay ?? "";

  const check = async (task: OverdueTask) => {
    setBusy((old) => new Set(old).add(task.id));
    setErrors((old) => ({ ...old, [task.id]: "" }));
    setNotice("");
    try {
      await complete(task);
      setNotice("Tarea completada en HubSpot");
    } catch (error) {
      setErrors((old) => ({
        ...old,
        [task.id]: error instanceof Error ? error.message : "No se pudo verificar el guardado.",
      }));
    } finally {
      setBusy((old) => {
        const next = new Set(old);
        next.delete(task.id);
        return next;
      });
    }
  };

  return (
    <>
      {exposure && (
        <div className="overdue-task-summary" aria-label="Resumen">
          <span>
            <strong>{exposure.tasks}</strong> {exposure.tasks === 1 ? "tarea" : "tareas"}
          </span>
          <span>
            <strong>{exposure.deals}</strong> {exposure.deals === 1 ? "deal" : "deals"}
          </span>
          <span title="Cada deal suma una vez">
            <strong>{money(exposure.mrr)}</strong> MRR
            {exposure.unvalued > 0 && <small> · {exposure.unvalued} sin monto</small>}
          </span>
        </div>
      )}
      <div className="overdue-task-notice" role="status">
        {notice}
      </div>
      <div className="overdue-task-items" aria-busy={loading}>
        {error && (
          <p className="overdue-task-error" role="alert">
            {error}
          </p>
        )}
        {loading && !data && (
          <p className="empty-state" role="status">
            Cargando tareas…
          </p>
        )}
        {!loading && !error && data && tasks.length === 0 && (
          <p className="empty-state">Sin tareas vencidas.</p>
        )}
        {tasks.map((task) => {
          const days = taskDaysOverdue(task.dueAt, businessDay);
          const saving = busy.has(task.id);
          return (
            <article key={task.id} className="overdue-task-row">
              <Checkbox
                className="overdue-task-check"
                aria-label={`Completar tarea en HubSpot: ${task.subject}`}
                checked={false}
                disabled={saving}
                onCheckedChange={(checked) => {
                  if (checked === true) void check(task);
                }}
              />
              <div>
                <strong>{task.subject}</strong>
                <div className="overdue-task-meta">
                  <time dateTime={task.dueAt}>{due(task.dueAt)}</time>
                  <span className="overdue-task-days">
                    {days} {days === 1 ? "día de atraso" : "días de atraso"}
                  </span>
                  {showAssignee && <span>{task.assignedTo}</span>}
                </div>
                <div className="overdue-task-deals">
                  {task.dealIds.map((id) => {
                    const deal = deals.get(id);
                    return (
                      deal && (
                        <a key={id} href={deal.url} target="_blank" rel="noreferrer">
                          {deal.name}
                          <small>
                            {Number.isFinite(deal.amount) && deal.amount > 0
                              ? `${money(deal.amount)} MRR`
                              : "Sin monto"}
                          </small>
                          <ArrowUpRight size={12} aria-hidden="true" />
                        </a>
                      )
                    );
                  })}
                </div>
                {saving && (
                  <small className="overdue-task-saving">
                    <LoaderCircle size={12} className="is-spinning" /> Guardando…
                  </small>
                )}
                {errors[task.id] && (
                  <p className="overdue-task-error" role="alert">
                    {errors[task.id]}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <footer>
        <span>La casilla completa la tarea en HubSpot.</span>
        <button
          type="button"
          disabled={loading}
          onClick={() => void reload()}
          aria-label="Actualizar tareas"
        >
          <RefreshCw size={13} className={loading ? "is-spinning" : undefined} />
        </button>
      </footer>
    </>
  );
}
