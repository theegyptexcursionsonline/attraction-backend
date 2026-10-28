import { createHash } from 'crypto';
import { isIP } from 'net';
import { domainToASCII } from 'url';

/** Canonical WEB-only receipt; excludes mail, TXT, free text and credentials. */
export function validateGatewayRollbackReceipt(text:string, account:string, zone:string, apex:string):string | null {
  if(typeof text!=='string' || Buffer.byteLength(text,'utf8')>65_536) return null;
  let parsed:unknown;
  try { parsed=JSON.parse(text); } catch { return null; }
  if(!Array.isArray(parsed) || parsed.length!==9 || JSON.stringify(parsed)!==text ||
     parsed[0]!=='foxes-cf-rollback-v3' || parsed[1]!==account || parsed[2]!==zone || parsed[3]!==apex ||
     !['network','external'].includes(parsed[8])) return null;
  const host=(value:unknown):value is string => {
    if(typeof value!=='string' || !value || value!==value.toLowerCase() || value.endsWith('.') || domainToASCII(value)!==value) return false;
    return value.length<=253 && value.split('.').length>=2 && value.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
  };
  const ordered=(items:unknown[]) => items.every((x,i)=>i===0 || Buffer.compare(Buffer.from(JSON.stringify(items[i-1])),Buffer.from(JSON.stringify(x)))<0);
  const ns=parsed[4], pub=parsed[5], cf=parsed[6], routes=parsed[7];
  if(!Array.isArray(ns) || ns.length<2 || ns.length>20 || !ns.every(host) || new Set(ns).size!==ns.length || [...ns].sort().some((x,i)=>x!==ns[i])) return null;
  const record=(value:unknown, cloudflare:boolean):boolean => {
    if(!Array.isArray(value) || value.length!==(cloudflare?8:4)) return false;
    const [name,type,target,ttl]=value;
    if(!host(name) || (name!==apex && name!==`www.${apex}`) || !['A','AAAA','CNAME'].includes(type) ||
       typeof target!=='string' || !Number.isInteger(ttl) || ttl<1 || ttl>86_400) return false;
    if(type==='A' && isIP(target)!==4) return false;
    if(type==='AAAA' && (isIP(target)!==6 || new URL(`http://[${target}]/`).hostname.slice(1,-1)!==target)) return false;
    if(type==='CNAME' && !host(target)) return false;
    if(cloudflare) {
      const [, , , , proxied, comment, tags, settings]=value;
      if(typeof proxied!=='boolean' || comment!==null || !Array.isArray(tags) || tags.length || !Array.isArray(settings) || settings.length>3 || !ordered(settings)) return false;
      for(const setting of settings) if(!Array.isArray(setting) || setting.length!==2 || !['flatten_cname','ipv4_only','ipv6_only'].includes(setting[0]) || typeof setting[1]!=='boolean') return false;
    }
    return true;
  };
  if(!Array.isArray(pub) || pub.length<1 || pub.length>100 || !pub.every(item=>record(item,false)) || !ordered(pub) ||
     !Array.isArray(cf) || cf.length>100 || !cf.every(item=>record(item,true)) || !ordered(cf)) return null;
  if(!Array.isArray(routes) || routes.length>100 || !ordered(routes) || !routes.every(route=>
    Array.isArray(route) && route.length===3 && typeof route[0]==='string' && route[0].length>0 && route[0].length<=1024 &&
    !/[\s?#@]/.test(route[0]) && (route[1]===null || (typeof route[1]==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(route[1]))) && typeof route[2]==='boolean')) return null;
  return createHash('sha256').update(text,'utf8').digest('hex');
}

export function gatewayRollbackOriginKind(text:string, account:string, zone:string, apex:string):'network'|'external'|null {
  if(!validateGatewayRollbackReceipt(text,account,zone,apex)) return null;
  return JSON.parse(text)[8] as 'network'|'external';
}
