import { Attraction } from '../models/Attraction';
import { Booking } from '../models/Booking';
import { Destination } from '../models/Destination';
import { EventRsvp } from '../models/EventRsvp';
import { PromoCode } from '../models/PromoCode';
import { Review } from '../models/Review';
import { SpecialOffer } from '../models/SpecialOffer';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import {
  getAttractions,
  getResellableAttractions,
} from '../controllers/attractions.controller';
import { getAllBookings } from '../controllers/bookings.controller';
import { getDestinations } from '../controllers/destinations.controller';
import { getPromoCodes } from '../controllers/promo.controller';
import { getAdminReviews } from '../controllers/reviews.controller';
import { getAllRsvps } from '../controllers/rsvps.controller';
import { getAllOffers } from '../controllers/specialOffers.controller';
import { getTenants } from '../controllers/tenants.controller';
import { getTravelers, getUsers } from '../controllers/users.controller';
import { specialOffersListQuerySchema } from '../routes/specialOffers.routes';
import {
  escapeRegex,
  MAX_REGEX_SEARCH_LENGTH,
  searchRegexValue,
} from '../utils/helpers';
import { regexSearchSchema } from '../utils/validators';

jest.mock('../models/Attraction', () => ({
  Attraction: {
    aggregate: jest.fn(),
    countDocuments: jest.fn(),
    distinct: jest.fn(),
    find: jest.fn(),
  },
}));
jest.mock('../models/Booking', () => ({
  Booking: { collection: { name: 'bookings' }, countDocuments: jest.fn(), find: jest.fn() },
}));
jest.mock('../models/Destination', () => ({
  Destination: { countDocuments: jest.fn(), find: jest.fn() },
}));
jest.mock('../models/EventRsvp', () => ({
  EventRsvp: { countDocuments: jest.fn(), find: jest.fn() },
}));
jest.mock('../models/PromoCode', () => ({
  PromoCode: { countDocuments: jest.fn(), find: jest.fn() },
}));
jest.mock('../models/Review', () => ({
  Review: { countDocuments: jest.fn(), find: jest.fn() },
}));
jest.mock('../models/SpecialOffer', () => ({
  SpecialOffer: { countDocuments: jest.fn(), find: jest.fn() },
}));
jest.mock('../models/Tenant', () => ({
  Tenant: { countDocuments: jest.fn(), find: jest.fn() },
}));
jest.mock('../models/User', () => ({
  User: { aggregate: jest.fn(), countDocuments: jest.fn(), find: jest.fn() },
}));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
};

const listChain = (rows: unknown[] = []) => {
  const chain: Record<string, jest.Mock> = {};
  for (const method of ['select', 'populate', 'sort', 'skip', 'limit']) {
    chain[method] = jest.fn().mockReturnValue(chain);
  }
  chain.lean = jest.fn().mockResolvedValue(rows);
  return chain;
};

const collectRegexes = (value: unknown, found: RegExp[] = []): RegExp[] => {
  if (value instanceof RegExp) {
    found.push(value);
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRegexes(item, found);
    return found;
  }
  if (!value || typeof value !== 'object') return found;

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key === '$regex') {
      found.push(nested instanceof RegExp ? nested : new RegExp(String(nested), 'i'));
    } else {
      collectRegexes(nested, found);
    }
  }
  return found;
};

