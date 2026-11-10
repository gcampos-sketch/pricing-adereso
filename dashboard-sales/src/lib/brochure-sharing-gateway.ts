import { BrochureError, brochureEventInput, brochureShareInput } from './brochure-sharing';
import type { BrochureShareInput, BrochureEvent } from './brochure-sharing';
import type { RoiUser } from './roi-sharing-gateway';
import type { RoiDeal } from './roi-sharing';
export type BrochureSharingService={
 deals:(query:string)=>Promise<RoiDeal[]>;
 create:(user:RoiUser,input:BrochureShareInput,origin:string)=>Promise<unknown>;
 list:(user:RoiUser)=>Promise<unknown>;
 event:(input:BrochureEvent)=>Promise<void>;
};
async function body(request:Request){const reader=request.body?.getReader();if(!reader)throw new BrochureError(400,'invalid_input');let size=0,value='';const decoder=new TextDecoder();while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4000){await reader.cancel();throw new BrochureError(413,'invalid_input');}value+=decoder.decode(part.value,{stream:true});}try{return JSON.parse(value+decoder.decode());}catch{throw new BrochureError(400,'invalid_input');}}
export function createBrochureSharingGateway(deps:{authenticate:(request:Request)=>Promise<RoiUser|null>;service:BrochureSharingService;origin?:string|undefined}){
 return async(request:Request):Promise<Response|null>=>{
 const url=new URL(request.url),publicEvent=url.pathname==='/api/brochure/events';
 if(!publicEvent&&!url.pathname.startsWith('/api/hub/brochure/'))return null;
 const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
 const route=publicEvent?'event':url.pathname.slice('/api/hub/brochure/'.length),methods:Record<string,string>={deals:'GET',shares:'GET',create:'POST',event:'POST'};
 if(!Object.hasOwn(methods,route))return json({error:'not_found'},404);
 if(request.method!==methods[route])return json({error:'method_not_allowed'},405);
 const origin=deps.origin??url.origin;
 if(request.method==='POST'&&request.headers.get('origin')!==origin)return json({error:'origin_not_allowed'},403);
 try{
 if(publicEvent){const parsed=brochureEventInput.safeParse(await body(request));if(!parsed.success)throw new BrochureError(400,'invalid_input');await deps.service.event(parsed.data);return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});}
 const user=await deps.authenticate(request);if(!user||user.expiresAt<=Date.now())return json({error:'authentication_required'},401);
 if(route==='deals'){const query=(url.searchParams.get('q')??'').trim();if(query.length<2||query.length>100)throw new BrochureError(400,'invalid_input');return json({deals:await deps.service.deals(query)});}
 if(route==='shares')return json({shares:await deps.service.list(user)});
 const parsed=brochureShareInput.safeParse(await body(request));if(!parsed.success)throw new BrochureError(400,'invalid_input');return json(await deps.service.create(user,parsed.data,origin));
 }catch(error){return json({error:error instanceof BrochureError?error.code:'brochure_unavailable'},error instanceof BrochureError?error.status:503);}
 };
}
