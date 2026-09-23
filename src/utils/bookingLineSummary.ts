import { addonLineTotal, addonQuantity } from './bookingAddons';

/**
 * What a guest actually booked on each line, read from the stored booking.
 *
 * Notifications, tickets and receipts describe the saved booking only: names,
 * quantities and amounts come from the booking's server-priced line items,
 * never from the storefront request.
 */
export interface BookedAddonSummary {
  name: string;
  quantity: number;
  /** Catalogue unit price recorded when the booking was priced. */
  unitPrice: number;
  /** Amount charged for this add-on on this line. */
  lineTotal: number;
}

export interface BookingLineSummary {
  optionName: string;
  date: string;
  time?: string;
  adults: number;
  children: number;
  infants: number;
  addons: BookedAddonSummary[];
}

type StoredLine = {
  optionName?: string | null;
  date?: string | null;
  time?: string | null;
  quantities?: { adults?: number | null; children?: number | null; infants?: number | null } | null;
  addons?: Array<{ name?: string | null; price?: number | null; quantity?: number | null; totalPrice?: number | null } | null> | null;
} | null | undefined;

const count = (value: unknown): number => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
};

const amount = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0;
};

export const bookingLineSummaries = (items: StoredLine[] | null | undefined): BookingLineSummary[] =>
  (items || []).filter(Boolean).map((item) => ({
    optionName: String(item?.optionName || '').trim(),
    date: String(item?.date || ''),
    ...(item?.time ? { time: String(item.time) } : {}),
    adults: count(item?.quantities?.adults),
    children: count(item?.quantities?.children),
    infants: count(item?.quantities?.infants),
    addons: (item?.addons || []).filter(Boolean).map((addon) => ({
      name: String(addon?.name || '').trim() || 'Add-on',
      quantity: addonQuantity(addon),
      unitPrice: amount(addon?.price),
      // The stored line total is what was charged; legacy rows derive it the same way pricing did.
      lineTotal: typeof addon?.totalPrice === 'number' && Number.isFinite(addon.totalPrice)
        ? amount(addon.totalPrice) : addonLineTotal(addon),
    })),
  }));

export const bookingGuestTotals = (lines: BookingLineSummary[]): { adults: number; children: number; infants: number } =>
  lines.reduce((totals, line) => ({
    adults: totals.adults + line.adults,
    children: totals.children + line.children,
    infants: totals.infants + line.infants,
  }), { adults: 0, children: 0, infants: 0 });

/** Ticket PDF add-on list across every booked line, not only the first. */
export const bookingTicketAddons = (lines: BookingLineSummary[]) => lines.flatMap((line) => line.addons.map((addon) => ({
  name: addon.name,
  price: addon.unitPrice,
  quantity: addon.quantity,
  totalPrice: addon.lineTotal,
  lineTotal: addon.lineTotal,
})));
