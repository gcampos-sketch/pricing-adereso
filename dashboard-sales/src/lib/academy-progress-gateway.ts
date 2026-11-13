import { readTicket } from './hub-gateway';
export type AcademyProgress = { revision:number; payload:Record<string,unknown>; storage?:string };
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie','X-Content-Type-Options':'nosniff'}});
export function createAcademyProgressGateway(deps:{
  verify:(token:string,trust?:string)=>Promise<{userId:string;expiresAt:number}|null>;
  read:(userId:string)=>Promise<AcademyProgress>;
  write:(userId:string,revision:number,payload:Record<string,unknown>)=>Promise<AcademyProgress|null>;
  publicOrigin?:string|undefined;
}) {
  return async(request:Request):Promise<Response|null>=>{
    const url=new URL(request.url);if(url.pathname!=='/api/academy/progress')return null;
    if(!['GET','PUT'].includes(request.method))return json({error:'method_not_allowed'},405);
    if(request.method==='PUT' && request.headers.get('origin')!==(deps.publicOrigin??url.origin))return json({error:'origin_not_allowed'},403);
    const ticket=readTicket(request);if(!ticket)return json({error:'authentication_required'},401);
    try {
      const user=await deps.verify(ticket.accessToken,ticket.trustToken);
      if(!user?.userId||user.expiresAt<=Date.now())return json({error:'authentication_required'},401);
      if(request.method==='GET')return json(await deps.read(user.userId));
      if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'invalid_payload'},400);
      const reader=request.body?.getReader();if(!reader)return json({error:'invalid_payload'},400);
      const chunks:Uint8Array[]=[];let bytes=0;
      try {while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>100000)return json({error:'payload_too_large'},413);chunks.push(value);}}finally{await reader.cancel();}
      let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return json({error:'invalid_payload'},400);}
      if(!body||typeof body!=='object')return json({error:'invalid_payload'},400);
      const {revision,payload}=body as Record<string,unknown>;
      if(!Number.isSafeInteger(revision)||Number(revision)<0||!payload||typeof payload!=='object'||Array.isArray(payload))return json({error:'invalid_payload'},400);
      const p=payload as Record<string,unknown>;
      if(!['SDR','AE','KAM'].includes(String(p['role']))||!['onboarding','practice'].includes(String(p['mode'])))return json({error:'invalid_payload'},400);
      for(const key of ['attempts','reviews','tasks','legacy'])if(!p[key]||typeof p[key]!=='object'||Array.isArray(p[key]))return json({error:'invalid_payload'},400);
      const result=await deps.write(user.userId,Number(revision),p);
      return result?json(result):json({error:'progress_conflict'},409);
    }catch{return json({error:'progress_unavailable'},503);}
  };
}
