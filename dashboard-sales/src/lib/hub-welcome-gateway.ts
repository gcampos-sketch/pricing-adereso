const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization, Origin','X-Content-Type-Options':'nosniff'}});
/** Cosmetic one-time claim; never changes authentication, CRM or user permissions. */
export function createHubWelcomeGateway(deps:{
  verify:(accessToken:string,trust?:string)=>Promise<{userId:string;expiresAt:number}|null>;
  claim:(userId:string)=>Promise<boolean>;
  publicOrigin?:string|undefined;
}){
  return async(request:Request):Promise<Response|null>=>{
    const url=new URL(request.url);if(url.pathname!=='/api/hub/first-access')return null;
    if(request.method!=='POST')return json({error:'method_not_allowed'},405);
    if(request.headers.get('origin')!==(deps.publicOrigin??url.origin))return json({error:'origin_not_allowed'},403);
    const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if(!token||token.length>6000)return json({error:'authentication_required'},401);
    try{
      const user=await deps.verify(token,request.headers.get('x-mfa-trust')||undefined);
      if(!user||!user.userId||user.expiresAt<=Date.now())return json({error:'authentication_required'},401);
      // The user ID comes exclusively from the verified session, never the request body.
      return json({show:await deps.claim(user.userId)});
    }catch{return json({error:'welcome_unavailable'},503);}
  };
}
