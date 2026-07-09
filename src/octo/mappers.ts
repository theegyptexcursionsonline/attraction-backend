// OCTO (octo.travel) supplier-API mappers — pure functions that map our domain
// (Tenant + Attraction) onto the OCTO Product / Supplier shapes, so channel
// managers, OTAs and resellers can pull our catalogue through the standard OCTO
// contract instead of a bespoke integration.
//
// Increment 1 = catalogue (supplier + products). Live availability and the
// booking lifecycle (reserve → confirm → cancel) land in the next increment.
//
// Money in OCTO is expressed in MINOR units (integer cents) + a currency.

export interface OctoTenantLike {
  _id?: unknown;
  slug?: string;
  name?: string;
  defaultLanguage?: string;
  defaultCurrency?: string;
  timezone?: string;
  contactInfo?: { email?: string; phone?: string; address?: string };
}

export interface OctoPricingOptionLike {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
}

export interface OctoEntryWindowLike {
  label?: string;
  startTime: string;
  endTime?: string;
}

export interface OctoAttractionLike {
  _id?: unknown;
  id?: string;
  slug?: string;
  title?: string;
  description?: string;
  images?: string[];
  duration?: string;
  priceFrom?: number;
  currency?: string;
  pricingOptions?: OctoPricingOptionLike[];
  entryWindows?: OctoEntryWindowLike[];
  instantConfirmation?: boolean;
  cancellationPolicy?: string;
  availability?: { type?: string };
}

const asId = (v: unknown): string => (v == null ? '' : String(v));
const minor = (n: number | undefined): number => Math.round((n || 0) * 100);

/** OCTO unit type inferred from a human pricing-option name (Adult / Child / …). */
export function octoUnitType(name?: string): string {
  const n = (name || '').toLowerCase();
  if (/infant|baby/.test(n)) return 'INFANT';
  if (/child|kid/.test(n)) return 'CHILD';
  if (/youth|teen/.test(n)) return 'YOUTH';
  if (/student/.test(n)) return 'STUDENT';
  if (/senior|elder/.test(n)) return 'SENIOR';
  if (/family/.test(n)) return 'FAMILY';
  if (/group/.test(n)) return 'GROUP';
  return 'ADULT';
}

export function toOctoSupplier(t: OctoTenantLike, endpoint = '') {
  return {
    id: asId(t._id) || t.slug || '',
    name: t.name || 'Foxes Attractions',
    endpoint,
    contact: {
      website: null,
      email: t.contactInfo?.email || null,
      telephoneNumber: t.contactInfo?.phone || null,
      address: t.contactInfo?.address || null,
    },
    locale: t.defaultLanguage || 'en',
    timeZone: t.timezone || 'Africa/Cairo',
    currencies: [t.defaultCurrency || 'USD'],
  };
}

export function toOctoProduct(a: OctoAttractionLike, t: OctoTenantLike) {
  const currency = a.currency || t.defaultCurrency || 'USD';
  const startTimes = (a.entryWindows || []).map((w) => w.startTime).filter(Boolean);
  const availabilityType =
    a.availability?.type === 'time-slots' && startTimes.length ? 'START_TIME' : 'OPENING_HOURS';

  const source =
    a.pricingOptions && a.pricingOptions.length
      ? a.pricingOptions
      : [{ id: 'adult', name: 'Adult', price: a.priceFrom || 0 }];

  const units = source.map((po) => ({
    id: po.id,
    internalName: po.name,
    reference: po.id,
    type: octoUnitType(po.name),
    restrictions: {
      minAge: 0,
      maxAge: 99,
      idRequired: false,
      minQuantity: 0,
      maxQuantity: null,
      paxCount: 1,
      accompaniedBy: [],
    },
    pricingFrom: [
      {
        original: minor(po.originalPrice ?? po.price),
        retail: minor(po.price),
        net: minor(po.price),
        currency,
        currencyPrecision: 2,
        includedTaxes: [],
      },
    ],
  }));

  return {
    id: asId(a._id) || a.id || a.slug || '',
    internalName: a.title || '',
    reference: a.slug || '',
    locale: t.defaultLanguage || 'en',
    timeZone: t.timezone || 'Africa/Cairo',
    allowFreesale: false,
    instantConfirmation: a.instantConfirmation !== false,
    instantDelivery: true,
    availabilityRequired: true,
    availabilityType,
    deliveryFormats: ['PDF_URL', 'QRCODE'],
    deliveryMethods: ['TICKET'],
    redemptionMethod: 'DIGITAL',
    options: [
      {
        id: 'DEFAULT',
        default: true,
        internalName: a.title || '',
        reference: 'default',
        // START_TIME products expose their bookable start times; OPENING_HOURS
        // products are all-day and use a single placeholder start.
        availabilityLocalStartTimes: availabilityType === 'START_TIME' ? startTimes : ['00:00'],
        cancellationCutoff: '24 hours',
        cancellationCutoffAmount: 24,
        cancellationCutoffUnit: 'hour',
        requiredContactFields: ['firstName', 'lastName', 'emailAddress'],
        restrictions: { minUnits: 1, maxUnits: null },
        units,
      },
    ],
  };
}

