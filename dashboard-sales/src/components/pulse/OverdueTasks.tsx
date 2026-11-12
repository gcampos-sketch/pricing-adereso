import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, LoaderCircle, RefreshCw, X } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { overdueTaskExposure, type OverdueTaskReport, type OverdueTask } from "@/lib/overdue-tasks";
import type { OverdueTasksController } from "@/hooks/use-overdue-tasks";
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
export function OverdueTasks({
  controller,
  compact = false,
}: {
  controller: OverdueTasksController;
  compact?: boolean;
}) {
  const { data, error, loading, reload, complete, scopeKey } = controller;
  const origin = useRef<HTMLButtonElement | null>(null),
    closeRef = useRef<HTMLButtonElement | null>(null);
  const [placement, setPlacement] = useState<{
    side: "left" | "right" | "top" | "bottom";
    width: number;
  }>({ side: "bottom", width: 580 });
  const [open, setOpen] = useState(false),
    [view, setView] = useState<OverdueTaskReport | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set()),
    [busy, setBusy] = useState<Set<string>>(new Set()),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setOpen(false);
    setView(null);
    setDone(new Set());
    setErrors({});
  }, [scopeKey]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (!open && view) {
      const id = setTimeout(() => setView(null), 240);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [open, view]);
  useEffect(() => {
    if (open && data)
      setView((old) => ({
        ...data,
        tasks: [
          ...data.tasks,
          ...(old?.tasks.filter(
            (task) => done.has(task.id) && !data.tasks.some((item) => item.id === task.id),
          ) ?? []),
        ],
        deals: [
          ...new Map(
            [...(old?.deals ?? []), ...data.deals].map((deal) => [deal.id, deal]),
          ).values(),
        ],
      }));
  }, [data, open, done]);
  const exposure = data ? overdueTaskExposure(data) : null;
  const check = async (task: OverdueTask) => {
    setBusy((old) => new Set(old).add(task.id));
    setErrors((old) => ({ ...old, [task.id]: "" }));
    try {
      await complete(task);
      setDone((old) => new Set(old).add(task.id));
      setNotice("Tarea completada y verificada en HubSpot");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setNotice(""), 5000);
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
  if (!open && !view && !error && (!exposure || exposure.tasks === 0)) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor virtualRef={origin} />
      <button
        type="button"
        ref={origin}
        className={compact ? "overdue-task-shortcut" : "exec-health-widget exec-overdue-task"}
        title={
          error ||
          "Tareas de deals activos, vencidas antes de hoy. El MRR de cada deal se cuenta una vez."
        }
        aria-label={
          error
            ? "No se pudo actualizar tareas vencidas; reintentar"
            : `Ver ${exposure?.tasks ?? 0} tareas vencidas · ${money(exposure?.mrr ?? 0)} MRR involucrado`
        }
        onClick={() => {
          if (error && !data) {
            void reload();
            return;
          }
          const rect = origin.current!.getBoundingClientRect();
          const right = window.innerWidth - rect.right,
            left = rect.left,
            available = Math.max(right, left);
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
          setView(data);
          setDone(new Set());
          setErrors({});
          setNotice("");
          setOpen(true);
        }}
      >
        {compact ? (
          <>
            <span>Tareas vencidas</span>
            <b>{exposure?.tasks ?? "—"}</b>
            <small>{error ? "Lectura pendiente" : `${money(exposure?.mrr ?? 0)} MRR`}</small>
          </>
        ) : (
          <>
            <span>
              Tareas vencidas {loading ? <LoaderCircle className="is-spinning" size={12} /> : null}
            </span>
            <strong>
              {error && !data ? "Sin lectura" : (exposure?.tasks ?? "—")}
              <ArrowUpRight size={14} />
            </strong>
            <small>
              {error
                ? data
                  ? "Datos anteriores · actualizar"
                  : "Reintentar lectura"
                : `${exposure?.deals ?? 0} deals · ${money(exposure?.mrr ?? 0)} MRR involucrado`}
            </small>
          </>
        )}
      </button>
      <PopoverContent
        className="overdue-tasks-popup won-mix-popover"
        aria-label="Tareas vencidas de HubSpot"
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
          <div>
            <h4>Tareas vencidas</h4>
            <p>
              Deals activos del filtro · vencidas antes de hoy en horario de Chile · sin filtro de
              año o trimestre.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Cerrar tareas vencidas"
            onClick={() => setOpen(false)}
          >
            <X size={16} />
          </button>
        </header>
        <div className="overdue-task-summary">
          <div>
            <strong>{exposure?.tasks ?? 0}</strong>
            <span>tareas pendientes</span>
          </div>
          <div>
            <strong>{exposure?.deals ?? 0}</strong>
            <span>deals únicos</span>
          </div>
          <div>
            <strong>{money(exposure?.mrr ?? 0)}</strong>
            <span>MRR involucrado</span>
          </div>
        </div>
        <p className="overdue-task-explainer">
          MRR potencial asociado, no pérdida confirmada. Cada deal suma una vez aunque tenga varias
          tareas.{exposure?.unvalued ? ` ${exposure.unvalued} deals sin MRR valorizado.` : ""}
        </p>
        <div className="overdue-task-notice" role="status" aria-live="polite">
          {notice}
        </div>
        {error ? (
          <p role="alert">
            {error}{" "}
            <button type="button" onClick={() => void reload()}>
              Reintentar
            </button>
          </p>
        ) : null}
        <div className="overdue-task-items">
          {(view?.tasks ?? []).map((task) => {
            const related = view?.deals.filter((deal) => task.dealIds.includes(deal.id)) ?? [];
            return (
              <article
                key={task.id}
                className="overdue-task-row"
                data-done={done.has(task.id) || undefined}
              >
                <Checkbox
                  className="overdue-task-check"
                  aria-label={`Completar tarea: ${task.subject}`}
                  checked={done.has(task.id)}
                  disabled={busy.has(task.id) || done.has(task.id)}
                  onCheckedChange={(checked) => {
                    if (checked === true) void check(task);
                  }}
                />
                <div>
                  <strong>{task.subject}</strong>
                  <span className="overdue-task-meta">
                    Venció {due(task.dueAt)} · {task.assignedTo}
                    {task.priority === "HIGH" ? " · prioridad alta" : ""}
                  </span>
                  <div className="overdue-task-deals">
                    {related.map((deal) => (
                      <a key={deal.id} href={deal.url} target="_blank" rel="noreferrer">
                        {deal.name} <small>{money(deal.amount)} MRR</small>
                        <ArrowUpRight size={12} />
                      </a>
                    ))}
                  </div>
                  {busy.has(task.id) ? (
                    <small className="overdue-task-saving">
                      <LoaderCircle size={12} className="is-spinning" /> Guardando y verificando…
                    </small>
                  ) : done.has(task.id) ? (
                    <small className="overdue-task-done">
                      <Check size={12} /> Completada en HubSpot
                    </small>
                  ) : null}
                  {errors[task.id] ? (
                    <p className="overdue-task-error" role="alert">
                      {errors[task.id]}
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
          {!exposure?.tasks ? (
            <p className="empty-state">Ya no quedan tareas vencidas en este alcance.</p>
          ) : null}
        </div>
        <footer>
          <span>
            La casilla completa esa tarea en HubSpot.{" "}
            {data
              ? `Lectura ${new Date(data.readAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Coyhaique" })}`
              : ""}
          </span>
          <button
            type="button"
            disabled={loading}
            onClick={() => void reload()}
            title="Actualizar tareas"
          >
            <RefreshCw size={13} />
          </button>
        </footer>
      </PopoverContent>
    </Popover>
  );
}
