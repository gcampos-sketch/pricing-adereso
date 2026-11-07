import {test,expect} from 'bun:test';
import {attestation,corroboratedOwner,copyNotices,emptyRepository,reconcile,taskState,visibleNotices,writeClipboard,type RiskRecord} from '../src/lib/sales-notifications';
const now=Date.parse('2026-10-29T12:00:00Z');
const record=(id='1',state='alertas_activas',review='2026-10-29T11:00:00Z'):RiskRecord=>{
 const risks=state==='alertas_activas'?['intentos_sin_respuesta','reuniones_sin_avance']:[];
 return {id,ownerId:'331766554',owner:'Gonza',name:`Deal ${id}`,stage:'5. Negociación',segment:'upsell',inScope:true,state,risks,reviewedAt:review,score:76,probability:70,money:[{value:0,currency:'USD',unit:'MRR'}],
 evidence:JSON.stringify({version:'adobo-alert-evidence/v1',portalId:'23480943',dealId:id,ownerId:'331766554',cycleId:'cycle1',evidenceVersion:review,coverage:'complete',state,risks,observedAt:review,
 validity:{version:'producer-validity/v1',maxAgeMs:86400000},pauseAgreed:state==='pausa_acordada',sources:[{id:'source1',url:'https://app.hubspot.com/evidence',at:review,summary:'Evidencia del productor'}]})};
};
const scope={owner:'team',role:'all' as const,type:'all',stages:[]};
const sync=(p=emptyRepository('a','331766554'),records=[record()],complete=true,at='2026-10-29T12:00:00Z')=>reconcile(p,{account:'a',ownerId:'331766554',records,complete,error:complete?null:'parcial',at},now);
test('alta, cambio, resolución y reapertura sin duplicar señales',()=>{
 let p=sync();expect(p.active.length).toBe(1);p=sync(p);expect(p.active.length).toBe(1);expect(p.active[0]?.status).toBe('continúa');
 p=sync(p,[record('1','alertas_activas','2026-10-29T11:10:00Z')]);expect(p.history.length).toBe(1);
 p=sync(p,[record('1','sin_riesgo_verificado','2026-10-29T11:20:00Z')]);expect(p.active.length).toBe(0);expect(p.history.at(-1)?.reason).toBe('Resuelta con evidencia');
 p=sync(p,[record('1','alertas_activas','2026-10-29T11:30:00Z')]);expect(p.active.length).toBe(1);expect(p.active[0]?.cycle).toBeGreaterThan(1);
});
test('fallos, ausencia y parcialidad conservan alertas',()=>{const p=sync();expect(sync(p,[],false).active.length).toBe(1);expect(sync(p,[],true).active.length).toBe(1);expect(sync(p,[record('1','sin_riesgo_verificado','2026-10-29T11:20:00Z')],false).active.length).toBe(1);});
test('estado vacío, cobertura insuficiente y evidencia libre no resuelven',()=>{const p=sync();for(const state of ['', 'cobertura_insuficiente','sin_riesgo_verificado']){const r=record('1',state,'2026-10-29T11:20:00Z');r.evidence='Nota sin contrato';expect(sync(p,[r]).active.length).toBe(1);}});
test('pausa válida retira; pausa no corroborada conserva',()=>{const p=sync(),r=record('1','pausa_acordada','2026-10-29T11:20:00Z');expect(sync(p,[r]).active.length).toBe(0);r.evidence='pausa';expect(sync(p,[r]).active.length).toBe(1);});
test('sin TTL, evidencia futura o otro deal no se verifican',()=>{const r=record();const e=JSON.parse(r.evidence);delete e.validity;r.evidence=JSON.stringify(e);expect(attestation(r,now)).toBeNull();const f=record('1','alertas_activas','2099-01-01');expect(attestation(f,now)).toBeNull();const other=record('2');other.evidence=record().evidence;expect(attestation(other,now)).toBeNull();});
test('aislamiento por cuenta, owner y acceso revocado tras handoff',()=>{const p=sync();expect(visibleNotices(p,{...scope,owner:'82596016'})).toEqual([]);const r=record();r.ownerId='82596016';const q=sync(p,[r]);expect(q.active.length).toBe(0);expect(q.history.length).toBe(0);expect(reconcile(p,{account:'b',ownerId:'82596016',records:[],complete:false,error:null,at:'2026-10-29T12:00:00Z'},now).active).toEqual([]);});
test('correspondencia exige email exacto y único no nombre',()=>{expect(corroboratedOwner('a@adere.so',[{id:'331766554',email:'a@adere.so'}])).toBe('331766554');expect(corroboratedOwner('a@adere.so',[{id:'331766554',email:'a@adere.so'},{id:'82596016',email:'a@adere.so'}])).toBeNull();});
test('copia todas las páginas, filtros, cero y monedas sin suma',()=>{const p=sync(undefined,Array.from({length:19},(_,i)=>record(String(i))));const c=copyNotices(p,scope,now);expect(c.count).toBe(19);expect(c.text).toContain('Deal 18');expect(c.text).toContain('0 USD MRR');expect(c.text).toContain('NO autoriza');expect(c.complete).toBe(true);expect(copyNotices(p,{...scope,type:'inbound'},now).count).toBe(0);expect(copyNotices({...p,complete:false},scope,now).complete).toBe(false);});
test('clipboard denegado o ausente permite alternativa',async()=>{expect(await writeClipboard('todo')).toBe(false);expect(await writeClipboard('todo',{writeText:async()=>{throw new Error('denied');}})).toBe(false);let got='';expect(await writeClipboard('todo',{writeText:async s=>{got=s;}})).toBe(true);expect(got).toBe('todo');});
test('día despejado solo con lectura completa y corroborada',()=>{const p=sync(undefined,[],true);expect(taskState(p,scope,now)).toMatchObject({state:'clear',note:null,uncertain:0});});
test('lectura en curso, sin fuente o vencida nunca afirma día despejado',()=>{
 expect(taskState(emptyRepository('a','331766554'),scope,now,true).state).toBe('syncing');
 expect(taskState(emptyRepository('a','331766554'),scope,now,false).state).toBe('unknown');
 const partial={...sync(undefined,[],true),complete:false,error:null};expect(taskState(partial,scope,now).state).toBe('unknown');
 const stale=sync(undefined,[record('1','alertas_activas','2026-10-27T11:00:00Z')],true);expect(taskState(stale,scope,now).state).toBe('unknown');
 expect(taskState({...sync(undefined,[],true),complete:false,records:[record('1','cobertura_insuficiente','2026-10-29T11:00:00Z')]},scope,now).state).toBe('unknown');});
