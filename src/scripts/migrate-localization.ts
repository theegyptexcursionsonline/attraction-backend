import 'dotenv/config';
import mongoose from 'mongoose';
import { createHash } from 'crypto';
import { readFile,writeFile } from 'fs/promises';
import { planLocalization,executeLocalizationPlan,type LocalizationPlan } from '../services/localizationMigration.service';
async function main(){
  const args=process.argv.slice(2); const value=(key:string)=>args.includes(key)?args[args.indexOf(key)+1]:''; const mode=value('--mode'); const planFile=value('--plan');
  if(!['dry-run','apply','rollback'].includes(mode)||!planFile) throw new Error('Provide --mode dry-run|apply|rollback and --plan <file>');
  const uri=process.env.MONGODB_URI||process.env.MONGO_URI; if(!uri) throw new Error('Database configuration is required');
  await mongoose.connect(uri,{autoIndex:false,autoCreate:false});
  try{
    if(mode==='dry-run'){
      const sourceRaw=await readFile(value('--source'),'utf8'); const source=JSON.parse(sourceRaw); const payload=JSON.parse(await readFile(value('--payload'),'utf8'));
      const plan=await planLocalization(source,payload,createHash('sha256').update(sourceRaw).digest('hex'));
      await writeFile(planFile,mongoose.mongo.BSON.EJSON.stringify(plan,{relaxed:false}),{flag:'wx',mode:0o600});
      console.log(JSON.stringify({mode,rows:plan.rows.length,digest:plan.digest,backedUp:plan.rows.filter(row=>!!row.before).length,databaseWrites:0}));
    }else{
      const plan=mongoose.mongo.BSON.EJSON.parse(await readFile(planFile,'utf8')) as LocalizationPlan;
      const result=await executeLocalizationPlan(plan,value('--approve-digest'),mode as 'apply'|'rollback');
      await writeFile(`${planFile}.${mode}.${Date.now()}.receipt.json`,JSON.stringify({...result,completedAt:new Date().toISOString()},null,2),{flag:'wx',mode:0o600}); console.log(JSON.stringify(result));
    }
  }finally{await mongoose.disconnect();}
}
main().catch(error=>{ console.error(error instanceof Error && !/mongodb|password|srv|uri/i.test(error.message)?error.message:'Localization operation could not complete. Inspect scoped connection and plan state before retrying.'); process.exitCode=1; });
