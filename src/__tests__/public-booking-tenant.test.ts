import { publicBookingTenantSlug } from '../utils/public-booking-tenant';
import { Tenant } from '../models/Tenant';
jest.mock('../models/Tenant',()=>({Tenant:{findOne:jest.fn(),find:jest.fn()}}));
const owner='507f1f77bcf86cd799439011';const other='507f1f77bcf86cd799439012';
beforeEach(()=>jest.clearAllMocks());
it('routes to an active assigned owner using only its public slug',async()=>{
 (Tenant.findOne as jest.Mock).mockReturnValue({select:()=>({lean:async()=>({slug:'royal-cruise-hurghada'})})});
 expect(await publicBookingTenantSlug({ownerTenantId:owner,tenantIds:[owner,other]})).toBe('royal-cruise-hurghada');
 expect(Tenant.findOne).toHaveBeenCalledWith({_id:owner,status:'active'});
});
it('never routes to an owner outside assignments or missing scope',async()=>{
 expect(await publicBookingTenantSlug({ownerTenantId:owner,tenantIds:[other]})).toBeUndefined();
 expect(await publicBookingTenantSlug({})).toBeUndefined();expect(Tenant.findOne).not.toHaveBeenCalled();
});
it('rejects ambiguous legacy sellers and permits exactly one active assignment',async()=>{
 (Tenant.find as jest.Mock).mockReturnValue({select:()=>({limit:()=>({lean:async()=>[{slug:'one'},{slug:'two'}]})})});
 expect(await publicBookingTenantSlug({tenantIds:[owner,other]})).toBeUndefined();
 (Tenant.find as jest.Mock).mockReturnValue({select:()=>({limit:()=>({lean:async()=>[{slug:'one'}]})})});
 expect(await publicBookingTenantSlug({tenantIds:[owner]})).toBe('one');
});
it('does not fall back to another seller when the owner is inactive',async()=>{
 (Tenant.findOne as jest.Mock).mockReturnValue({select:()=>({lean:async()=>null})});
 expect(await publicBookingTenantSlug({ownerTenantId:owner,tenantIds:[owner,other]})).toBeUndefined();expect(Tenant.find).not.toHaveBeenCalled();
});
