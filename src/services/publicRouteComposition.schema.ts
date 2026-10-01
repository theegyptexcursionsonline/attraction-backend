import { z } from 'zod';
export const ROUTE_RENDERER = 'savanna-public-composition-v1' as const;
export const routeLocale = z.enum(['en','ar','de','ru','fr']);
export const publicRouteCompositionRequest = z.object({
 tenantSlug:z.literal('grand-rock-safari'),domain:z.literal('grandrocksafari.com'),
 route:z.enum(['home','about','faq','safaris','destinations']),locale:routeLocale,
 cursor:z.string().regex(/^[A-Za-z0-9_-]{1,2048}$/).optional(),
}).strict().superRefine((value,ctx)=>{if(value.cursor&&!['safaris','destinations'].includes(value.route))ctx.addIssue({code:'custom',message:'This route has no collection cursor'});});
export type RouteRequest = z.infer<typeof publicRouteCompositionRequest>;
export const publicRoutePublicationReceipt = z.object({
 version:z.literal(1),renderer:z.literal(ROUTE_RENDERER),tenantId:z.string().regex(/^[a-f0-9]{24}$/),
 tenantSlug:z.literal('grand-rock-safari'),domain:z.literal('grandrocksafari.com'),
 route:z.enum(['home','about','faq','safaris','destinations']),locale:routeLocale,
 sourceDigest:z.string().regex(/^[a-f0-9]{64}$/),seedDigest:z.string().regex(/^[a-f0-9]{64}$/),
 contentLocales:z.array(z.enum(['ar','de','ru','fr'])).max(4),
 counts:z.object({tours:z.number().int().nonnegative(),destinations:z.number().int().nonnegative()}).strict(),
}).strict().superRefine((value,ctx)=>{if(new Set(value.contentLocales).size!==value.contentLocales.length)ctx.addIssue({code:'custom',message:'Duplicate language proof'});});