const runController = async (
  handler: (...args: any[]) => Promise<void>,
  request: Record<string, unknown>
) => {
  const res = response();
  const next = jest.fn();
  await handler(request as never, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(200);
};

type SearchHarness = {
  name: string;
  run: (input: string) => Promise<RegExp[]>;
};

const harnesses: SearchHarness[] = [
  {
    name: 'GET /attractions?destination=',
    run: async (input) => {
      let query: unknown;
      (Attraction.find as jest.Mock).mockImplementation((value) => {
        query = value;
        return listChain();
      });
      (Attraction.countDocuments as jest.Mock).mockResolvedValue(0);
      await runController(getAttractions, { query: { page: 1, limit: 20, destination: input } });
      return collectRegexes(query);
    },
  },
  {
    name: 'GET /attractions/resellable?search=',
    run: async (input) => {
      const queries: unknown[] = [];
      (Tenant.find as jest.Mock).mockImplementation((value) => {
        queries.push(value);
        return listChain();
      });
      (Attraction.find as jest.Mock).mockImplementation((value) => {
        queries.push(value);
        return listChain();
      });
      (Attraction.countDocuments as jest.Mock).mockResolvedValue(0);
      await runController(getResellableAttractions, {
        user: { role: 'super-admin' },
        query: { page: 1, limit: 20, search: input },
      });
      return collectRegexes(queries);
    },
  },
  {
    name: 'GET /bookings/admin?search=',
    run: async (input) => {
      let query: unknown;
      (Booking.find as jest.Mock).mockImplementation((value) => {
        query = value;
        return listChain();
      });
      (Booking.countDocuments as jest.Mock).mockResolvedValue(0);
      await runController(getAllBookings, {
        user: { role: 'super-admin', assignedTenants: [] },
        query: { page: 1, limit: 20, search: input },
      });
      return collectRegexes(query);
    },
  },
  {
    name: 'GET /destinations?search=',
    run: async (input) => {
      let query: unknown;
      (Destination.find as jest.Mock).mockImplementation((value) => {
        query = value;
        return listChain();
      });
      (Destination.countDocuments as jest.Mock).mockResolvedValue(0);
      (Attraction.aggregate as jest.Mock).mockResolvedValue([]);
      await runController(getDestinations, {
        query: { page: 1, limit: 20, search: input, includeCount: 'true' },
      });
      return collectRegexes(query);
    },
  },
  {
    name: 'GET /promo-codes?search=',
    run: async (input) => {
      let query: unknown;
      (PromoCode.find as jest.Mock).mockImplementation((value) => {
        query = value;
        return listChain();
      });
      (PromoCode.countDocuments as jest.Mock).mockResolvedValue(0);
      await runController(getPromoCodes, {
        user: { role: 'super-admin' },
        query: { page: 1, limit: 20, search: input },
      });
      return collectRegexes(query);
    },
  },
  {
    name: 'GET /reviews/admin?search=',
    run: async (input) => {
      let query: unknown;
      (Review.find as jest.Mock).mockImplementation((value) => {
        query = value;
        return listChain();
      });
      (Review.countDocuments as jest.Mock).mockResolvedValue(0);
      await runController(getAdminReviews, {
        user: { role: 'super-admin' },
        query: { page: 1, limit: 20, search: input },
      });
      return collectRegexes(query);
    },
  },
  {
    name: 'GET /rsvps/admin?search=',
    run: async (input) => {
      let query: unknown;
      (EventRsvp.find as jest.Mock).mockImplementation((value) => {
        query = value;
        return listChain();
      });
      (EventRsvp.countDocuments as jest.Mock).mockResolvedValue(0);
      await runController(getAllRsvps, {
        user: { role: 'super-admin', assignedTenants: [] },
        query: { page: 1, limit: 20, search: input },
      });
      return collectRegexes(query);
    },
  },
  {
    name: 'GET /special-offers?search=',
    run: async (input) => {
      let query: unknown;
      (SpecialOffer.find as jest.Mock).mockImplementation((value) => {
        query = value;
        return listChain();
      });
      (SpecialOffer.countDocuments as jest.Mock).mockResolvedValue(0);
      await runController(getAllOffers, {
        user: { role: 'super-admin' },
        query: { page: 1, limit: 20, search: input },
      });
      return collectRegexes(query);
    },
  },
  {
    name: 'GET /tenants?search=',
    run: async (input) => {
      let query: unknown;
      (Tenant.find as jest.Mock).mockImplementation((value) => {
        query = value;
        return listChain();
      });
      (Tenant.countDocuments as jest.Mock).mockResolvedValue(0);
      await runController(getTenants, {
        user: { role: 'super-admin' },
        query: { page: 1, limit: 20, search: input },
      });
      return collectRegexes(query);
    },
  },
  {
    name: 'GET /users?search=',
    run: async (input) => {
      let query: unknown;
      (User.find as jest.Mock).mockImplementation((value) => {
        query = value;
        return listChain();
      });
      (User.countDocuments as jest.Mock).mockResolvedValue(0);
      await runController(getUsers, {
        user: { role: 'super-admin', assignedTenants: [] },
        query: { page: 1, limit: 20, search: input },
      });
      return collectRegexes(query);
    },
  },
  {
    name: 'GET /users/travelers?search=',
    run: async (input) => {
      let pipeline: unknown;
      (User.aggregate as jest.Mock).mockImplementation((value) => {
        pipeline = value;
        return Promise.resolve([]);
      });
      await runController(getTravelers, {
        user: { role: 'super-admin', assignedTenants: [] },
        query: { limit: 20, search: input },
      });
      return collectRegexes(pipeline);
    },
  },
];

describe('regex-backed search input', () => {
  it('escapes every regex metacharacter while preserving ordinary text', () => {
    expect(escapeRegex('a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o')).toBe(
      'a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o'
    );
    expect(searchRegexValue('  Summer Offer  ')).toBe('Summer Offer');
  });

  it.each([
    ['.', 'A'],
    ['^a', 'alpha'],
    ['[', 'anything'],
  ])('treats %s as literal text rather than an executable pattern', (input, subject) => {
    const regex = new RegExp(searchRegexValue(input), 'i');
    expect(regex.test(subject)).toBe(false);
    expect(regex.test(input)).toBe(true);
  });

  it('bounds long input by Unicode code points and ignores non-string values', () => {
    const value = `${'x'.repeat(MAX_REGEX_SEARCH_LENGTH)}tail`;
    expect(searchRegexValue(value)).toBe('x'.repeat(MAX_REGEX_SEARCH_LENGTH));
    expect(Array.from(searchRegexValue('🌊'.repeat(MAX_REGEX_SEARCH_LENGTH + 1)))).toHaveLength(
      MAX_REGEX_SEARCH_LENGTH
    );
    expect(searchRegexValue(['summer'])).toBe('');
    expect(searchRegexValue(undefined)).toBe('');
  });

  it('enforces the same HTTP-boundary maximum used by regex-backed list routes', () => {
    expect(regexSearchSchema.parse('x'.repeat(MAX_REGEX_SEARCH_LENGTH))).toHaveLength(
      MAX_REGEX_SEARCH_LENGTH
    );
    expect(regexSearchSchema.safeParse('x'.repeat(MAX_REGEX_SEARCH_LENGTH + 1)).success).toBe(false);
    expect(regexSearchSchema.safeParse('🌊'.repeat(MAX_REGEX_SEARCH_LENGTH)).success).toBe(true);
    expect(regexSearchSchema.safeParse('🌊'.repeat(MAX_REGEX_SEARCH_LENGTH + 1)).success).toBe(false);
    expect(regexSearchSchema.safeParse(['Summer', 'Winter']).success).toBe(false);
  });
});

describe('special-offers list search contract', () => {
  it.each(['Summer', '.', '^a', '['])('keeps the route query parameter as bounded text: %s', (search) => {
    expect(specialOffersListQuerySchema.parse({ search }).search).toBe(search);
  });

  it('rejects overlong and repeated query values at the route boundary', () => {
    expect(
      specialOffersListQuerySchema.safeParse({ search: 'x'.repeat(MAX_REGEX_SEARCH_LENGTH + 1) }).success
    ).toBe(false);
    expect(specialOffersListQuerySchema.safeParse({ search: ['Summer', 'Winter'] }).success).toBe(false);
  });

  it.each(['active', 'expired', 'upcoming', 'inactive'] as const)(
    'preserves the supported %s status filter',
    (status) => {
      expect(specialOffersListQuerySchema.parse({ status }).status).toBe(status);
    }
  );

  it('rejects unsupported status filters', () => {
    expect(specialOffersListQuerySchema.safeParse({ status: 'all' }).success).toBe(false);
  });
});

describe.each(harnesses)('$name controller query', ({ run }) => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['Summer', 'Summer offer', 'Winter offer'],
    ['.', '.', 'Any title'],
    ['^a', '^a', 'alpha'],
    ['[', '[', 'Any title'],
  ])('treats %s as literal text', async (input, literalSubject, patternSubject) => {
    const regexes = await run(input);
    expect(regexes.length).toBeGreaterThan(0);
    for (const regex of regexes) {
      expect(regex.test(literalSubject)).toBe(true);
      regex.lastIndex = 0;
      expect(regex.test(patternSubject)).toBe(false);
    }
  });

  it('bounds direct controller input even if route validation is bypassed', async () => {
    const regexes = await run(`${'x'.repeat(MAX_REGEX_SEARCH_LENGTH)}tail`);
    expect(regexes.length).toBeGreaterThan(0);
    for (const regex of regexes) {
      expect(regex.source).toBe('x'.repeat(MAX_REGEX_SEARCH_LENGTH));
    }
  });

  it.each(['', '   '])('does not construct a regex for blank input %#', async (input) => {
    expect(await run(input)).toEqual([]);
  });
});
