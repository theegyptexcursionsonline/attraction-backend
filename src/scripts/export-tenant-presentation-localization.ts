import 'dotenv/config';
import mongoose from 'mongoose';
import { writeFile } from 'fs/promises';
import { Tenant } from '../models/Tenant';
import { exportTenantPresentationSource, presentationDigest } from '../services/tenantPresentationMigration.service';
export function presentationExportArguments(args:string[]) {
 const allowed=['--tenant','--domain','--out'];
 if(args.length!==6||args.some((value,index)=>index%2===0&&!allowed.includes(value))||allowed.some(key=>args.filter(value=>value===key).length!==1))throw new Error('Provide exact tenant, domain and new output file');
 const value=(key:string)=>args[args.indexOf(key)+1];
 const slug=value('--tenant'),domain=value('--domain'),output=value('--out');
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||!output||/[\u0000-\u001f]/.test(output)||!/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)||domain!==domain.toLowerCase())throw new Error('Provide exact tenant, domain and new output file');
 return {slug,domain,output};
}
export async function exportTenantPresentationToFile(args:string[]) {
 const {slug,domain,output}=presentationExportArguments(args);
 const tenant=await Tenant.findOne({slug,customDomain:domain,status:'active'}).select('_id slug customDomain status tagline description heroImages seoSettings pageSeo navigation customPages').lean();
 if(!tenant)throw new Error('Active tenant/domain ownership did not match');
 const source=exportTenantPresentationSource(tenant);
 const result={...source,sourceSha256:presentationDigest(source)};
 await writeFile(output,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
 return {exported:true,sources:source.sources.length,locales:['ar','de','ru','fr'],databaseWrites:0};
}
export async function runTenantPresentationExport(args:string[]) {
 presentationExportArguments(args);
 const uri=process.env.MONGODB_URI||process.env.MONGO_URI;if(!uri)throw new Error('Database configuration is required');
 await mongoose.connect(uri,{autoIndex:false,autoCreate:false});
 try{return await exportTenantPresentationToFile(args);}finally{await mongoose.disconnect();}
}
if(require.main===module)runTenantPresentationExport(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('Read-only content export failed. Check exact tenant/domain, database access and a new output file.');process.exitCode=1;});
