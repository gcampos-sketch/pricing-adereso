import { useCallback, useEffect, useRef, useState } from "react";
import { getOverdueTaskReport, completeOverdueTaskFn } from "@/lib/pulse.functions";
import type { OverdueTaskReport, TaskScope, OverdueTask } from "@/lib/overdue-tasks";
export function useOverdueTasks(
  dealIds: string[],
  scope: TaskScope,
  readAt: string,
  businessDay: string,
  enabled: boolean,
  onChanged: () => void,
) {
  const scopeKey = JSON.stringify([dealIds, scope.owner, scope.role, scope.type, scope.stages]);
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const inputRef = useRef({ ...scope, dealIds });
  inputRef.current = { ...scope, dealIds };
  const changedRef = useRef(onChanged),
    enabledRef = useRef(enabled);
  changedRef.current = onChanged;
  enabledRef.current = enabled;
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );
  const notifyChange = () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => changedRef.current(), 1200);
  };
  const revision = useRef(0),
    request = useRef(0);
  const [state, setState] = useState<{
    key: string;
    data: OverdueTaskReport | null;
    error: string | null;
    loading: boolean;
  }>({ key: "", data: null, error: null, loading: false });
  const load = useCallback(async () => {
    const key = scopeRef.current,
      version = revision.current,
      sequence = ++request.current;
    setState((old) => ({
      key,
      data: old.key === key ? old.data : null,
      error: null,
      loading: true,
    }));
    try {
      const data = await getOverdueTaskReport({ data: inputRef.current });
      if (scopeRef.current === key && revision.current === version && request.current === sequence)
        setState({ key, data, error: null, loading: false });
    } catch (error) {
      if (scopeRef.current === key && revision.current === version && request.current === sequence)
        setState((old) => ({
          key,
          data: old.key === key ? old.data : null,
          error: error instanceof Error ? error.message : "No se pudieron leer las tareas.",
          loading: false,
        }));
    }
  }, []);
  useEffect(() => {
    if (enabled) void load();
    return () => {
      request.current++;
    };
  }, [scopeKey, readAt, businessDay, enabled, load]);
  const complete = async (task: OverdueTask) => {
    const key = scopeRef.current;
    const result = await completeOverdueTaskFn({
      data: { ...inputRef.current, dealIds: task.dealIds, taskId: task.id },
    });
    if (result.status !== "COMPLETED") throw Error("No se confirmó el estado de la tarea.");
    if (scopeRef.current === key) {
      revision.current++;
      setState((old) =>
        old.key === key && old.data
          ? {
              ...old,
              loading: false,
              error: null,
              data: { ...old.data, tasks: old.data.tasks.filter((item) => item.id !== task.id) },
            }
          : old,
      );
      notifyChange();
    } else if (enabledRef.current) {
      // A global task may also be in the newly selected scope. Re-read that scope,
      // never splice a response from the prior filter into it.
      await load();
      notifyChange();
    }
  };
  return {
    data: state.key === scopeKey ? state.data : null,
    error: state.key === scopeKey ? state.error : null,
    loading: state.key !== scopeKey || state.loading,
    reload: load,
    complete,
    scopeKey,
  };
}
export type OverdueTasksController = ReturnType<typeof useOverdueTasks>;
