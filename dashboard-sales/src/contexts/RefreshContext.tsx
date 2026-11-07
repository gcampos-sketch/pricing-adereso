import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

type RefreshState = {
  onRefresh: (() => void) | null;
  isRefreshing: boolean;
  activeMrr: ActiveMrr | null;
};

export type ActiveMrrEntry = { id: string; name: string; owner: string; date: string; mrr: number };

export type ActiveMrr = {
  value: number;
  count: number;
  /** Serie de respaldo (snapshots antiguos sin entradas detalladas). */
  values: number[];
  labels: string[];
  changePct: number | null;
  /** Entradas a Inicio de servicio con fecha real: base de las series por periodo. */
  entries: ActiveMrrEntry[];
  lastStart: { date: string; name: string } | null;
  /** Deals en servicio excluidos porque la empresa asociada está en churn. */
  churnedExcluded: number;
  /** Monto en etapa 6 (firmado) o 7 (en desarrollo) que esperamos incorporar. */
  inDevelopment: { value: number; count: number } | null;
};

type RefreshContextValue = RefreshState & {
  setRefreshState: Dispatch<SetStateAction<RefreshState>>;
};

const RefreshContext = createContext<RefreshContextValue | null>(null);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [state, setRefreshState] = useState<RefreshState>({ onRefresh: null, isRefreshing: false, activeMrr: null });
  const value = useMemo(() => ({ ...state, setRefreshState }), [state]);
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

export function useRefreshMenu() {
  const context = useContext(RefreshContext);
  if (!context) throw new Error("useRefreshMenu debe usarse dentro de RefreshProvider");
  return context;
}

export function useRegisterRefresh(onRefresh: () => void, isRefreshing: boolean, activeMrr: ActiveMrr | null) {
  const { setRefreshState } = useRefreshMenu();
  useEffect(() => {
    setRefreshState((prev) =>
      prev.onRefresh === onRefresh && prev.isRefreshing === isRefreshing && prev.activeMrr === activeMrr
        ? prev
        : { onRefresh, isRefreshing, activeMrr },
    );
    return () => setRefreshState({ onRefresh: null, isRefreshing: false, activeMrr: null });
  }, [activeMrr, isRefreshing, onRefresh, setRefreshState]);
}