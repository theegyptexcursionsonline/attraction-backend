/**
 * The reader behind `eeo-snapshot.json`: one trip the client publishes on egypt-excursionsonline.com, read from its
 * public page and its public booking API, in the snapshot's own shape (`EeoTour`). Read-only: it sends GET requests
 * and nothing else, one trip at a time, and the caller paces them.
 *
 * The page is a Next.js page whose record arrives in the React Server Components payload (`self.__next_f.push`)
 * rather than as JSON: the reader joins that payload, finds the trip's own record by its address, and takes the
 * facts the snapshot keeps (title, length, languages, inclusions, schedule, currency). The booking options and the
 * extras are taken from the booking API, which is what a guest's booking is priced against, so the snapshot matches
 * what `eeoLiveDrift` later compares it with.
 */

import { EEO_BASE, type EeoAddon, type EeoGuestPrices, type EeoOption, type EeoTour } from './eeo-source';

type Doc = Record<string, unknown>;

const PUSH = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;

/** The page's Server Components payload, as one decoded string. Empty when the page carries none. */
export function serverPayload(html: string): string {
  const chunks = [...html.matchAll(PUSH)].map((match) => match[1]);
  if (!chunks.length) return '';
  return JSON.parse(`"${chunks.join('')}"`) as string;
}

/**
 * Where the JSON value that opens at `start` ends, reading strings properly so a brace inside a description never
 * ends an object early. -1 when it does not close.
 */
function valueEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

/**
 * The trip's own record in the payload: the innermost object that carries the address as its own `slug` and is a
 * trip (it has booking options or a price). Lists and cards elsewhere on the page carry the same slug in smaller
 * objects, so the fullest match wins.
 */
export function tripRecord(payload: string, slug: string): Doc | null {
  const needle = `"slug":${JSON.stringify(slug)}`;
  let best: Doc | null = null;
  let bestSize = 0;
  for (let at = payload.indexOf(needle); at >= 0; at = payload.indexOf(needle, at + needle.length)) {
    // Walk back to each enclosing brace until one parses as an object whose own slug is this one.
    for (let open = payload.lastIndexOf('{', at), tries = 0; open >= 0 && tries < 400; open = payload.lastIndexOf('{', open - 1), tries += 1) {
      const end = valueEnd(payload, open);
      if (end <= at) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(payload.slice(open, end)); } catch { continue; }
      if (!parsed || typeof parsed !== 'object' || (parsed as Doc).slug !== slug) continue;
      const record = parsed as Doc;
      if (('bookingOptions' in record || 'price' in record) && end - open > bestSize) {
        best = record;
        bestSize = end - open;
      }
      break;
    }
  }
  return best;
}

const strings = (items: unknown): string[] => (Array.isArray(items) ? items : [])
  .filter((item): item is string => typeof item === 'string');

const money = (prices: unknown): EeoGuestPrices => {
  const value = (prices && typeof prices === 'object' ? prices : {}) as Record<string, unknown>;
  return {
    adult: Number(value.adult ?? 0),
    ...(value.child !== undefined ? { child: Number(value.child) } : {}),
    ...(value.infant !== undefined ? { infant: Number(value.infant) } : {}),
  };
};

/** A booking option from the booking API, in the snapshot's shape. */
export function snapshotOption(option: Doc): EeoOption {
  return {
    id: String(option.id),
    pricingKey: String(option.pricingKey),
    title: String(option.title || ''),
    type: String(option.type || ''),
    description: String(option.description || ''),
    ...(option.duration ? { duration: String(option.duration) } : {}),
    guestPrices: money(option.guestPrices),
    maxCapacity: option.maxCapacity === undefined || option.maxCapacity === null ? null : Number(option.maxCapacity),
    timeSlots: (Array.isArray(option.timeSlots) ? option.timeSlots : []).map((slot: Doc) => ({
      id: String(slot.id),
      time: String(slot.time),
      ...(slot.guestPrices ? { guestPrices: money(slot.guestPrices) } : {}),
    })),
  };
}

/** An extra from the booking API, in the snapshot's shape. */
export function snapshotAddon(addon: Doc): EeoAddon {
  return {
    id: String(addon.id),
    title: String(addon.title || ''),
    description: String(addon.description || ''),
    price: Number(addon.price),
    perGuest: addon.perGuest === true,
    bookingOptionKeys: strings(addon.bookingOptionKeys),
    required: addon.required === true,
  };
}

/** The trip's page facts the snapshot keeps, from its page record. */
export function snapshotDetail(record: Doc): EeoTour['detail'] {
  const summary = (record.pricingSummary && typeof record.pricingSummary === 'object' ? record.pricingSummary : {}) as Doc;
  return {
    title: String(record.title || ''),
    duration: String(record.duration || ''),
    languages: strings(record.languages),
    whatsIncluded: strings(record.whatsIncluded),
    ...(strings(record.includes).length ? { includes: strings(record.includes) } : {}),
    whatsNotIncluded: strings(record.whatsNotIncluded),
    whatToBring: strings(record.whatToBring),
    itinerary: (Array.isArray(record.itinerary) ? record.itinerary : []).map((step: Doc) => ({
      title: String(step.title || ''),
      description: String(step.description || ''),
      ...(step.duration ? { duration: String(step.duration) } : {}),
    })),
    pricingSummary: { currency: String(summary.currency || '') },
  };
}

export type TextFetch = (url: string) => Promise<string>;
export type JsonGet = (url: string) => Promise<unknown>;

const getText: TextFetch = async (url) => {
  const response = await fetch(url, { headers: { accept: 'text/html' }, redirect: 'follow' });
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  return response.text();
};

const getJson: JsonGet = async (url) => {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  return response.json();
};

/**
 * One trip as the snapshot keeps it, read now. Fails closed: a page without the trip's record, a record without an
 * id, or a booking API that does not answer with lists stops the read, so nothing half-read reaches the snapshot.
 */
export async function readEeoTour(slug: string, readAt: string, fetchText: TextFetch = getText, fetchJson: JsonGet = getJson): Promise<EeoTour> {
  const record = tripRecord(serverPayload(await fetchText(`${EEO_BASE}/${slug}`)), slug);
  if (!record) throw new Error(`${slug}: the page carries no record for this trip.`);
  const id = String(record._id || '');
  if (!/^[a-f0-9]{24}$/.test(id)) throw new Error(`${slug}: the record has no trip id.`);
  const options = await fetchJson(`${EEO_BASE}/api/tours/${id}/options`);
  const addons = await fetchJson(`${EEO_BASE}/api/tours/${id}/addons`);
  if (!Array.isArray(options) || !Array.isArray(addons)) throw new Error(`${slug}: the booking API did not answer with lists.`);
  return {
    slug,
    id,
    readAt,
    detail: snapshotDetail(record),
    options: options.map((option) => snapshotOption(option as Doc)),
    addons: addons.map((addon) => snapshotAddon(addon as Doc)),
  };
}
