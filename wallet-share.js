/* Private Hub dialog. Public calculators never load deal search or CRM data. */
(() => {
 'use strict';
 const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const errors = {
  authentication_required: 'Tu sesión venció. Vuelve a ingresar al Hub.',
  crm_not_configured: 'La conexión con HubSpot está pendiente de configuración en este entorno.',
  wallet_not_configured: 'La función está pendiente de habilitación.',
  wallet_storage_unavailable: 'No pudimos confirmar el guardado del enlace. Puedes reintentar con la misma solicitud.',
  invalid_deal: 'Selecciona un deal del pipeline Comercial Adereso.',
  contacts_incomplete: 'No pudimos cargar todos los contactos. Puedes escribir el destinatario.',
  rate_limit: 'Se alcanzó el límite temporal. Intenta más tarde.',
  request_conflict: 'La selección cambió. Cierra y vuelve a abrir para generar otro enlace.',
 };
 async function api(route, data, signal) {
  const response = await fetch('/api/hub/wallet/' + route, { method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', signal, headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(errors[result.error] || 'No pudimos completar la acción. Intenta nuevamente.');
  return result;
 }
 function styles() {
  if (document.getElementById('walletShareStyles')) return;
  const style = document.createElement('style'); style.id = 'walletShareStyles';
  style.textContent = `
  .wallet-share-dialog{margin:auto;width:min(680px,calc(100vw - 32px));max-height:calc(100dvh - 40px);padding:0;border:1px solid #34363f;border-radius:24px;background:#14161c;color:#f3f3f5;box-shadow:0 32px 100px #0009;font:14px/1.5 'Work Sans',sans-serif;overflow:auto;color-scheme:dark}
  .wallet-share-dialog::backdrop{background:#07090dbb;backdrop-filter:blur(7px)}
  .wallet-share-dialog *{box-sizing:border-box}.wallet-share-dialog [hidden]{display:none!important}
  .wallet-share-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:28px 30px 18px}.wallet-share-head h2{font:500 26px/1.2 Outfit,sans-serif;letter-spacing:-.7px;margin:0 0 8px}.wallet-share-head p{margin:0;color:#a6a9b5}.wallet-share-close{background:transparent;border:0;color:#a6a9b5;font-size:26px;cursor:pointer;line-height:1}
  .wallet-share-tabs{display:flex;gap:20px;padding:0 30px;border-bottom:1px solid #2e3139}.wallet-share-tabs button{border:0;border-bottom:2px solid transparent;padding:12px 0;background:none;color:#999eac;font:inherit;cursor:pointer}.wallet-share-tabs button[aria-pressed=true]{border-color:#ffd540;color:#ffd540}
  .wallet-share-body{padding:24px 30px 28px}.wallet-share-dialog label,.wallet-share-label{display:block;font-weight:600;margin:0 0 8px}.wallet-share-dialog input,.wallet-share-dialog textarea,.wallet-share-dialog select{width:100%;border:1px solid #3b3e48;border-radius:10px;background:#0d0f14;color:#f3f3f5;padding:11px 13px;font:inherit}.wallet-share-dialog input:focus,.wallet-share-dialog textarea:focus,.wallet-share-dialog select:focus{outline:2px solid #ffd540;outline-offset:2px}.wallet-share-dialog textarea{resize:vertical;min-height:170px;line-height:1.7}.wallet-share-field{margin-bottom:18px}.wallet-share-hint{display:block;color:#949aa8;font-size:12px;margin:7px 0 0}.wallet-share-results{display:grid;gap:6px;margin:10px 0 0;max-height:220px;overflow:auto}.wallet-share-result{display:block;text-align:left;border:1px solid #343843;border-radius:10px;background:#20232c;color:#f3f3f5;padding:10px 12px;cursor:pointer;font:inherit}.wallet-share-result small{display:block;color:#949aa8}.wallet-share-selected{padding:12px 14px;background:#25271f;border:1px solid #6e642e;border-radius:12px;margin:10px 0 18px;display:flex;align-items:center;gap:12px;justify-content:space-between}.wallet-share-selected button{color:#ffd540;background:none;border:0;font:inherit;cursor:pointer}.wallet-share-actions{display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:10px;margin-top:22px}.wallet-share-actions button,.wallet-share-actions a{display:inline-flex;align-items:center;justify-content:center;border:1px solid #44464f;border-radius:24px;background:transparent;color:#eee;padding:11px 19px;text-decoration:none;font:600 13px/1.3 'Work Sans',sans-serif;cursor:pointer}.wallet-share-actions .primary{background:#ffd540;color:#151515;border-color:#ffd540}.wallet-share-actions :disabled{opacity:.4;cursor:default}.wallet-share-status{margin:16px 0 0;min-height:21px;color:#bfc3ce}.wallet-share-status.error{color:#ffaaa0}.wallet-share-context{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:22px}.wallet-share-context span{background:#242731;border-radius:20px;padding:6px 11px;color:#bec3d0;font-size:12px}.wallet-share-history article{border:1px solid #343843;border-radius:14px;padding:16px;margin-bottom:12px}.wallet-share-history h3{font-size:14px;margin:0 0 5px}.wallet-share-history p{color:#b0b6c3;font-size:13px;margin:7px 0}.wallet-share-history details{font-size:12px;color:#bcc2cf;margin-top:12px}.wallet-share-history dl{display:grid;grid-template-columns:1fr auto;gap:4px 12px;margin:8px 0 14px}.wallet-share-history dd{margin:0}.wallet-share-empty{padding:28px 0;color:#9ea5b4;text-align:center}.wallet-share-dialog summary{cursor:pointer}.wallet-share-dialog :focus-visible{outline:2px solid #ffd540;outline-offset:3px}
  @media(max-width:560px){.wallet-share-head{padding:22px 20px 16px}.wallet-share-head h2{font-size:23px}.wallet-share-body{padding:20px}.wallet-share-tabs{padding:0 20px}.wallet-share-actions>*{flex:1}.wallet-share-dialog{max-height:calc(100dvh - 24px)}}`;
  document.head.appendChild(style);
 }
 let active;
 window.openWalletShare = function(context) {
  if (active) { active.focus(); return; }
  styles();
  const dialog = document.createElement('dialog'); dialog.className = 'wallet-share-dialog'; dialog.setAttribute('aria-labelledby','walletShareTitle');
  const lastFocus = document.activeElement;
  dialog.innerHTML = `<div class="wallet-share-head"><div><h2 id="walletShareTitle">Compartir billetera Meta</h2><p>Vincula el deal y prepara el correo.</p></div><button class="wallet-share-close" type="button" aria-label="Cerrar">×</button></div>
  <div class="wallet-share-tabs" role="group" aria-label="Vista"><button type="button" data-view="prepare" aria-pressed="true">Preparar correo</button><button type="button" data-view="history" aria-pressed="false">Enlaces compartidos</button></div>
  <div class="wallet-share-body"><section data-panel="prepare"><div class="wallet-share-context"><span>${esc(context.country)} · ${context.wallet==='recurrente'?'Recurrente':'Spot'}</span><span>Fee ${esc(context.existing&&context.fee!=null?context.fee:context.wallet==='recurrente'?10:12)}%</span><span>${esc(context.conversations.toLocaleString('es-CL'))} conversaciones / mes</span></div>
  <form id="walletShareForm"><div class="wallet-share-field" id="walletDealField"><label for="walletDealSearch">Vincular deal <span aria-hidden="true">*</span></label><input id="walletDealSearch" type="search" autocomplete="off" placeholder="Busca por nombre o ID del deal" aria-required="true" aria-describedby="walletDealHint"><small class="wallet-share-hint" id="walletDealHint">Obligatorio · Pipeline Comercial Adereso</small><div class="wallet-share-results" id="walletDealResults" aria-live="polite"></div></div>
  <div class="wallet-share-selected" id="walletSelectedDeal" hidden></div><div id="walletDraftFields" hidden>
  <div class="wallet-share-field" id="walletContactField" hidden><label for="walletContact">Contacto del deal</label><select id="walletContact"></select></div>
  <div class="wallet-share-field"><label for="walletEmailTo">Para</label><input id="walletEmailTo" type="email" autocomplete="email" placeholder="nombre@empresa.com" required maxlength="254"></div>
  <div id="walletReadyFields" hidden><div class="wallet-share-field"><label for="walletGeneratedLink">Enlace de la calculadora</label><input id="walletGeneratedLink" type="url" readonly></div>
  <div class="wallet-share-field"><label for="walletEmailSubject">Asunto</label><input id="walletEmailSubject" maxlength="200" required></div>
  <div class="wallet-share-field"><label for="walletEmailBody">Mensaje</label><textarea id="walletEmailBody" rows="8" maxlength="6000" required></textarea><small class="wallet-share-hint">Revisa el borrador y envíalo desde tu correo.</small></div></div></div>
  <div class="wallet-share-actions"><button id="walletGenerate" type="submit" class="primary" disabled>Generar enlace</button><a id="walletPreviewLink" target="_blank" rel="noopener noreferrer" hidden>Vista previa ↗</a><button id="walletCopyLink" type="button" hidden>Copiar enlace</button><a id="walletOpenEmail" class="primary" target="_blank" rel="noopener noreferrer" hidden>Abrir borrador en Gmail ↗</a></div></form>
  <p id="walletShareStatus" class="wallet-share-status" role="status" aria-live="polite"></p></section>
  <section data-panel="history" hidden><div class="wallet-share-history" id="walletShareHistory"></div><small class="wallet-share-hint">Últimos 50 enlaces que generaste. Las visitas corresponden a sesiones de uso del enlace; no identifican a la persona ni confirman el envío del correo.</small><div class="wallet-share-actions"><button id="walletRefreshActivity" type="button">Actualizar actividad</button></div></section></div>`;
  const $ = selector => dialog.querySelector(selector);
  let selected = null, generated = null, requestId = crypto.randomUUID(), timer, searchController, contactVersion = 0, disposed = false, busy = false;
  function status(message, error = false) { $('#walletShareStatus').textContent = message; $('#walletShareStatus').classList.toggle('error',error); }
  function reset() {
   selected = null; generated = null; requestId = crypto.randomUUID(); contactVersion++;
   $('#walletDealField').hidden = false; $('#walletSelectedDeal').hidden = true; $('#walletDraftFields').hidden = true; $('#walletReadyFields').hidden = true;
   $('#walletGenerate').hidden = false; $('#walletGenerate').disabled = true; $('#walletCopyLink').hidden = true; $('#walletOpenEmail').hidden = true; $('#walletPreviewLink').hidden = true;
   $('#walletEmailSubject').required = false; $('#walletEmailBody').required = false; $('#walletEmailTo').required = false;
   $('#walletEmailTo').value = ''; $('#walletContactField').hidden = true; status('');
  }
  async function select(deal) {
   reset(); clearTimeout(timer); searchController?.abort();
   selected = deal; $('#walletDealField').hidden = true; $('#walletSelectedDeal').hidden = false;
   $('#walletSelectedDeal').innerHTML = `<div><strong>${esc(deal.name)}</strong><small class="wallet-share-hint">Deal ${esc(deal.id)}</small></div><button type="button" id="walletChangeDeal">Cambiar</button>`;
   $('#walletChangeDeal').onclick = () => { reset(); $('#walletDealSearch').focus(); };
   $('#walletDraftFields').hidden = false; $('#walletEmailTo').required = true; $('#walletGenerate').disabled = false;
   const version = ++contactVersion; status('Cargando contactos del deal…');
   try {
    const result = await api('contacts?dealId=' + encodeURIComponent(deal.id));
    if (disposed || version !== contactVersion) return;
    $('#walletContact').innerHTML = '<option value="">Escribir otro destinatario</option>' + result.contacts.map(c => `<option value="${esc(c.email)}" data-name="${esc(c.name)}">${esc(c.name || c.email)}${c.name ? ' · ' + esc(c.email) : ''}</option>`).join('');
    $('#walletContactField').hidden = !result.contacts.length;
    if (result.contacts.length === 1 && !$('#walletEmailTo').value.trim()) { $('#walletContact').selectedIndex = 1; $('#walletEmailTo').value = result.contacts[0].email; }
    status(result.contacts.length ? '' : 'Este deal no tiene contactos con correo. Escribe el destinatario.');
   } catch (error) { if (!disposed && version === contactVersion) status(error.message, true); }
  }
  $('#walletDealSearch').oninput = () => {
   clearTimeout(timer); searchController?.abort(); const query = $('#walletDealSearch').value.trim(); $('#walletDealResults').replaceChildren();
   if (query.length < 2) return;
   const controller = new AbortController(); searchController = controller;
   timer = setTimeout(async () => {
    $('#walletDealResults').textContent = 'Buscando deals…';
    try {
     const result = await api('deals?q=' + encodeURIComponent(query), undefined, controller.signal);
     if (disposed || controller.signal.aborted) return;
     $('#walletDealResults').innerHTML = result.deals.length ? '' : '<small class="wallet-share-hint">No encontramos deals con esa búsqueda.</small>';
     result.deals.forEach(deal => { const button = document.createElement('button'); button.type = 'button'; button.className = 'wallet-share-result'; button.innerHTML = `${esc(deal.name)}<small>Deal ${esc(deal.id)}</small>`; button.onclick = () => select(deal); $('#walletDealResults').appendChild(button); });
    } catch (error) { if (!disposed && !controller.signal.aborted) { $('#walletDealResults').textContent = error.message; } }
   }, 300);
  };
  $('#walletContact').onchange = () => { $('#walletEmailTo').value = $('#walletContact').value; };
  function updateEmail() {
   if (!generated) return;
   const url = new URL('https://mail.google.com/mail/'); url.searchParams.set('view','cm'); url.searchParams.set('fs','1');
   url.searchParams.set('to',$('#walletEmailTo').value.trim()); url.searchParams.set('su',$('#walletEmailSubject').value.trim());
   let message = $('#walletEmailBody').value.trim(); if (!message.includes(generated.url)) message += '\n\n' + generated.url;
   url.searchParams.set('body',message); $('#walletOpenEmail').href = url.href;
  }
  $('#walletShareForm').oninput = updateEmail;
  $('#walletOpenEmail').onclick = e => { if (!$('#walletShareForm').reportValidity()) e.preventDefault(); else { updateEmail(); status('Revisa el borrador en Gmail y envíalo cuando esté listo.'); } };
  $('#walletShareForm').onsubmit = async e => {
   e.preventDefault(); if (!selected || busy || generated) return;
   if (!$('#walletShareForm').reportValidity()) return;
   const choice = selected, version = contactVersion; busy = true; $('#walletGenerate').disabled = true; $('#walletChangeDeal').disabled = true; status('Preparando enlace…');
   try {
    const result = await api('create', { requestId, dealId: choice.id, context });
    if (disposed || version !== contactVersion) return;
    generated = result; $('#walletGeneratedLink').value = result.url; $('#walletReadyFields').hidden = false;
    const preview = new URL(result.url); preview.searchParams.set('preview','1'); $('#walletPreviewLink').href = preview.href; $('#walletPreviewLink').hidden = false;
    $('#walletEmailSubject').required = true; $('#walletEmailBody').required = true;
    $('#walletEmailSubject').value = 'Calculadora de billetera Meta · Adereso';
    $('#walletEmailBody').value = `Hola,\n\nTe comparto la calculadora de billetera Meta de Adereso. Puedes ajustar mensajes, plantillas y minutos para estimar la recarga de tu operación, con el fee incluido.\n\n${result.url}\n\nLo revisamos juntos y resolvemos cualquier duda.\n\nSaludos`;
    $('#walletGenerate').hidden = true; $('#walletCopyLink').hidden = false; $('#walletOpenEmail').hidden = false; updateEmail();
    const local = ['localhost','127.0.0.1'].includes(location.hostname);
    status(local ? 'Vista local · el enlace será externo al publicar.' : 'Enlace listo. El correo queda pendiente de revisión y envío.');
   } catch (error) { if (!disposed) status(error.message, true); }
   finally { busy = false; if (!disposed) { $('#walletGenerate').disabled = false; $('#walletChangeDeal').disabled = false; } }
  };
  $('#walletCopyLink').onclick = async () => { if (!generated) return; try { await navigator.clipboard.writeText(generated.url); status('Enlace copiado.'); } catch { $('#walletGeneratedLink').select(); status('Seleccionamos el enlace para que puedas copiarlo.'); } };
  const fmt = value => Number(value).toLocaleString('es-CL',{maximumFractionDigits:2});
  const date = value => value ? new Date(value).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'}) : 'Sin actividad registrada';
  const fieldNames = {service:'Mensajes Service',marketing:'Plantillas Marketing',utility:'Plantillas Utilidad',authentication:'Plantillas Autenticación',minutes:'Minutos de llamadas'};
  async function history() {
   const mount = $('#walletShareHistory'); $('#walletRefreshActivity').disabled = true; mount.innerHTML = '<p class="wallet-share-empty">Cargando actividad…</p>';
   try {
    const result = await api('shares'); if (disposed) return;
    mount.innerHTML = result.shares.length ? result.shares.map(s => {
     const scenario = s.lastScenario, expired = Date.parse(s.expiresAt) <= Date.now();
     const detail = scenario ? `<details><summary>Última simulación</summary><p>${esc(scenario.context.country)} · ${scenario.context.wallet==='recurrente'?'Recurrente':'Spot'} · ${fmt(scenario.context.conversations)} conversaciones / mes</p><dl>${Object.entries(scenario.context.quantities).map(([k,v])=>`<dt>${esc(fieldNames[k]||k)}</dt><dd>${fmt(v)}</dd>`).join('')}<dt>Consumo Meta</dt><dd>${scenario.meta==null?'Por confirmar':fmt(scenario.meta)+' USD'}</dd><dt>Fee Adereso</dt><dd>${scenario.fee==null?'Por confirmar':fmt(scenario.fee)+' USD'}</dd><dt>Recarga sugerida</dt><dd>${scenario.estimated==null?'Por confirmar':fmt(scenario.estimated)+' USD'}</dd><dt>Recarga elegida${scenario.context.manual?' (manual)':''}</dt><dd>${fmt(scenario.context.amount)} USD</dd></dl><p>Valores observados en la simulación; no corresponden a una recarga ni a un pago.</p></details>` : '';
     return `<article><h3>${esc(s.dealName)}</h3><small class="wallet-share-hint">Deal ${esc(s.dealId)} · Generado ${esc(date(s.createdAt))}${expired ? ' · Vencido' : ''}</small><p>${fmt(s.sessions)} ${s.sessions === 1 ? 'visita' : 'visitas'} · ${fmt(s.scenarios)} ${s.scenarios === 1 ? 'simulación' : 'simulaciones'}</p><p>Última actividad: ${esc(date(s.lastAt))}</p>${detail}</article>`;
    }).join('') : '<p class="wallet-share-empty">Todavía no generaste enlaces para tus deals.</p>';
   } catch (error) { if (!disposed) mount.textContent = error.message; }
   finally { if (!disposed) $('#walletRefreshActivity').disabled = false; }
  }
  $('#walletRefreshActivity').onclick = history;
  dialog.querySelectorAll('[data-view]').forEach(button => button.onclick = () => {
   dialog.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed',String(b === button)));
   dialog.querySelectorAll('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== button.dataset.view);
   if (button.dataset.view === 'history') history();
  });
  $('.wallet-share-close').onclick = () => dialog.close();
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => { disposed = true; clearTimeout(timer); searchController?.abort(); active = null; dialog.remove(); lastFocus?.focus(); }, { once: true });
  reset(); document.body.appendChild(dialog); active = dialog; dialog.showModal(); $('#walletDealSearch').focus();
 };
})();
