import { readFile,writeFile,mkdir,rename,unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../integrations/supabase/client.server';
import { verifyHubIdentity } from './hub-auth.server';
import { createAcademyProgressGateway,type AcademyProgress } from './academy-progress-gateway';
const db=supabaseAdmin as unknown as SupabaseClient;
const development=process.env['NODE_ENV']==='development';
const directory=resolve(process.cwd(),'.migration-backups/academy-progress');
async function read(userId:string):Promise<AcademyProgress>{
  if(development){
    try{return {...JSON.parse(await readFile(resolve(directory,userId+'.json'),'utf8')),storage:'development'};}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {revision:0,payload:{},storage:'development'};throw error;}
  }
  const {data,error}=await db.from('academy_personal_progress').select('revision,payload').eq('user_id',userId).maybeSingle();
  if(error)throw Error('progress_unavailable');return data??{revision:0,payload:{}};
}
async function write(userId:string,revision:number,payload:Record<string,unknown>):Promise<AcademyProgress|null>{
  if(development){
    await mkdir(directory,{recursive:true,mode:0o700});
    const lock=resolve(directory,userId+'.lock');let acquired=false;
    try{
      try{await writeFile(lock,'',{flag:'wx',mode:0o600});acquired=true;}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')return null;throw error;}
      const current=await read(userId);if(current.revision!==revision)return null;
      const result={revision:revision+1,payload,storage:'development'};
      const temporary=resolve(directory,userId+'.'+randomUUID()+'.tmp');
      await writeFile(temporary,JSON.stringify(result),{mode:0o600});await rename(temporary,resolve(directory,userId+'.json'));return result;
    }finally{if(acquired)await unlink(lock);}
  }
  const {data,error}=await db.rpc('academy_save_personal_progress',{p_user_id:userId,p_revision:revision,p_payload:payload});
  if(error)throw Error('progress_unavailable');return data?{revision:data,payload}:null;
}
export const handleAcademyProgressRequest=createAcademyProgressGateway({verify:verifyHubIdentity,read,write,publicOrigin:development?undefined:process.env['RENDER_EXTERNAL_URL']});
