/** Extract only the ROI section and its shared formulas. Never serialize the Hub shell. */
function between(source:string,start:string,end:string){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 if(a<0||b<0||source.indexOf(start,a+start.length)!==-1)throw new Error('ROI source unavailable');
 return source.slice(a,b);
}
export function roiSources(hub:string){
 const cssStart=hub.indexOf('<style>'),cssEnd=hub.indexOf('</style>',cssStart);
 if(cssStart<0||cssEnd<0)throw new Error('ROI styles unavailable');
 const section=between(hub,'<section class="lvl" id="s6"','<!-- 7 · PROCESO COMERCIAL -->');
 const end=section.indexOf('</section>');if(end<0)throw new Error('ROI section incomplete');
 return {
  styles:hub.slice(cssStart+7,cssEnd),
  section:section.slice(0,end+10).replace(/<div class="continue reveal">[\s\S]*?<\/div>/,''),
  icons:between(hub,'const ICONS={','\nconst BAG='),
  calculator:between(hub,'/* ===== ROI · caso de negocio','\n/* nav */'),
 };
}
export function roiDocument(hub:string,context:string){
 const s=roiSources(hub);
 return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="/roi/"><title>Calculadora ROI · Adereso</title><style>'+s.styles+'</style><link rel="stylesheet" href="brand-system.css"><style>body{padding:0}.roi-public{max-width:1120px;margin:0 auto;padding:36px 24px 70px}.roi-public .lvl{margin:24px 0;padding:0;border:0}.roi-public .reveal{opacity:1;transform:none}.roi-context{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:32px 0;padding:24px;background:var(--bg2,#17181c);border:1px solid rgba(255,255,255,.1);border-radius:18px}.roi-context label{display:grid;gap:8px;font-size:13px}.roi-context input{width:100%;min-width:0;padding:11px;color:white;background:#0c0c0d;border:1px solid #444;border-radius:9px;font:inherit}.roi-note{font-size:12px;color:#a1a7b2;line-height:1.6}.roi-brand{width:170px;height:auto}@media(max-width:640px){.roi-context{grid-template-columns:1fr;padding:18px}.roi-public{padding:24px 16px 50px}}</style></head><body><main class="roi-public"><img class="roi-brand" src="logoadereso.webp" alt="Adereso"><p class="roi-note">Calculadora independiente · Ajusta tus supuestos y explora el retorno de tu inversión.</p><div class="roi-context"><label>Inversión mensual Adereso (USD)<input id="roiStandaloneCost" type="number" min="0" step="0.01" placeholder="Valor de tu cotización"></label><label>Conversaciones por mes<input id="roiStandaloneVolume" type="number" min="0" step="1"></label><label>Plantilla WhatsApp · USD por mensaje<input id="roiStandaloneRate" type="number" min="0" step="0.0001" placeholder="Meta + fee · opcional"></label></div><p class="roi-note">Resultados estimados según los datos ingresados. Selecciona los casos incluidos en tu propuesta. La tarifa de WhatsApp debe incluir Meta y fee; si falta, ese costo queda por confirmar.</p>'+s.section+'</main><script>'+context+'\n'+s.icons+'\n'+s.calculator+'\nstartStandaloneRoi();</script></body></html>';
}
export function createRoiPublicGateway(read:(path:string)=>Promise<Uint8Array>){
 const assets:Record<string,string>={'brand-system.css':'text/css; charset=utf-8','logoadereso.webp':'image/webp'};
 return async(request:Request):Promise<Response|null>=>{
  const url=new URL(request.url);if(url.pathname!=='/roi'&&!url.pathname.startsWith('/roi/'))return null;
  const fail=(status:number)=>new Response(null,{status,headers:{'Cache-Control':'no-store'}});
  if(!['GET','HEAD'].includes(request.method))return fail(405);
  if(url.pathname==='/roi')return new Response(null,{status:308,headers:{Location:'/roi/'+url.search,'Cache-Control':'no-store'}});
  const path=url.pathname.slice(5);if(path&&!Object.hasOwn(assets,path))return fail(404);
  try{
   const bytes=path?await read(path):new TextEncoder().encode(roiDocument(new TextDecoder().decode(await read('index.html')),new TextDecoder().decode(await read('roi-standalone.js'))));
   return new Response(request.method==='HEAD'?null:new Uint8Array(bytes),{headers:{'Content-Type':path?assets[path]!:'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'no-referrer','Content-Security-Policy':"frame-ancestors 'self'; base-uri 'self'; object-src 'none'"}});
  }catch{return fail(503)}
 };
}
