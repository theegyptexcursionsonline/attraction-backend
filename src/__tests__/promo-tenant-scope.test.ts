import { Types } from 'mongoose';
import { PromoCode } from '../models/PromoCode';
import { getPromoCodes, validatePromoCode } from '../controllers/promo.controller';

jest.mock('../models/PromoCode', () => ({
  PromoCode: {
    findOne: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('promo-code tenant boundaries', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects public validation without an active tenant', async () => {
    const res = response();
    await validatePromoCode(
      { body: { code: 'SAVE10', subtotal: 100 } } as never,
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(PromoCode.findOne).not.toHaveBeenCalled();
  });

  it('only validates tenant-owned or explicitly global codes', async () => {
    const tenantId = new Types.ObjectId();
    (PromoCode.findOne as jest.Mock).mockResolvedValue(null);
    const res = response();

    await validatePromoCode(
      { tenant: { _id: tenantId }, body: { code: ' save10 ', subtotal: 100 } } as never,
      res,
      jest.fn()
    );

    expect(PromoCode.findOne).toHaveBeenCalledWith(expect.objectContaining({
      code: 'SAVE10',
      $or: [
        { tenantId },
        { tenantId: null },
        { tenantId: { $exists: false } },
      ],
    }));
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('scopes a super-admin list to the tenant selected in the site picker', async () => {
    const tenantId = new Types.ObjectId();
    const lean = jest.fn().mockResolvedValue([]);
    const limit = jest.fn().mockReturnValue({ lean });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    (PromoCode.find as jest.Mock).mockReturnValue({ sort });
    (PromoCode.countDocuments as jest.Mock).mockResolvedValue(0);

    await getPromoCodes(
      {
        tenant: { _id: tenantId },
        user: { role: 'super-admin', assignedTenants: [] },
        query: {},
      } as never,
      response(),
      jest.fn()
    );

    expect(PromoCode.find).toHaveBeenCalledWith({ tenantId: { $in: [tenantId.toString()] } });
    expect(PromoCode.countDocuments).toHaveBeenCalledWith({ tenantId: { $in: [tenantId.toString()] } });
  });
});
