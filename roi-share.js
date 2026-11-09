/* Private Hub dialog. Public calculators never load deal search or CRM data. */
(() => {
 'use strict';
 const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const errors = {
  authentication_required: 'Tu sesión venció. Vuelve a ingresar al Hub.',
  crm_not_configured: 'La conexión con HubSpot está pendiente de configuración en este entorno.',
  roi_not_configured: 'La función está pendiente de habilitación.',
  roi_storage_unavailable: 'No pudimos confirmar el guardado del enlace. Puedes reintentar con la misma solicitud.',
  invalid_deal: 'Selecciona un deal del pipeline Comercial Adereso.',
  contacts_incomplete: 'No pudimos cargar todos los contactos. Puedes escribir el destinatario.',
  rate_limit: 'Se alcanzó el límite temporal. Intenta más tarde.',
  request_conflict: 'La selección cambió. Cierra y vuelve a abrir para generar otro enlace.',
 };
 async function api(route, data, signal) {
  const response = await fetch('/api/hub/roi/' + route, { method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', signal, headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(errors[result.error] || 'No pudimos completar la acción. Intenta nuevamente.');
  return result;
 }
 function styles() {
  if (document.getElementById('roiShareStyles')) return;
  const style = document.createElement('style'); style.id = 'roiShareStyles';
  style.textContent = `
  .roi-share-dialog{width:min(680px,calc(100vw - 32px));max-height:calc(100dvh - 40px);padding:0;border:1px solid #34363f;border-radius:24px;background:#14161c;color:#f3f3f5;box-shadow:0 32px 100px #0009;font:14px/1.5 'Work Sans',sans-serif;overflow:auto;color-scheme:dark}
  .roi-share-dialog::backdrop{background:#07090dbb;backdrop-filter:blur(7px)}
  .roi-share-dialog *{box-sizing:border-box}.roi-share-dialog [hidden]{display:none!important}
  .roi-share-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:28px 30px 18px}.roi-share-head h2{font:500 26px/1.2 Outfit,sans-serif;letter-spacing:-.7px;margin:0 0 8px}.roi-share-head p{margin:0;color:#a6a9b5}.roi-share-close{background:transparent;border:0;color:#a6a9b5;font-size:26px;cursor:pointer;line-height:1}
  .roi-share-tabs{display:flex;gap:20px;padding:0 30px;border-bottom:1px solid #2e3139}.roi-share-tabs button{border:0;border-bottom:2px solid transparent;padding:12px 0;background:none;color:#999eac;font:inherit;cursor:pointer}.roi-share-tabs button[aria-pressed=true]{border-color:#ffd540;color:#ffd540}
  .roi-share-body{padding:24px 30px 28px}.roi-share-dialog label,.roi-share-label{display:block;font-weight:600;margin:0 0 8px}.roi-share-dialog input,.roi-share-dialog textarea,.roi-share-dialog select{width:100%;border:1px solid #3b3e48;border-radius:10px;background:#0d0f14;color:#f3f3f5;padding:11px 13px;font:inherit}.roi-share-dialog input:focus,.roi-share-dialog textarea:focus,.roi-share-dialog select:focus{outline:2px solid #ffd540;outline-offset:2px}.roi-share-dialog textarea{resize:vertical;min-height:170px;line-height:1.7}.roi-share-field{margin-bottom:18px}.roi-share-hint{display:block;color:#949aa8;font-size:12px;margin:7px 0 0}.roi-share-results{display:grid;gap:6px;margin:10px 0 0;max-height:220px;overflow:auto}.roi-share-result{display:block;text-align:left;border:1px solid #343843;border-radius:10px;background:#20232c;color:#f3f3f5;padding:10px 12px;cursor:pointer;font:inherit}.roi-share-result small{display:block;color:#949aa8}.roi-share-selected{padding:12px 14px;background:#25271f;border:1px solid #6e642e;border-radius:12px;margin:10px 0 18px;display:flex;align-items:center;gap:12px;justify-content:space-between}.roi-share-selected button{color:#ffd540;background:none;border:0;font:inherit;cursor:pointer}.roi-share-actions{display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:10px;margin-top:22px}.roi-share-actions button,.roi-share-actions a{display:inline-flex;align-items:center;justify-content:center;border:1px solid #44464f;border-radius:24px;background:transparent;color:#eee;padding:11px 19px;text-decoration:none;font:600 13px/1.3 'Work Sans',sans-serif;cursor:pointer}.roi-share-actions .primary{background:#ffd540;color:#151515;border-color:#ffd540}.roi-share-actions :disabled{opacity:.4;cursor:default}.roi-share-status{margin:16px 0 0;min-height:21px;color:#bfc3ce}.roi-share-status.error{color:#ffaaa0}.roi-share-context{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:22px}.roi-share-context span{background:#242731;border-radius:20px;padding:6px 11px;color:#bec3d0;font-size:12px}.roi-share-history article{border:1px solid #343843;border-radius:14px;padding:16px;margin-bottom:12px}.roi-share-history h3{font-size:14px;margin:0 0 5px}.roi-share-history p{color:#b0b6c3;font-size:13px;margin:7px 0}.roi-share-history details{font-size:12px;color:#bcc2cf;margin-top:12px}.roi-share-history dl{display:grid;grid-template-columns:1fr auto;gap:4px 12px;margin:8px 0 14px}.roi-share-history dd{margin:0}.roi-share-empty{padding:28px 0;color:#9ea5b4;text-align:center}.roi-share-dialog summary{cursor:pointer}.roi-share-dialog :focus-visible{outline:2px solid #ffd540;outline-offset:3px}
  @media(max-width:560px){.roi-share-head{padding:22px 20px 16px}.roi-share-head h2{font-size:23px}.roi-share-body{padding:20px}.roi-share-tabs{padding:0 20px}.roi-share-actions>*{flex:1}.roi-share-dialog{max-height:calc(100dvh - 24px)}}`;
  document.head.appendChild(style);
 }
 let active;
 window.openRoiShare = function(context) {
  if (active) { active.focus(); return; }
  styles();
  const dialog = document.createElement('dialog'); dialog.className = 'roi-share-dialog'; dialog.setAttribute('aria-labelledby','roiShareTitle');
  const lastFocus = document.activeElement;
  dialog.innerHTML = `<div class="roi-share-head"><div><h2 id="roiShareTitle">Compartir calculadora</h2><p>Vincula el deal y prepara el correo.</p></div><button class="roi-share-close" type="button" aria-label="Cerrar">×</button></div>
  <div class="roi-share-tabs" role="group" aria-label="Vista"><button type="button" data-view="prepare" aria-pressed="true">Preparar correo</button><button type="button" data-view="history" aria-pressed="false">Enlaces compartidos</button></div>
  <div class="roi-share-body"><section data-panel="prepare"><div class="roi-share-context"><span>${esc(context.mensualidad.toLocaleString('es-CL'))} USD / mes</span><span>${esc(context.volumen.toLocaleString('es-CL'))} conversaciones</span></div>
  <form id="roiShareForm"><div class="roi-share-field" id="roiDealField"><label for="roiDealSearch">Vincular deal <span aria-hidden="true">*</span></label><input id="roiDealSearch" type="search" autocomplete="off" placeholder="Busca por nombre o ID del deal" aria-required="true" aria-describedby="roiDealHint"><small class="roi-share-hint" id="roiDealHint">Obligatorio · Pipeline Comercial Adereso</small><div class="roi-share-results" id="roiDealResults" aria-live="polite"></div></div>
  <div class="roi-share-selected" id="roiSelectedDeal" hidden></div><div id="roiDraftFields" hidden>
  <div class="roi-share-field" id="roiContactField" hidden><label for="roiContact">Contacto del deal</label><select id="roiContact"></select></div>
  <div class="roi-share-field"><label for="roiEmailTo">Para</label><input id="roiEmailTo" type="email" autocomplete="email" placeholder="nombre@empresa.com" required maxlength="254"></div>
  <div id="roiReadyFields" hidden><div class="roi-share-field"><label for="roiGeneratedLink">Enlace de la calculadora</label><input id="roiGeneratedLink" type="url" readonly></div>
  <div class="roi-share-field"><label for="roiEmailSubject">Asunto</label><input id="roiEmailSubject" maxlength="200" required></div>
  <div class="roi-share-field"><label for="roiEmailBody">Mensaje</label><textarea id="roiEmailBody" rows="8" maxlength="6000" required></textarea><small class="roi-share-hint">Revisa el borrador y envíalo desde tu correo.</small></div></div></div>
  <div class="roi-share-actions"><button id="roiGenerate" type="submit" class="primary" disabled>Generar enlace</button><a id="roiPreviewLink" target="_blank" rel="noopener noreferrer" hidden>Vista previa ↗</a><button id="roiCopyLink" type="button" hidden>Copiar enlace</button><a id="roiOpenEmail" class="primary" target="_blank" rel="noopener noreferrer" hidden>Abrir borrador en Gmail ↗</a></div></form>
  <p id="roiShareStatus" class="roi-share-status" role="status" aria-live="polite"></p></section>
  <section data-panel="history" hidden><div class="roi-share-history" id="roiShareHistory"></div><small class="roi-share-hint">Últimos 50 enlaces que generaste. Las visitas corresponden a sesiones de uso del enlace; no identifican a la persona ni confirman el envío del correo.</small><div class="roi-share-actions"><button id="roiRefreshActivity" type="button">Actualizar actividad</button></div></section></div>`;
  const $ = selector => dialog.querySelector(selector);
  let selected = null, generated = null, requestId = crypto.randomUUID(), timer, searchController, contactVersion = 0, disposed = false, busy = false;
  function status(message, error = false) { $('#roiShareStatus').textContent = message; $('#roiShareStatus').classList.toggle('error',error); }
  function reset() {
   selected = null; generated = null; requestId = crypto.randomUUID(); contactVersion++;
   $('#roiDealField').hidden = false; $('#roiSelectedDeal').hidden = true; $('#roiDraftFields').hidden = true; $('#roiReadyFields').hidden = true;
   $('#roiGenerate').hidden = false; $('#roiGenerate').disabled = true; $('#roiCopyLink').hidden = true; $('#roiOpenEmail').hidden = true; $('#roiPreviewLink').hidden = true;
   $('#roiEmailSubject').required = false; $('#roiEmailBody').required = false; $('#roiEmailTo').required = false;
   $('#roiEmailTo').value = ''; $('#roiContactField').hidden = true; status('');
  }
  async function select(deal) {
   reset(); clearTimeout(timer); searchController?.abort();
   selected = deal; $('#roiDealField').hidden = true; $('#roiSelectedDeal').hidden = false;
   $('#roiSelectedDeal').innerHTML = `<div><strong>${esc(deal.name)}</strong><small class="roi-share-hint">Deal ${esc(deal.id)}</small></div><button type="button" id="roiChangeDeal">Cambiar</button>`;
   $('#roiChangeDeal').onclick = () => { reset(); $('#roiDealSearch').focus(); };
   $('#roiDraftFields').hidden = false; $('#roiEmailTo').required = true; $('#roiGenerate').disabled = false;
   const version = ++contactVersion; status('Cargando contactos del deal…');
   try {
    const result = await api('contacts?dealId=' + encodeURIComponent(deal.id));
    if (disposed || version !== contactVersion) return;
    $('#roiContact').innerHTML = '<option value="">Escribir otro destinatario</option>' + result.contacts.map(c => `<option value="${esc(c.email)}" data-name="${esc(c.name)}">${esc(c.name || c.email)}${c.name ? ' · ' + esc(c.email) : ''}</option>`).join('');
    $('#roiContactField').hidden = !result.contacts.length;
    if (result.contacts.length === 1 && !$('#roiEmailTo').value.trim()) { $('#roiContact').selectedIndex = 1; $('#roiEmailTo').value = result.contacts[0].email; }
    status(result.contacts.length ? '' : 'Este deal no tiene contactos con correo. Escribe el destinatario.');
   } catch (error) { if (!disposed && version === contactVersion) status(error.message, true); }
  }
  $('#roiDealSearch').oninput = () => {
   clearTimeout(timer); searchController?.abort(); const query = $('#roiDealSearch').value.trim(); $('#roiDealResults').replaceChildren();
   if (query.length < 2) return;
   const controller = new AbortController(); searchController = controller;
   timer = setTimeout(async () => {
    $('#roiDealResults').textContent = 'Buscando deals…';
    try {
     const result = await api('deals?q=' + encodeURIComponent(query), undefined, controller.signal);
     if (disposed || controller.signal.aborted) return;
     $('#roiDealResults').innerHTML = result.deals.length ? '' : '<small class="roi-share-hint">No encontramos deals con esa búsqueda.</small>';
     result.deals.forEach(deal => { const button = document.createElement('button'); button.type = 'button'; button.className = 'roi-share-result'; button.innerHTML = `${esc(deal.name)}<small>Deal ${esc(deal.id)}</small>`; button.onclick = () => select(deal); $('#roiDealResults').appendChild(button); });
    } catch (error) { if (!disposed && !controller.signal.aborted) { $('#roiDealResults').textContent = error.message; } }
   }, 300);
  };
  $('#roiContact').onchange = () => { $('#roiEmailTo').value = $('#roiContact').value; };
  function updateEmail() {
   if (!generated) return;
   const url = new URL('https://mail.google.com/mail/'); url.searchParams.set('view','cm'); url.searchParams.set('fs','1');
   url.searchParams.set('to',$('#roiEmailTo').value.trim()); url.searchParams.set('su',$('#roiEmailSubject').value.trim());
   let message = $('#roiEmailBody').value.trim(); if (!message.includes(generated.url)) message += '\n\n' + generated.url;
   url.searchParams.set('body',message); $('#roiOpenEmail').href = url.href;
  }
  $('#roiShareForm').oninput = updateEmail;
  $('#roiOpenEmail').onclick = e => { if (!$('#roiShareForm').reportValidity()) e.preventDefault(); else { updateEmail(); status('Revisa el borrador en Gmail y envíalo cuando esté listo.'); } };
  $('#roiShareForm').onsubmit = async e => {
   e.preventDefault(); if (!selected || busy || generated) return;
   if (!$('#roiShareForm').reportValidity()) return;
   const choice = selected, version = contactVersion; busy = true; $('#roiGenerate').disabled = true; $('#roiChangeDeal').disabled = true; status('Preparando enlace…');
   try {
    const result = await api('create', { requestId, dealId: choice.id, context });
    if (disposed || version !== contactVersion) return;
    generated = result; $('#roiGeneratedLink').value = result.url; $('#roiReadyFields').hidden = false;
    const preview = new URL(result.url); preview.searchParams.set('preview','1'); $('#roiPreviewLink').href = preview.href; $('#roiPreviewLink').hidden = false;
    $('#roiEmailSubject').required = true; $('#roiEmailBody').required = true;
    $('#roiEmailSubject').value = 'Calculadora ROI · Adereso';
    $('#roiEmailBody').value = `Hola,\n\nTe comparto la calculadora ROI de Adereso con la inversión y el volumen que revisamos. Puedes ajustar los supuestos y explorar el retorno estimado para tu operación.\n\n${result.url}\n\nLo revisamos juntos y resolvemos cualquier duda.\n\nSaludos`;
    $('#roiGenerate').hidden = true; $('#roiCopyLink').hidden = false; $('#roiOpenEmail').hidden = false; updateEmail();
    const local = ['localhost','127.0.0.1'].includes(location.hostname);
    status(local ? 'Vista local · el enlace será externo al publicar.' : 'Enlace listo. El correo queda pendiente de revisión y envío.');
   } catch (error) { if (!disposed) status(error.message, true); }
   finally { busy = false; if (!disposed) { $('#roiGenerate').disabled = false; $('#roiChangeDeal').disabled = false; } }
  };
  $('#roiCopyLink').onclick = async () => { if (!generated) return; try { await navigator.clipboard.writeText(generated.url); status('Enlace copiado.'); } catch { $('#roiGeneratedLink').select(); status('Seleccionamos el enlace para que puedas copiarlo.'); } };
  const fmt = value => Number(value).toLocaleString('es-CL',{maximumFractionDigits:2});
  const date = value => value ? new Date(value).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'}) : 'Sin actividad registrada';
  const names = { ventaautonoma:'Venta autónoma',carrito:'Recuperación de carrito',calificacion:'Calificación de leads',cassper:'Recuperación de venta perdida',outbound:'Campañas outbound',atencion:'Automatización de consultas',sla:'Mejora de SLA',retencion:'Retención',escalamiento:'Ahorro de escalamiento',cobranza:'Recuperación de cobranza' };
  const fieldNames = { convs:'Conversaciones de venta',conv:'Conversión (%)',ticket:'Ticket medio (USD)',carritos:'Carritos abandonados',recup:'Recuperación (%)',leads:'Leads',calif:'Calificados (%)',cierre:'Cierre (%)',atribucion:'Atribuible al bot (%)',perdidas:'Ventas perdidas',mensajes:'Mensajes enviados',consultas:'Consultas por mes',auto:'Automatizado (%)',minutos:'Minutos por consulta',ejecutivos:'Ejecutivos',costoEmpresa:'Costo empresa (USD)',interacciones:'Interacciones',fuga:'Fuga evitada (%)',valor:'Valor por interacción (USD)',riesgo:'Clientes en riesgo',retenidos:'Retenidos (%)',ltv:'Valor de vida (USD)',agentes:'Contrataciones evitadas',sueldo:'Sueldo mensual (USD)',mora:'Monto en mora (USD)' };
  async function history() {
   const mount = $('#roiShareHistory'); $('#roiRefreshActivity').disabled = true; mount.innerHTML = '<p class="roi-share-empty">Cargando actividad…</p>';
   try {
    const result = await api('shares'); if (disposed) return;
    mount.innerHTML = result.shares.length ? result.shares.map(s => {
     const scenario = s.lastScenario, expired = Date.parse(s.expiresAt) <= Date.now();
     const detail = scenario ? `<details><summary>Último escenario</summary><p>Inversión: ${fmt(scenario.context.mensualidad)} USD / mes · ${fmt(scenario.context.volumen)} conversaciones</p><p>Valor estimado: ${fmt(scenario.gain)} USD · Costo estimado: ${fmt(scenario.cost)} USD${scenario.cost > 0 ? ' · ROI: '+fmt((scenario.gain-scenario.cost)/scenario.cost*100)+'%' : ''}</p>${scenario.context.plantilla == null && scenario.cases.some(c => ['carrito','outbound'].includes(c.id)) ? '<p>Tarifa de WhatsApp por confirmar; el costo estimado no la incluye.</p>' : ''}${scenario.cases.map(c => `<strong>${esc(names[c.id] || c.id)}</strong><dl>${Object.entries(c.values).map(([k,v]) => `<dt>${esc(fieldNames[k] || k)}</dt><dd>${fmt(v)}</dd>`).join('')}</dl>`).join('') || '<p>Sin casos activos.</p>'}</details>` : '';
     return `<article><h3>${esc(s.dealName)}</h3><small class="roi-share-hint">Deal ${esc(s.dealId)} · Generado ${esc(date(s.createdAt))}${expired ? ' · Vencido' : ''}</small><p>${fmt(s.sessions)} ${s.sessions === 1 ? 'visita' : 'visitas'} · ${fmt(s.scenarios)} ${s.scenarios === 1 ? 'escenario' : 'escenarios'}</p><p>Última actividad: ${esc(date(s.lastAt))}</p>${detail}</article>`;
    }).join('') : '<p class="roi-share-empty">Todavía no generaste enlaces para tus deals.</p>';
   } catch (error) { if (!disposed) mount.textContent = error.message; }
   finally { if (!disposed) $('#roiRefreshActivity').disabled = false; }
  }
  $('#roiRefreshActivity').onclick = history;
  dialog.querySelectorAll('[data-view]').forEach(button => button.onclick = () => {
   dialog.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed',String(b === button)));
   dialog.querySelectorAll('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== button.dataset.view);
   if (button.dataset.view === 'history') history();
  });
  $('.roi-share-close').onclick = () => dialog.close();
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => { disposed = true; clearTimeout(timer); searchController?.abort(); active = null; dialog.remove(); lastFocus?.focus(); }, { once: true });
  reset(); document.body.appendChild(dialog); active = dialog; dialog.showModal(); $('#roiDealSearch').focus();
 };
})();
