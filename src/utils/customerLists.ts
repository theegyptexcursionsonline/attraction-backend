import type { Response,NextFunction } from 'express';
import type { AuthRequest } from '../types';
import { sendError } from './response';
import { escapeRegex } from './helpers';
import { z } from 'zod';
import { Types, type PipelineStage } from 'mongoose';
import { publicCursorPlan } from './publicCursor';
import { paginationSchema, regexSearchSchema } from './validators';
export const customerListQuery = paginationSchema.extend({ pagination: z.literal('cursor').optional(), cursor: z.string().regex(/^[A-Za-z0-9_-]{1,2048}$/).optional(), search: regexSearchSchema, status: z.enum(['pending','confirmed','completed','cancelled','refunded']).optional() });
export const wishlistPageRemoval = z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).min(1).max(100) });
export const customerCursor = (binding: object, cursor?: string) => publicCursorPlan(binding, [{ field:'createdAt',direction:-1,kind:'date' },{field:'_id',direction:-1,kind:'id'}],cursor);
export const activeSiteAttractions = (tenantId: Types.ObjectId) => ({ tenantIds:tenantId,status:'active',archivedAt:{$exists:false},trashedAt:{$exists:false} });
export function wishlistPipeline(userId: Types.ObjectId, tenantId: Types.ObjectId, search?: string): PipelineStage[] {
 const literal=search ? escapeRegex(search) : '';
 return [{$match:{_id:userId}},{$unwind:'$wishlist'},{$lookup:{from:'attractions',localField:'wishlist',foreignField:'_id',pipeline:[{$match:{...activeSiteAttractions(tenantId),...(literal?{$or:[{title:{$regex:literal,$options:'i'}},{slug:{$regex:literal,$options:'i'}}]}:{})}}],as:'tour'}},{$unwind:'$tour'},{$replaceRoot:{newRoot:'$tour'}}];
}
export const wishlistProjection={_id:1,slug:1,pathSlug:1,title:1,images:1,priceFrom:1,currency:1,destination:1,rating:1,reviewCount:1,badges:1,duration:1,enquiryOnly:1,hasHotelPickup:1,createdAt:1};

/** An explicit malformed site hint must not become an unscoped legacy read. */
export const validateCustomerSiteHint = (req:AuthRequest,res:Response,next:NextFunction):void => {
 const values=[req.query.tenantId,req.query.tenant,req.headers['x-tenant-id']];
 if(values.some(value=>value!==undefined&&(typeof value!=='string'||!value.trim()))){sendError(res,'Select a valid site',400);return;}
 next();
};
