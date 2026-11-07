/* Source text is rendered with textContent; learning progress stays in its existing store. */
(() => {
  const panel = document.getElementById('academy-sources');
  if (!panel) return;
  const status = document.getElementById('academy-sync-status');
  const homeStatus = document.getElementById('academy-home-sync');
  const input = document.getElementById('academy-source-search');
  const list = document.getElementById('academy-source-list');
  const meta = document.getElementById('academy-source-meta');
  const labels = { notion: 'Wiki comercial', help: 'Help Center' };
  let documents = [], source = 'all', loadedAt = 0, loading = false;
  let connectButton;
  const normalized = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function element(tag, text, cls) {
    const el = document.createElement(tag); if (text) el.textContent = text;
    if (cls) el.className = cls; return el;
  }
  function message(text) { status.textContent = text; homeStatus.textContent = text; }
  async function oauthControl() {
    try {
      const response = await fetch('/api/academy/notion/status', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) return; const info = await response.json();
      if (!info.canConnect || !info.configured) return;
      if (!connectButton) {
        connectButton = element('button', 'Conectar Notion'); connectButton.type = 'button';
        panel.querySelector('.academy-source-controls').append(connectButton);
        connectButton.addEventListener('click', async () => {
          connectButton.disabled = true;
          try {
            const r = await fetch('/api/academy/notion/connect', { method: 'POST', credentials: 'same-origin' });
            if (!r.ok) throw new Error('connection failed'); const data = await r.json(); const u = new URL(data.url);
            if (u.origin !== 'https://api.notion.com' || u.pathname !== '/v1/oauth/authorize') throw new Error('invalid redirect');
            window.top.location.assign(u.href);
          } catch { message('No se pudo abrir la autorización de Notion. Vuelve a iniciar sesión en el Hub e inténtalo otra vez.'); connectButton.disabled = false; }
        });
      }
      connectButton.textContent = info.connected ? 'Reconectar Notion' : 'Conectar Notion';
    } catch { /* Source reading and existing learning stay available. */ }
  }
  function sourceLink(doc) {
    try {
      const u = new URL(doc.url);
      const hosts = doc.source === 'help' ? ['help.adereso.ai'] : ['www.notion.so', 'app.notion.com'];
      if (u.protocol !== 'https:' || u.username || u.password || u.port || !hosts.includes(u.hostname)) return null;
      const link = element('a', 'Ver fuente ↗'); link.href = u.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
    } catch { return null; }
  }
  function render() {
    list.replaceChildren(); const query = normalized(input.value.trim());
    const filtered = documents.filter(d => (source === 'all' || d.source === source) && normalized(d.title + '\n' + d.text).includes(query));
    meta.textContent = filtered.length + ' documentos · contenido original de las fuentes';
    // Limit visible results, not the indexed content. Search covers every downloaded document.
    for (const doc of filtered.slice(0, 40)) {
      const card = element('details', '', 'academy-source-doc');
      card.append(element('summary', doc.title));
      const provenance = element('div', '', 'academy-source-provenance');
      provenance.append(element('span', labels[doc.source] + (doc.sourceEditedAt ? ' · Fuente editada: ' + new Date(doc.sourceEditedAt).toLocaleDateString('es-CL') : ' · Sin fecha de edición informada')));
      const link = sourceLink(doc); if (link) provenance.append(link);
      card.append(provenance);
      card.addEventListener('toggle', () => {
        if (card.open && !card.querySelector('.academy-source-text')) card.append(element('div', doc.text, 'academy-source-text'));
      });
      list.append(card);
    }
    if (!filtered.length) list.append(element('p', documents.length ? 'No hay coincidencias. Prueba otro término.' : 'Todavía no hay una versión sincronizada. Puedes consultar las fuentes desde sus enlaces.'));
    if (filtered.length > 40) list.append(element('p', 'Mostrando 40 resultados. Busca un tema para acotar la lista.'));
  }
  async function refresh() {
    if (loading || Date.now() - loadedAt < 60_000) return;
    loading = true;
    try {
      const response = await fetch('/api/academy/content', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('unavailable'); const data = await response.json();
      if (data.schema !== 'academy-content/v1' || !Array.isArray(data.documents) || !Array.isArray(data.sources)) throw new Error('invalid');
      documents = data.documents.filter(d => ['help','notion'].includes(d.source) && typeof d.title === 'string' && typeof d.text === 'string');
      const notes = data.sources.map(s => {
        if (!s.configured) return labels[s.source] + ': conexión pendiente';
        if (s.error) return labels[s.source] + ': lectura pendiente' + (s.version ? ' · última versión conservada' : '');
        if (!s.version) return labels[s.source] + ': primera sincronización pendiente';
        const date = s.checkedAt ? new Date(s.checkedAt) : null;
        const stale = !date || Date.now() - date.getTime() > 60 * 60_000;
        return labels[s.source] + ': ' + (stale ? 'comprobación atrasada · ' : 'comprobado ') + (date ? date.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : 'sin fecha');
      });
      message(data.setupRequired ? 'Sincronización preparada · activación pendiente' : notes.join(' · '));
      loadedAt = Date.now(); render(); void oauthControl();
    } catch {
      message('No se pudo comprobar la actualización. El entrenamiento base y tu avance siguen disponibles.');
    } finally { loading = false; }
  }
  input.addEventListener('input', render);
  panel.querySelectorAll('[data-academy-source]').forEach(button => button.addEventListener('click', () => {
    source = button.dataset.academySource;
    panel.querySelectorAll('[data-academy-source]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); render();
  }));
  document.getElementById('academy-open-sources').addEventListener('click', () => {
    if (typeof switchTab === 'function') switchTab('products'); panel.open = true; input.focus();
  });
  // Poll only while this iframe is actually visible; no hidden-dashboard work or writes to progress.
  const visible = () => document.visibilityState === 'visible' && (!window.frameElement || window.frameElement.getBoundingClientRect().height > 0);
  setInterval(() => { if (visible()) void refresh(); }, 5 * 60_000);
  document.addEventListener('visibilitychange', () => { if (visible()) void refresh(); });
  render(); void refresh();
})();
