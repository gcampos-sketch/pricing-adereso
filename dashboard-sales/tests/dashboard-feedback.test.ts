import {expect,test} from 'bun:test';
import {saveDashboardFeedback} from '../src/lib/feedback.server';
function fixture(configured=true,loseResponse=false) {
  let row:any=null,calls=0;const keys:string[]=[];
  const table=()=>{
    let op='select',payload:any,filters:any={};const resolve=()=>{
      if(op==='insert'){if(row)return {data:null,error:{code:'23505'}};row={...payload,created_at:new Date().toISOString(),email_state:'pending',email_claimed_at:null};return {data:{...row},error:null};}
      const match=row&&Object.entries(filters).every(([k,v])=>row[k]===v);
      if(!match)return {data:null,error:{code:'missing'}};
      if(op==='update'){Object.assign(row,payload);return {data:[{...row}],error:null};}
      return {data:{...row},error:null};
    };
    const q:any={insert:(p:any)=>{op='insert';payload=p;return q;},update:(p:any)=>{op='update';payload=p;return q;},select:()=>q,maybeSingle:()=>q,single:()=>q,eq:(k:string,v:any)=>{filters[k]=v;return q;},then:(r:any)=>Promise.resolve(resolve()).then(r)};return q;
  };
  const fetcher=(async(_url:any,init:any)=>{calls++;keys.push(init.headers['Idempotency-Key']);if(loseResponse){loseResponse=false;throw new Error('timeout');}return new Response(JSON.stringify({id:'mail-1'}),{status:200});}) as typeof fetch;
  return {deps:{table,env:configured?{RESEND_API_KEY:'test',FEEDBACK_FROM_EMAIL:'test@example.org'}:{},fetcher},row:()=>row,calls:()=>calls,keys};
}
const input={id:'00000000-0000-4000-8000-000000000101',body:'Comentario de prueba',view:'comercial'};
test('feedback remains stored when mail is not configured; repeated submission deduplicates',async()=>{
  const f=fixture(false);expect((await saveDashboardFeedback('user','author@adere.so',input,f.deps)).ok).toBe(true);
  expect(f.row().body).toBe(input.body);expect(f.calls()).toBe(0);
  await saveDashboardFeedback('user','author@adere.so',input,f.deps);expect(f.calls()).toBe(0);
});
test('linked issue receipt is reused and changed content cannot reuse the operation',async()=>{
  const f=fixture(false);await saveDashboardFeedback('user','author@adere.so',input,f.deps);
  f.row().linear_issue_id='SALES-test';
  expect((await saveDashboardFeedback('user','author@adere.so',input,f.deps)).message).toContain('registrado en Linear');
  expect((await saveDashboardFeedback('user','author@adere.so',{...input,body:'changed'},f.deps)).ok).toBe(false);
  expect(f.calls()).toBe(0);
});
