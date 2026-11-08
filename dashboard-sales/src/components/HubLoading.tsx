import wordmark from '../../../logoadereso.webp';

/** Lightweight CSS animation: visible before hydration and throughout session checks. */
export function HubLoading() {
  return <section className="hub-loading" role="status" aria-live="polite" aria-label="Cargando el Hub comercial">
    <div className="hub-loading-content">
      <div className="hub-loading-brand" aria-hidden="true">
        <img src={wordmark} width={566} height={113} alt="" fetchPriority="high" />
      </div>
      <p>Cargando tu Hub<span className="hub-loading-dots" aria-hidden="true">…</span></p>
      <span className="hub-loading-hint">Estamos preparando tus herramientas. No necesitas actualizar.</span>
    </div>
  </section>;
}