// ── Availability ────────────────────────────────────────────────────────────
// OCTO availability id is the local datetime (or the date for all-day products).
export function octoAvailabilityId(localDate: string, startTime: string | null): string {
  return startTime ? `${localDate}T${startTime}:00` : localDate;
}

export interface OctoAvailabilityInput {
  localDate: string; // YYYY-MM-DD
  startTime: string | null; // 'HH:mm' for START_TIME, null for all-day
  vacancies: number;
  capacity: number;
  blocked?: boolean;
}

export function toOctoAvailability(a: OctoAvailabilityInput) {
  const vacancies = Math.max(0, a.vacancies);
  const available = !a.blocked && vacancies > 0;
  const status = a.blocked ? 'CLOSED' : vacancies > 0 ? 'AVAILABLE' : 'SOLD_OUT';
  return {
    id: octoAvailabilityId(a.localDate, a.startTime),
    localDateTimeStart: a.startTime ? `${a.localDate}T${a.startTime}:00` : `${a.localDate}T00:00:00`,
    localDateTimeEnd: a.startTime ? `${a.localDate}T${a.startTime}:00` : `${a.localDate}T23:59:59`,
    allDay: !a.startTime,
    available,
    status,
    vacancies,
    capacity: a.capacity,
    maxUnits: vacancies,
    utcCutoffAt: null,
    openingHours: [],
  };
}

// ── Booking ─────────────────────────────────────────────────────────────────
export interface OctoUnitItemLike {
  unitId: string;
  quantity: number;
}
export interface OctoBookingLike {
  uuid: string;
  status: string; // ON_HOLD | CONFIRMED | CANCELLED | EXPIRED
  productId: string;
  optionId?: string;
  availabilityId?: string | null;
  currency: string;
  totalMinor: number;
  unitItems?: OctoUnitItemLike[];
  reference?: string | null;
  utcHoldExpiration?: string | null;
  contact?: { firstName?: string; lastName?: string; emailAddress?: string; phoneNumber?: string };
}

export function toOctoBooking(b: OctoBookingLike) {
  return {
    uuid: b.uuid,
    status: b.status,
    productId: b.productId,
    optionId: b.optionId || 'DEFAULT',
    availabilityId: b.availabilityId ?? null,
    supplierReference: b.reference ?? null,
    utcHoldExpiration: b.utcHoldExpiration ?? null,
    unitItems: (b.unitItems || []).flatMap((u, gi) =>
      Array.from({ length: Math.max(0, u.quantity) }, (_, i) => ({
        uuid: `${b.uuid}-${gi}-${i}`,
        unitId: u.unitId,
      })),
    ),
    contact: {
      fullName: [b.contact?.firstName, b.contact?.lastName].filter(Boolean).join(' ') || null,
      firstName: b.contact?.firstName ?? null,
      lastName: b.contact?.lastName ?? null,
      emailAddress: b.contact?.emailAddress ?? null,
      phoneNumber: b.contact?.phoneNumber ?? null,
    },
    pricing: {
      currency: b.currency,
      currencyPrecision: 2,
      retail: b.totalMinor,
      net: b.totalMinor,
    },
  };
}
