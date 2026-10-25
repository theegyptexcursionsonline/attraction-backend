/**
 * Trips the client publishes on its own main site, egypt-excursionsonline.com, for network sites whose place has
 * no programme on the network (Sharm el-Sheikh's reefs, Fayoum: batch B02, 24 October 2026). The seed copies them
 * the way it copies a network programme. The facts come from a dated snapshot of the published record, read
 * through the site's public pages and booking API (`eeo-snapshot.json`), and before any write they are checked
 * against the live booking options: a price, a departure or an extra that changed since the snapshot stops the
 * run until the snapshot is read again. Nothing here is typed by hand.
 */

export const EEO_SOURCE = 'egypt-excursions-online';
export const EEO_BASE = 'https://egypt-excursionsonline.com';

export interface EeoGuestPrices { adult: number; child?: number; infant?: number }

export interface EeoOption {
  id: string;
  pricingKey: string;
  title: string;
  type: string;
  description?: string;
  duration?: string;
  guestPrices: EeoGuestPrices;
  timeSlots?: Array<{ id: string; time: string; guestPrices?: EeoGuestPrices }>;
  maxCapacity?: number | null;
}

export interface EeoAddon {
  id: string;
  title: string;
  description?: string;
  price: number;
  perGuest: boolean;
  bookingOptionKeys?: string[];
  required?: boolean;
}

export interface EeoTour {
  slug: string;
  id: string;
  /** When this trip was read, for a programme added to the snapshot after it was first taken. */
  readAt?: string;
  detail: {
    title: string;
    duration?: string;
    languages?: string[];
    whatsIncluded?: string[];
    /** Where the record keeps its inclusions when `whatsIncluded` is empty (B03's Giza trips, 25 October 2026). */
    includes?: string[];
    whatsNotIncluded?: string[];
    whatToBring?: string[];
    itinerary?: Array<{ title?: string; description?: string; duration?: string }>;
    pricingSummary?: { currency?: string };
  };
  options: EeoOption[];
  addons: EeoAddon[];
}

export interface EeoSnapshot {
  readAt: string;
  source: string;
  tours: EeoTour[];
}

type Doc = Record<string, unknown>;

const strings = (items: unknown): string[] => (Array.isArray(items) ? items : [])
  .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  .map((item) => item.trim());

const sameMoney = (a: unknown, b: unknown) => Math.abs(Number(a ?? 0) - Number(b ?? 0)) < 0.005;
const times = (option: EeoOption) => (option.timeSlots || []).map((slot) => slot.time).sort().join(',');

/**
 * What the published page shows under "What's included". The record keeps that list in `whatsIncluded` or,
 * when that is empty, in `includes`, and the client's own page reads whichever is filled; every Giza trip of
 * batch B03 fills only the second. Never both: the fuller field wins, so nothing is listed twice.
 */
const publishedInclusions = (detail: EeoTour['detail']): string[] => {
  const named = strings(detail.whatsIncluded);
  return named.length ? named : strings(detail.includes);
};

/**
 * The programme document the seed reads (the network's own trip shape), built from one EEO trip and the booking
 * options a network trip sells. Fails closed: a missing currency or option, an option that is not priced per
 * person, a slot priced apart from its option, options sold together that leave at different times, or a child
 * price above the adult one stops the run. An extra is offered only when it applies to every option sold; a
 * per-guest extra stays per guest.
 */
