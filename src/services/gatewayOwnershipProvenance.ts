/** Preserve field presence separately from null/value for exact rollback. */
export function gatewayOwnershipProvenance(tenant:Record<string,unknown>, claim?:Record<string,unknown>|null) {
  const has=(object:Record<string,unknown>|null|undefined,key:string)=>!!object && Object.prototype.hasOwnProperty.call(object,key);
  return {
    claimWasExisting:!!claim,
    providerPresent:has(claim,'provider'),...(has(claim,'provider')?{providerValue:claim!.provider}:{}),
    generationPresent:has(claim,'claimGeneration'),...(has(claim,'claimGeneration')?{generationValue:claim!.claimGeneration}:{}),
    customDomainPresent:has(tenant,'customDomain'),...(has(tenant,'customDomain')?{customDomainValue:tenant.customDomain}:{}),
    statusPresent:has(tenant,'customDomainStatus'),...(has(tenant,'customDomainStatus')?{statusValue:tenant.customDomainStatus}:{}),
    migratedPresent:has(tenant,'domainMigrated'),...(has(tenant,'domainMigrated')?{migratedValue:tenant.domainMigrated}:{}),
    lastChangedByPresent:has(tenant,'customDomainLastChangedBy'),...(has(tenant,'customDomainLastChangedBy')?{lastChangedByValue:tenant.customDomainLastChangedBy}:{}),
  };
}
