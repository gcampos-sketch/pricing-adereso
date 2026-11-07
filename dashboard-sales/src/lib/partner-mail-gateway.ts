import { partnerMailInput, partnerSelection } from './partner-mail';
export type MailUser = { userId: string; email: string };
export class MailError extends Error { constructor(public status: number, public code: string) { super(code); } }
type Service = {
 configured: boolean;
 status: (user: MailUser) => Promise<{ connected: boolean; email?: string }>;
 connect: (user: MailUser, selection: ReturnType<typeof partnerSelection.parse>) => Promise<string>;
 callback: (user: MailUser, url: URL) => Promise<string>;
 disconnect: (user: MailUser) => Promise<void>;
 send: (user: MailUser, input: ReturnType<typeof partnerMailInput.parse>) => Promise<{ status: string }>;
};
async function json(request: Request) {
 const reader = request.body?.getReader(); if (!reader) throw new MailError(400, 'invalid_input');
 let text = ''; let size = 0; const decoder = new TextDecoder();
 while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 12000) { await reader.cancel(); throw new MailError(413, 'message_too_large'); } text += decoder.decode(part.value, { stream: true }); }
 try { return JSON.parse(text + decoder.decode()); } catch { throw new MailError(400, 'invalid_input'); }
}
export function createPartnerMailGateway(authenticate: (request: Request) => Promise<MailUser | null>, service: Service, publicOrigin?: string) {
 const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
 return async (request: Request): Promise<Response | null> => {
  const url = new URL(request.url); if (!url.pathname.startsWith('/api/hub/mail/')) return null;
  const route = url.pathname.slice('/api/hub/mail/'.length);
  const methods: Record<string,string> = { status: 'GET', connect: 'POST', callback: 'GET', disconnect: 'POST', send: 'POST' };
  if (!Object.hasOwn(methods, route)) return response({ error: 'not_found' },404);
  if (request.method !== methods[route]) return response({ error: 'method_not_allowed' },405);
  if (request.method === 'POST' && request.headers.get('origin') !== (publicOrigin ?? url.origin)) return response({ error: 'origin_not_allowed' },403);
  try {
   const user = await authenticate(request); if (!user) return response({ error: 'authentication_required' },401);
   if (route === 'status') return response(service.configured ? { configured: true, ...await service.status(user) } : { configured: false, connected: false });
   if (!service.configured) return response({ error: 'gmail_not_configured' },503);
   if (route === 'callback') return new Response(null, { status:303, headers:{ Location: await service.callback(user,url), 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer' } });
   if (route === 'connect') { const parsed = partnerSelection.safeParse(await json(request)); if (!parsed.success) throw new MailError(400,'invalid_input'); return response({ url: await service.connect(user,parsed.data) }); }
   if (route === 'disconnect') { await service.disconnect(user); return response({ connected:false }); }
   const parsed = partnerMailInput.safeParse(await json(request)); if (!parsed.success) throw new MailError(400,'invalid_input');
   return response(await service.send(user,parsed.data));
  } catch (error) { if(route==='callback')return new Response(null,{status:303,headers:{Location:'/?vista=partners&mail=error','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}}); return response({ error: error instanceof MailError ? error.code : 'mail_unavailable' }, error instanceof MailError ? error.status : 503); }
 };
}