test('fallo de sincronización se informa como error, no como ausencia de alertas',()=>{expect(taskState(sync(undefined,[],false),scope,now)).toMatchObject({state:'error'});expect(taskState({...sync(undefined,[],true),error:'caído'},scope,now)).toMatchObject({state:'error'});});test('deals abiertos sin riesgo verificado o en pausa dan día despejado',()=>{const p=sync(undefined,[record('1','sin_riesgo_verificado'),record('2','pausa_acordada')],true);expect(taskState(p,scope,now).state).toBe('clear');const r=record('3','sin_riesgo_verificado');r.evidence='sin contrato';expect(taskState(sync(undefined,[r],true),scope,now).state).toBe('unknown');});

test('SALES-89 cross respects 76/75 and 70/71 boundaries, nulls and inactive states', async()=>{
  const {riskScoreCross}=await import('../src/lib/sales-notifications');
  const row={inScope:true,state:'alertas_activas',risks:['sin_contacto_comercial'],score:76,probability:null} as import('../src/lib/sales-notifications').RiskRecord;
  expect(riskScoreCross(row)).toBe(true);expect(riskScoreCross({...row,score:75})).toBe(false);
  expect(riskScoreCross({...row,score:null,probability:70})).toBe(false);expect(riskScoreCross({...row,score:null,probability:71})).toBe(true);
  expect(riskScoreCross({...row,score:0,probability:0})).toBe(false);expect(riskScoreCross({...row,state:'pausa_acordada'})).toBe(false);
});
