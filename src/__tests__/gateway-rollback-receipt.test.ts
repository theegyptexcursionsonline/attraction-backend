import { createHash } from 'crypto';
import { validateGatewayRollbackReceipt } from '../services/gatewayRollbackReceipt';

const account='a'.repeat(32), zone='b'.repeat(32), apex='site-one.com';
const receipt=() => ['foxes-cf-rollback-v3',account,zone,apex,['ns1.example.net','ns2.example.net'],
  [['site-one.com','A','203.0.113.4',300],['www.site-one.com','CNAME','site-one.com',300]],
  [['site-one.com','CNAME','origin.example.net',1,true,null,[],[['flatten_cname',false]]]],[],'external'];
const encode=(value:unknown)=>JSON.stringify(value);
it('accepts and hashes a bounded canonical web-only receipt',()=>{
  const text=encode(receipt());
  expect(validateGatewayRollbackReceipt(text,account,zone,apex)).toBe(createHash('sha256').update(text).digest('hex'));
});
it('rejects mail/TXT and sensitive free-text metadata',()=>{
  const bad=receipt(); (bad[5] as unknown[]).push(['site-one.com','MX','mail.example.net',300]);
  expect(validateGatewayRollbackReceipt(encode(bad),account,zone,apex)).toBeNull();
  const note=receipt(); ((note[6] as unknown[][])[0])[5]='private note';
  expect(validateGatewayRollbackReceipt(encode(note),account,zone,apex)).toBeNull();
});
it('rejects scope mismatch, noncanonical ordering and oversized receipts',()=>{
  expect(validateGatewayRollbackReceipt(encode(receipt()),account,zone,'other.com')).toBeNull();
  const wrong=receipt(); (wrong[5] as unknown[]).reverse();
  expect(validateGatewayRollbackReceipt(encode(wrong),account,zone,apex)).toBeNull();
  expect(validateGatewayRollbackReceipt('x'.repeat(65537),account,zone,apex)).toBeNull();
});
it('rejects an unknown rollback origin classification',()=>{
  const unknown=receipt(); unknown[8]='unknown';
  expect(validateGatewayRollbackReceipt(encode(unknown),account,zone,apex)).toBeNull();
});
