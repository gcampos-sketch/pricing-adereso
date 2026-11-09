import { useState } from 'react';
import { MessageSquare, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRefreshMenu } from '@/contexts/RefreshContext';
import { FeedbackDialog } from './FeedbackBubble';

/** Report-only actions; identity and sign-out belong to the global Hub rail. */
export function DashboardMenu({ view, compact = false }: { view: string; compact?: boolean }) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { onRefresh, isRefreshing } = useRefreshMenu();
  return <div className="dashboard-menu" data-compact={compact}>
    <Button variant="ghost" className="dashboard-feedback-trigger" aria-label="Dejar feedback del dashboard" title="Dejar feedback del dashboard" onClick={() => setFeedbackOpen(true)}>
      <MessageSquare aria-hidden="true" /><span>Dejar feedback</span>
    </Button>
    {onRefresh ? <Button variant="ghost" size="icon" className="dashboard-refresh-trigger" aria-label={isRefreshing ? 'Actualizando dashboard' : 'Refrescar dashboard'} title="Refrescar dashboard" disabled={isRefreshing} onClick={() => onRefresh()}>
      <RefreshCw className={isRefreshing ? 'auth-refresh-spin' : undefined} aria-hidden="true" />
    </Button> : null}
    <FeedbackDialog view={view} open={feedbackOpen} onOpenChange={setFeedbackOpen} />
  </div>;
}
