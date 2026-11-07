import fs from 'node:fs';
import {createHash} from 'node:crypto';
const targets={
 'home.html':'/index.html','not-found.html':'/404.html','academy.html':'/academy/index.html',
 'playbook.html':'/playbook/index.html','operativa.html':'/operativa/index.html','argumentaciones.html':'/argumentaciones/index.html',
 'dashboard.html':'/dashboard/index.html','pricing.html':'/pricing/index.html','partners.html':'/partners/index.html','roi.html':'/roi/index.html',
};
const script=`(()=>{const hub='https://adereso-hub-comercial.onrender.com/';const publicBase='https://adereso-partners.onrender.com';const input=new URL(location.href);let target=new URL(hub);if(/\\/partners\\//.test(input.pathname)||input.searchParams.get('vista')==='partners'){target=new URL(publicBase+'/partners/');for(const key of ['tipo','categoria','rebase','soporte']){const value=input.searchParams.get(key);if(value&&/^[a-zA-Z0-9_-]{1,40}$/.test(value))target.searchParams.set(key,value);}}else if(/\\/roi\\//.test(input.pathname)||input.searchParams.get('vista')==='roi'){target=new URL(publicBase+'/roi/');for(const key of ['mensualidad','volumen','plantilla']){const value=input.searchParams.get(key);if(value&&/^\\d+(?:\\.\\d+)?$/.test(value)&&Number(value)<=1e12)target.searchParams.set(key,value);}}document.getElementById('destination').href=target.href;location.replace(target.href);})();`;
const hash=createHash('sha256').update(script).digest('base64');
fs.mkdirSync('pages-redirect',{recursive:true});
for(const [name,path] of Object.entries(targets)){
 const destination=path.includes('/partners/')?'https://adereso-partners.onrender.com/partners/':path.includes('/roi/')?'https://adereso-partners.onrender.com/roi/':'https://adereso-hub-comercial.onrender.com/';
 const html=`---\nlayout: null\npermalink: ${path}\n---\n<!doctype html><html lang="es" data-hub-moved><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta http-equiv="refresh" content="2;url=${destination}"><title>Hub comercial · Adereso</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0d1016;color:#fff;font:17px/1.6 system-ui}main{max-width:500px;padding:32px}p{color:#a5a7b1}a{display:inline-block;background:#ffd540;border-radius:30px;padding:12px 22px;color:#111;text-decoration:none;font-weight:600}h1{letter-spacing:-.04em}</style></head><body><main><h1>Hub comercial Adereso</h1><p>La página cambió de dirección. Te estamos llevando a la versión actualizada.</p><a id="destination" href="${destination}">Abrir página actualizada</a></main><script>${script}</script></body></html>\n`;
 fs.writeFileSync('pages-redirect/'+name,html);
}
