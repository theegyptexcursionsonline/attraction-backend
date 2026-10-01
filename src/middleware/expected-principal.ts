import type {Request} from 'express';
/** Optional denial-only assertion: it never supplies authentication or authorization. */
export function expectedPrincipal(req:Pick<Request,'headers'|'rawHeaders'>):{valid:boolean;expected?:string}{
 const raw=req.headers['x-expected-principal'];
 const copies=(req.rawHeaders || []).filter((value,index)=>index%2===0&&value.toLowerCase()==='x-expected-principal').length;
 if(raw===undefined)return {valid:copies===0};
 if(copies>1||typeof raw!=='string'||!(/^[a-f0-9]{24}$/i.test(raw)||raw==='anonymous'))return {valid:false};
 return {valid:true,expected:raw==='anonymous'?raw:raw.toLowerCase()};
}
export function principalMatches(expected:string|undefined,actual?:string):boolean{
 return expected===undefined||(expected==='anonymous'?!actual:actual?.toLowerCase()===expected);
}
