import { getCategories } from '../controllers/categories.controller';
import { getDestinations } from '../controllers/destinations.controller';
import { Category } from '../models/Category';
import { Destination } from '../models/Destination';
import { Attraction } from '../models/Attraction';
import type { AuthRequest } from '../types';
import type { Response } from 'express';
jest.mock('../models/Category',()=>({Category:{find:jest.fn()}}));
jest.mock('../models/Destination',()=>({Destination:{find:jest.fn(),countDocuments:jest.fn()}}));
jest.mock('../models/Attraction',()=>({Attraction:{aggregate:jest.fn(),distinct:jest.fn()}}));
const categories=[{slug:'adventures',name:'Adventures'}];
const destinations=[{slug:'makadi-bay',name:'Makadi Bay'}];
function response(){const res={status:jest.fn(),json:jest.fn(),setHeader:jest.fn()};res.status.mockReturnValue(res);return res as unknown as Response;}
beforeEach(()=>{
 jest.clearAllMocks();
 (Category.find as jest.Mock).mockReturnValue({sort:()=>({lean:async()=>categories})});
 (Destination.find as jest.Mock).mockReturnValue({sort:()=>({skip:()=>({limit:()=>({lean:async()=>destinations})})})});
 (Destination.countDocuments as jest.Mock).mockResolvedValue(1);
 (Attraction.aggregate as jest.Mock).mockResolvedValue([]);
 (Attraction.distinct as jest.Mock).mockResolvedValue([]);
});
it.each([getCategories,getDestinations])('requires staff access to global editor options',async handler=>{
 for(const role of [undefined,'customer']){
  const res=response(); await handler({query:{forEditor:'true'},user:role?{role}:undefined} as unknown as AuthRequest,res,jest.fn());
  expect(res.status).toHaveBeenCalledWith(role?403:401);
 }
 expect(Category.find).not.toHaveBeenCalled();expect(Destination.find).not.toHaveBeenCalled();
});
it('offers existing categories even before a site has active tours',async()=>{
 const res=response();await getCategories({query:{forEditor:'true'},user:{role:'super-admin'},tenant:{_id:'site'}} as unknown as AuthRequest,res,jest.fn());
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({data:categories}));
 expect(Attraction.aggregate).not.toHaveBeenCalled();
});
it('offers paginated destinations without requiring an existing tour in that destination',async()=>{
 const res=response();await getDestinations({query:{forEditor:'true',page:'2',limit:'10'},user:{role:'super-admin'},tenant:{_id:'site'}} as unknown as AuthRequest,res,jest.fn());
 expect(Destination.find).toHaveBeenCalledWith({isActive:true});expect(Attraction.distinct).not.toHaveBeenCalled();
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({data:destinations}));
});
it('retains public tenant filtering',async()=>{
 const res=response();await getCategories({query:{},tenant:{_id:'site'}} as unknown as AuthRequest,res,jest.fn());
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({data:[]}));
});