export function eeoProgramme(tour: EeoTour, sold: string[], category: string): Doc {
  const where = `${EEO_SOURCE}/${tour.slug}`;
  const currency = String(tour.detail.pricingSummary?.currency || '').trim().toUpperCase();
  if (!currency) throw new Error(`${where}: the published record names no currency.`);
  if (!sold.length) throw new Error(`${where}: no booking option is sold.`);
  const options = sold.map((key) => {
    const option = tour.options.find((item) => item.pricingKey === key);
    if (!option) throw new Error(`${where}: option "${key}" is missing from the published record.`);
    if (option.type !== 'Per Person') throw new Error(`${where}: option "${key}" is priced "${option.type}", not per person.`);
    const { adult, child, infant } = option.guestPrices || ({} as EeoGuestPrices);
    if (!(Number(adult) > 0)) throw new Error(`${where}: option "${key}" has no adult price.`);
    if (Number(child) > Number(adult)) throw new Error(`${where}: option "${key}" charges a child more than an adult.`);
    for (const slot of option.timeSlots || []) {
      if (slot.guestPrices && (!sameMoney(slot.guestPrices.adult, adult) || !sameMoney(slot.guestPrices.child, child) || !sameMoney(slot.guestPrices.infant, infant))) {
        throw new Error(`${where}: option "${key}" prices its ${slot.time} departure apart from the option.`);
      }
    }
    return option;
  });
  if (new Set(options.map(times)).size > 1) throw new Error(`${where}: the options sold together leave at different times.`);

  const pricingOptions = options.map((option) => ({
    id: option.pricingKey,
    name: option.title.trim(),
    description: String(option.description || '').trim(),
    price: Number(option.guestPrices.adult),
    // A child price equal to the adult one is the adult price; the pricing falls back to it by itself.
    ...(Number(option.guestPrices.child) > 0 && Number(option.guestPrices.child) < Number(option.guestPrices.adult) ? { childPrice: Number(option.guestPrices.child) } : {}),
    ...(Number(option.guestPrices.infant) > 0 ? { infantPrice: Number(option.guestPrices.infant) } : {}),
    pricingModel: 'per-person',
  }));
  const entryWindows = (options[0].timeSlots || []).map((slot) => ({ label: slot.time, startTime: slot.time }));
  const addons = tour.addons
    .filter((addon) => !addon.required && sold.every((key) => (addon.bookingOptionKeys || []).includes(key)))
    .map((addon) => ({ id: addon.id, name: addon.title.trim(), description: String(addon.description || '').trim(), price: Number(addon.price), perGuest: addon.perGuest === true }));

  return {
    slug: tour.slug,
    currency,
    category,
    duration: options.length === 1 && options[0].duration ? options[0].duration : tour.detail.duration,
    languages: strings(tour.detail.languages),
    pricingOptions,
    addons,
    entryWindows,
    inclusions: publishedInclusions(tour.detail),
    exclusions: strings(tour.detail.whatsNotIncluded),
    whatToBring: strings(tour.detail.whatToBring),
    itinerary: (tour.detail.itinerary || [])
      .filter((step) => String(step.title || '').trim())
      .map((step) => ({ duration: String(step.duration || '').trim(), title: String(step.title).trim(), description: String(step.description || '').trim() })),
    availability: { type: entryWindows.length ? 'time-slots' : 'date-only', advanceBooking: 30 },
  };
}

/** A per-guest extra must be sold per guest, and a per-booking one per booking. */
export function eeoAddonBasisProblems(programme: Doc, addonIds: string[], perPerson: string[] = []): string[] {
  const addons = (programme.addons as Array<{ id: string; name: string; perGuest: boolean }>) || [];
  return addonIds.flatMap((id) => {
    const addon = addons.find((item) => item.id === id);
    if (!addon) return [];
    const sellsPerGuest = perPerson.includes(id);
    return addon.perGuest === sellsPerGuest ? [] : [`${String(programme.slug)}: extra "${addon.name}" is charged ${addon.perGuest ? 'per guest' : 'per booking'} on the published record.`];
  });
}

export type JsonFetch = (url: string) => Promise<unknown>;

const defaultFetch: JsonFetch = async (url) => {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  return response.json();
};

/**
 * What changed on the live booking options since the snapshot, for the options and extras a trip sells.
 * Any difference refuses the run: the snapshot is read again and reviewed before the new facts are sold.
 */
export async function eeoLiveDrift(tour: EeoTour, sold: string[], addonIds: string[], fetchJson: JsonFetch = defaultFetch): Promise<string[]> {
  const where = `${EEO_SOURCE}/${tour.slug}`;
  const [liveOptions, liveAddons] = await Promise.all([
    fetchJson(`${EEO_BASE}/api/tours/${tour.id}/options`),
    fetchJson(`${EEO_BASE}/api/tours/${tour.id}/addons`),
  ]) as [EeoOption[], EeoAddon[]];
  const drift: string[] = [];
  for (const key of sold) {
    const snap = tour.options.find((item) => item.pricingKey === key);
    const live = (Array.isArray(liveOptions) ? liveOptions : []).find((item) => item.pricingKey === key);
    if (!snap || !live) { drift.push(`${where}: option "${key}" is no longer published.`); continue; }
    const prices = ['adult', 'child', 'infant'] as const;
    for (const guest of prices) {
      if (!sameMoney(snap.guestPrices?.[guest], live.guestPrices?.[guest])) drift.push(`${where}: option "${key}" ${guest} price ${snap.guestPrices?.[guest] ?? 0} is now ${live.guestPrices?.[guest] ?? 0}.`);
    }
    if (times(snap) !== times(live)) drift.push(`${where}: option "${key}" departures ${times(snap)} are now ${times(live)}.`);
    if (snap.type !== live.type) drift.push(`${where}: option "${key}" is now priced "${live.type}".`);
  }
  for (const id of addonIds) {
    const snap = tour.addons.find((item) => item.id === id);
    const live = (Array.isArray(liveAddons) ? liveAddons : []).find((item) => item.id === id);
    if (!snap || !live) { drift.push(`${where}: extra "${id}" is no longer published.`); continue; }
    if (!sameMoney(snap.price, live.price)) drift.push(`${where}: extra "${snap.title}" ${snap.price} is now ${live.price}.`);
    if (snap.perGuest !== live.perGuest) drift.push(`${where}: extra "${snap.title}" changed its charging basis.`);
  }
  return drift;
}
