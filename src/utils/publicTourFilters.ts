import { z } from 'zod';
export const tourCategorySchema=z.enum(['walking-tours','food-tours','day-trips','adventure','cultural','photography','boat-tours','private']);
export const durationBandSchema=z.enum(['short','half-day','full-day','multi-day']);
type TourCategory=z.infer<typeof tourCategorySchema>;
type DurationBand=z.infer<typeof durationBandSchema>;
/** Only known literal aliases enter the regular expression, never request text. */
export function publicTourCategoryFilter(category:TourCategory):Record<string,unknown>{
 category=tourCategorySchema.parse(category);
 const term=category.split('-').join('[ -]+');
 const alternatives=category==='adventure'?[term,'desert']:[term];
 return {$or:alternatives.flatMap(value=>[{category:{$regex:value,$options:'i'}},{subcategory:{$regex:value,$options:'i'}}])};
}
const units='hours?|hrs?|h|days?|d|minutes?|mins?|m';
const fragment=`(\\d+(?:\\.\\d+)?)\\s*(${units})`;
/** Parse explicit source units inside MongoDB; unrecognized text remains null. */
export function publicDurationHoursExpression():Record<string,unknown>{
 return {$let:{vars:{text:{$toLower:{$trim:{input:{$cond:[{$eq:[{$type:'$duration'},'string']},'$duration','']}}}}},in:{$switch:{branches:[
  {case:{$regexMatch:{input:'$$text',regex:'^full[ -]+day$'}},then:8},
  {case:{$regexMatch:{input:'$$text',regex:'^half[ -]+day$'}},then:4},
  {case:{$regexMatch:{input:'$$text',regex:`^(?:${fragment}\\s*)+$`}},then:{$sum:{$map:{input:{$regexFindAll:{input:'$$text',regex:fragment}},as:'part',in:{$multiply:[{$convert:{input:{$arrayElemAt:['$$part.captures',0]},to:'double',onError:null,onNull:null}},{$switch:{branches:[{case:{$regexMatch:{input:{$arrayElemAt:['$$part.captures',1]},regex:'^d'}},then:24},{case:{$regexMatch:{input:{$arrayElemAt:['$$part.captures',1]},regex:'^m'}},then:1/60}],default:1}}]}}}}},
 ],default:null}}}};
}
export function publicDurationBandFilter(band:DurationBand):Record<string,unknown>{
 band=durationBandSchema.parse(band);
 const ranges:Record<DurationBand,Record<string,unknown>>={short:{$lte:['$$hours',2]},'half-day':{$and:[{$gte:['$$hours',2]},{$lte:['$$hours',4]}]},'full-day':{$and:[{$gte:['$$hours',4]},{$lte:['$$hours',8]}]},'multi-day':{$gt:['$$hours',8]}};
 return {$expr:{$let:{vars:{hours:publicDurationHoursExpression()},in:{$and:[{$ne:['$$hours',null]},ranges[band]]}}}};
}
