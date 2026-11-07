import {expect,test} from 'bun:test';
import {createDealNote} from '../src/lib/notes.server';
import {gateway} from '../src/lib/hubspot.server';
function fixture(failReadback=false) {
  let row:any=null,creates=0,fail=failReadback;const notes=new Map<string,any>();
  const receipts=()=>{
    let op='select',payload:any,filters:any={};
    const result=()=>{
      if(op==='insert') {if(row)return {data:null,error:{code:'23505'}};row={...payload,note_id:null};return {data:{...row},error:null};}
      if(op==='update') {if(Object.entries(filters).some(([k,v])=>row?.[k]!==v))return {data:[],error:null};Object.assign(row,payload);return {data:[{...row}],error:null};}
      return {data:row?{...row}:null,error:row?null:{code:'missing'}};
    };
    const chain:any={insert:(p:any)=>{op='insert';payload=p;return chain;},update:(p:any)=>{op='update';payload=p;return chain;},select:()=>chain,maybeSingle:()=>chain,single:()=>chain,match:(f:any)=>{filters=f;return chain;},then:(resolve:any)=>Promise.resolve(result()).then(resolve)};
    return chain;
  };
  const request=async(path:string,init?:RequestInit)=>{
    if(init?.method==='POST'){creates++;const value=JSON.parse(String(init.body));notes.set('77',{properties:value.properties,associations:{deals:{results:[{id:'123'}]}}});return {id:'77'};}
    if(path.includes('?properties=pipeline'))return {properties:{pipeline:'93085851'}};
    if(path.includes('/associations/notes'))return {results:[...notes.keys()].map(id=>({id}))};
    if(fail){fail=false;throw new Error('response lost');}
    return notes.get('77');
  };
  return {deps:{receipts,gateway:request as typeof gateway},created:()=>creates,row:()=>row};
}
test('confirmed retry and parallel submissions create only one associated note',async()=>{
  const f=fixture();const args=['123','Una nota','user','11111111-1111-1111-1111-111111111111'] as const;
  const [a]=await Promise.all([createDealNote(...args,f.deps),createDealNote(...args,f.deps)]);
  expect(a.ok).toBe(true);expect(f.created()).toBe(1);
  expect((await createDealNote(...args,f.deps)).ok).toBe(true);expect(f.created()).toBe(1);
});
test('lost confirmation is reconciled without resending; changed body is rejected',async()=>{
  const f=fixture(true);const args=['123','Nota guardada','user','11111111-1111-1111-1111-111111111111'] as const;
  expect((await createDealNote(...args,f.deps)).ok).toBe(false);
  expect((await createDealNote(...args,f.deps)).ok).toBe(true);expect(f.created()).toBe(1);
  expect((await createDealNote('123','Otro texto',args[2],args[3],f.deps)).ok).toBe(false);expect(f.created()).toBe(1);
});
