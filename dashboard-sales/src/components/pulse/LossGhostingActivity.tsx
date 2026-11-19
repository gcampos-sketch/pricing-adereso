import { AlertTriangle, Check, CircleHelp } from "lucide-react";
import { GHOSTING_CHANNELS, GHOSTING_MINIMUM, ghostingMinimum, type GhostingActivity } from "@/lib/loss-ghosting";

const labels = { met: "Cumple el mínimo", short: "Bajo el mínimo", unknown: "Mínimo sin verificar" };

export function LossGhostingActivity({ activity, loading }: { activity?: GhostingActivity | undefined; loading: boolean }) {
  const status = ghostingMinimum(activity);
  const Icon = status === "met" ? Check : status === "short" ? AlertTriangle : CircleHelp;

  return <div className="loss-ghosting-activity">
    <div className="loss-ghosting-status" data-status={status}>
      <Icon size={14} aria-hidden="true" />{loading ? "Consultando HubSpot…" : labels[status]}
    </div>
    <dl className="loss-ghosting-counts">
      {GHOSTING_CHANNELS.map(([channel, label]) => {
        const count = activity?.[channel] ?? null;
        return <div key={channel} data-status={count === null ? "unknown" : count < GHOSTING_MINIMUM ? "short" : "met"}>
          <dt>{label}</dt>
          <dd>{count === null ? <span aria-label="Sin verificar">—</span> : <><strong>{count}</strong><span> / {GHOSTING_MINIMUM}</span></>}</dd>
        </div>;
      })}
      <div>
        <dt>Reuniones completadas</dt>
        <dd>{activity?.meetings ? <strong>{activity.meetings.completed}</strong> : <span aria-label="Sin verificar">—</span>}</dd>
      </div>
    </dl>
    {!!activity?.meetings?.unverified && <p>{activity.meetings.unverified} {activity.meetings.unverified === 1 ? "reunión sin verificar" : "reuniones sin verificar"}</p>}
  </div>;
}
