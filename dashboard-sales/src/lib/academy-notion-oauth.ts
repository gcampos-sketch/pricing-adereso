import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { readTicket } from './hub-gateway';

export const notionCallback = 'https://adereso-hub-comercial.onrender.com/api/academy/notion/callback';
export type AcademyOperator = { userId: string; email: string; expiresAt: number };
export class NotionConnectionError extends Error {
  constructor(public code: 'notion_invalid_client'|'notion_code_rejected'|'notion_wiki_access_missing'|'notion_token_response_invalid'|'notion_storage_unavailable'|'notion_queue_unavailable') { super(code); }
}
export function parseNotionGrant(value: unknown): { access_token: string; refresh_token: string | null; [key: string]: unknown } {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new NotionConnectionError('notion_token_response_invalid');
  const grant=value as Record<string,unknown>;
  if(typeof grant['access_token']!=='string'||!grant['access_token']||
    (grant['refresh_token']!=null&&(typeof grant['refresh_token']!=='string'||!grant['refresh_token'])))throw new NotionConnectionError('notion_token_response_invalid');
  // The current Notion schema explicitly allows a null refresh_token. Older
  // grants may omit it; use the access token until Notion asks for authorization again.
  return {...grant,access_token:grant['access_token'],refresh_token:typeof grant['refresh_token']==='string'?grant['refresh_token']:null};
}
export function encryptNotionGrant(value: unknown, key: string) {
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('notion_encryption_not_configured');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  cipher.setAAD(Buffer.from('academy-notion-grant/v1'));
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),bytes].map(b=>b.toString('base64url')).join('.');
}
export function decryptNotionGrant(value: string, key: string): any {
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('notion_encryption_not_configured');
  const parts = value.split('.'); if (parts.length !== 3) throw new Error('notion_grant_invalid');
  const [iv,tag,bytes] = parts.map(p=>Buffer.from(p,'base64url'));
  const decipher = createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv!);
  decipher.setAAD(Buffer.from('academy-notion-grant/v1'));decipher.setAuthTag(tag!);
  return JSON.parse(Buffer.concat([decipher.update(bytes!),decipher.final()]).toString('utf8'));
}
export const notionStateHash = (value: string) => createHash('sha256').update(value).digest('hex');
type OAuthService = {
  configured: boolean;
  connected: () => Promise<boolean>;
  saveState: (user: AcademyOperator, hash: string) => Promise<void>;
  consumeState: (user: AcademyOperator, hash: string) => Promise<boolean>;
  exchange: (code: string, user: AcademyOperator) => Promise<void>;
  clientId: string;
};
export function createNotionOAuthGateway(deps: {
  verify: (token: string, trust?: string) => Promise<AcademyOperator | null>;
  service: OAuthService; operatorEmail: string;
}) {
  const headers = { 'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',Vary:'Cookie' };
  const json = (body: unknown,status=200) => Response.json(body,{status,headers});
  return async (request: Request): Promise<Response | null> => {
    const url=new URL(request.url), base='/api/academy/notion/';
    if (!['status','connect','authorize','callback'].some(p=>url.pathname===base+p)) return null;
    const callback=url.pathname.endsWith('/callback');
    const direct=url.pathname.endsWith('/authorize');
    if(request.method!==(url.pathname.endsWith('/connect')?'POST':'GET')) return json({error:'method_not_allowed'},405);
    const ticket=readTicket(request);const user=ticket?await deps.verify(ticket.accessToken,ticket.trustToken):null;
    if(!user||user.expiresAt<=Date.now()) return json({error:'authentication_required'},401);
    const operator=user.email===deps.operatorEmail;
    if(url.pathname.endsWith('/status')) {
      try {return json({configured:deps.service.configured,connected:await deps.service.connected(),canConnect:operator});}
      catch{return json({error:'notion_status_unavailable'},503);}
    }
    if(!operator) return json({error:'notion_operator_required'},403);
    if(!deps.service.configured) return json({error:'notion_oauth_not_configured'},503);
    if(!callback&&!direct&&request.headers.get('origin')!==new URL(notionCallback).origin) return json({error:'origin_not_allowed'},403);
    try {
      if(!callback) {
        const state=randomBytes(32).toString('hex');await deps.service.saveState(user,notionStateHash(state));
        const authorize=new URL('https://api.notion.com/v1/oauth/authorize');
        authorize.search=new URLSearchParams({owner:'user',client_id:deps.service.clientId,redirect_uri:notionCallback,response_type:'code',state}).toString();
        // A direct navigation starts the same MFA-backed, user-bound flow. It
        // never exchanges a code or grants access without Notion's consent step.
        if(direct)return new Response(null,{status:303,headers:{...headers,Location:authorize.href}});
        return json({url:authorize.href});
      }
      const state=url.searchParams.get('state')??'';
      if(!/^[a-f0-9]{64}$/.test(state)||!await deps.service.consumeState(user,notionStateHash(state))) return json({error:'invalid_oauth_state'},400);
      const code=url.searchParams.get('code');
      if(url.searchParams.has('error')) return new Response('Autorización cancelada. Puedes volver al Hub y conectar Notion cuando quieras.',{headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
      if(!code||code.length>4000) return json({error:'invalid_oauth_code'},400);
      await deps.service.exchange(code,user);
      return new Response('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Notion conectado</title><body style="background:#131415;color:#f4f4f5;font:18px system-ui;padding:48px;max-width:600px;margin:auto"><h1>Notion conectado</h1><p>La wiki quedó autorizada para Sales Academy. La próxima sincronización comprobará sus novedades.</p><a href="/" style="color:#ffd540">Volver al Hub comercial →</a></body></html>',{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
    } catch(error) {
      const code=error instanceof NotionConnectionError?error.code:'notion_connection_failed';
      const messages: Record<string,string>={
        notion_invalid_client:'Notion no acepta las credenciales de esta conexión. Hay que actualizar el Client secret antes de volver a autorizar.',
        notion_code_rejected:'Notion rechazó este intento de autorización. Inicia una autorización nueva desde el Hub.',
        notion_wiki_access_missing:'La autorización no incluyó acceso a la Wiki comercial de producto. Reintenta y selecciona esa página.',
        notion_token_response_invalid:'La respuesta de Notion no se pudo validar. La conexión no quedó guardada.',
        notion_storage_unavailable:'No pudimos guardar la conexión. Inténtalo de nuevo en unos minutos.',
        notion_queue_unavailable:'Notion quedó autorizado. La primera lectura de la wiki está pendiente de programación.',
        notion_connection_failed:'No se pudo completar la conexión con Notion. Puedes iniciar un intento nuevo.',
      };
      const message=messages[code]!;
      if(callback) return new Response('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Conexión con Notion</title><body style="background:#131415;color:#f4f4f5;font:18px/1.6 system-ui;padding:48px;max-width:640px;margin:auto"><h1>No se completó la conexión</h1><p>'+message+'</p><a href="/" style="color:#ffd540">Volver al Hub comercial →</a></body></html>',{status:503,headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
      return json({error:code,message},503);
    }
  };
}
