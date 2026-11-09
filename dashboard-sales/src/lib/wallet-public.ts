/** Publish the wallet's formulas and form only. Never hide the rest of Pricing with CSS. */
function between(source: string, start: string, end: string) {
 const a = source.indexOf(start), b = source.indexOf(end,a+start.length);
 if(a<0||b<0||source.indexOf(start,a+start.length)!==-1)throw new Error('Wallet source unavailable');
 return source.slice(a,b);
}
export function walletSources(hub: string) {
 const a=hub.indexOf('<style>'),b=hub.indexOf('</style>',a);
 if(a<0||b<0)throw new Error('Wallet styles unavailable');
 return {
  styles:hub.slice(a+7,b),
  icons:between(hub,'const ICONS={','\nconst BAG='),
  rates:between(hub,'const WA_PRICES={','/* ===== CASSPER'),
  formulas:between(hub,'function waService()','/* ---- module grid ---- */'),
  calculator:between(hub,'function walletManual()','/* tarjetas del resultado').replace(/<button class="linkbtn" data-goto="s2">bolsa de conversaciones contratada<\/button>/g,'<span>bolsa de conversaciones contratada</span>'),
  events:between(hub,"document.getElementById('waArea').addEventListener('click'","document.getElementById('mSum').addEventListener"),
 };
}
export function walletDocument(hub: string, standalone: string) {
 const s=walletSources(hub);
 return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="/billetera-meta/"><title>Calculadora de billetera Meta · Adereso</title><style>'+s.styles+'</style><link rel="stylesheet" href="brand-system.css"><style>body{padding:0}.wallet-public{max-width:1120px;margin:auto;padding:32px 24px 60px}.wallet-public [hidden]{display:none!important}.wallet-public h1{font-size:30px;margin:18px 0 12px}.wallet-brand{width:170px;height:auto}.wallet-note{font-size:13px;line-height:1.6;color:#a1a1aa;margin:12px 0 20px}.wallet-public .reveal{opacity:1;transform:none}.wallet-public-conversations{display:grid;gap:6px;font-size:13px;margin:22px 0;max-width:300px}.wallet-public-conversations input{border:1px solid #555;border-radius:10px;background:#222;color:#fff;font:inherit;padding:10px}.wallet-public [data-wallet-share]{display:none}.wallet-help{margin:auto;max-width:520px;width:calc(100% - 32px);padding:26px;background:#1b1d22;color:#eee;border:1px solid #555;border-radius:18px}.wallet-help::backdrop{background:#0009}.wallet-help button{border:1px solid #777;border-radius:20px;padding:6px 18px;margin-top:18px}.wallet-public input:focus-visible{outline:2px solid #ffd540;outline-offset:2px}@media(max-width:640px){.wallet-public{padding:24px 16px 50px}.wallet-public h1{font-size:25px}}</style></head><body><main class="wallet-public"><img class="wallet-brand" src="logoadereso.webp" alt="Adereso"><h1>Estima tu billetera Meta</h1><p class="wallet-note">Ajusta mensajes, plantillas y minutos para estimar tu recarga. Los valores están en USD e incluyen el fee de Adereso. Esta simulación no realiza recargas ni pagos.</p><label class="wallet-public-conversations" id="walletVolumeField">Conversaciones totales al mes<input id="walletVolume" type="number" min="0" step="1"></label><div id="waArea"></div><p class="wallet-note" id="walletActivityNotice">El uso de este enlace y los cambios de la simulación se registran para dar seguimiento a tu propuesta. No se solicitan datos personales.</p></main><dialog class="wallet-help" id="walletHelp" aria-labelledby="walletHelpTitle"><h2 id="walletHelpTitle">Fee de la billetera</h2><p>La recarga incluye el consumo de Meta y el fee de Adereso. El estándar es 12% para Spot y 10% para Recurrente; puede variar según tu acuerdo. El saldo es para consumos de Meta, no para la mensualidad del servicio.</p><button type="button" onclick="document.getElementById(\'walletHelp\').close()">Cerrar</button></dialog><script>'+standalone+'\n'+s.icons+'\n'+s.rates+'\n'+s.formulas+'\n'+s.calculator+'\n'+s.events+'\nstartStandaloneWallet();</script></body></html>';
}
export function createWalletPublicGateway(read: (path:string)=>Promise<Uint8Array>) {
 const assets: Record<string,string>={'brand-system.css':'text/css; charset=utf-8','logoadereso.webp':'image/webp'};
 return async(request:Request):Promise<Response|null>=>{
  const url=new URL(request.url);if(url.pathname!=='/billetera-meta'&&!url.pathname.startsWith('/billetera-meta/'))return null;
  const fail=(status:number)=>new Response(null,{status,headers:{'Cache-Control':'no-store'}});
  if(!['GET','HEAD'].includes(request.method))return fail(405);
  if(url.pathname==='/billetera-meta')return new Response(null,{status:308,headers:{Location:'/billetera-meta/'+url.search,'Cache-Control':'no-store'}});
  const path=url.pathname.slice('/billetera-meta/'.length);if(path&&!Object.hasOwn(assets,path))return fail(404);
  try {
   const bytes=path?await read(path):new TextEncoder().encode(walletDocument(new TextDecoder().decode(await read('index.html')),new TextDecoder().decode(await read('wallet-standalone.js'))));
   return new Response(request.method==='HEAD'?null:new Uint8Array(bytes),{headers:{'Content-Type':path?assets[path]!:'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'no-referrer','Content-Security-Policy':"frame-ancestors 'self'; base-uri 'self'; object-src 'none'"}});
  } catch { return fail(503); }
 };
}
