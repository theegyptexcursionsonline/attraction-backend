/**
 * Pure helpers for preparing a network batch's Arabic records from a cloud session, where the database
 * is read only through the Railway ops-runner and a file written inside the runner does not survive it.
 *
 * - `flattenStrings` / `alignPairs` turn an English source template and its Arabic content (the same
 *   structure, as `translationSourceTemplate`, `presentationSourceTemplate` and the destination fields
 *   define it) into English -> Arabic pairs, keyed by each item's identity (id, index, url, key) rather
 *   than its position, so a reordered list never pairs the wrong strings.
 * - `logChunks` / `reassembleChunks` carry a large JSON payload through the deployment log: base64 of the
 *   UTF-8 JSON, cut into lines well under the log's line limit, each tagged with its sequence and the
 *   digest of the whole payload, so the reader can check nothing was lost or reordered.
 */
import { createHash } from 'crypto';

export type Pair = { path: string; en: string; ar: string };

/** Fields that identify an item inside a list; they are never translated and never paired. */
const IDENTITY_KEYS = new Set(['id', 'index', 'url', 'key', 'type']);

function itemKey(item: unknown, position: number): string {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const record = item as Record<string, unknown>;
    if (typeof record.id === 'string' && record.id) return `[id=${record.id}]`;
    if (typeof record.index === 'number') return `[i=${record.index}]`;
    if (typeof record.url === 'string' && record.url) return `[url=${record.url}]`;
    if (typeof record.key === 'string' && record.key) return `[key=${record.key}]`;
  }
  return `[${position}]`;
}

/** Every string leaf of a template or translation, by identity path. */
export function flattenStrings(value: unknown, path = '', out = new Map<string, string>()): Map<string, string> {
  if (typeof value === 'string') {
    out.set(path, value);
  } else if (Array.isArray(value)) {
    value.forEach((item, position) => flattenStrings(item, `${path}${itemKey(item, position)}`, out));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (IDENTITY_KEYS.has(key) && (typeof child === 'string' || typeof child === 'number')) continue;
      flattenStrings(child, path ? `${path}.${key}` : key, out);
    }
  }
  return out;
}

/** English -> Arabic pairs for every path both sides fill. Identical strings (untranslated) are skipped. */
export function alignPairs(source: unknown, translated: unknown): Pair[] {
  const english = flattenStrings(source);
  const arabic = flattenStrings(translated);
  const pairs: Pair[] = [];
  for (const [path, en] of english) {
    const ar = arabic.get(path);
    if (!en.trim() || typeof ar !== 'string' || !ar.trim() || ar.trim() === en.trim()) continue;
    pairs.push({ path, en, ar });
  }
  return pairs;
}

/** The path with its identities removed, so `itinerary[i=2].title` and `itinerary[i=5].title` compare. */
export function fieldOf(path: string): string {
  return path.replace(/\[[^\]]*\]/g, '[]');
}

/**
 * The shared terms whose Arabic must read the same on every site. Each entry is searched case-insensitively
 * in the English; the reader prints the existing renderings beside them.
 */
export const GLOSSARY_TERMS: readonly string[] = [
  // Places
  'Hurghada', 'Marsa Alam', 'Port Ghalib', 'Marsa Mubarak', 'Wadi El Gemal', 'Dolphin House', 'Orange Bay', 'Orange Island',
  'Giftun', 'Big Giftun', 'Small Giftun', 'larger Giftun', 'Paradise Island', 'Abu Minqar', 'Sataya', 'Erg Somaya', 'Shaab Sabina',
  'Ras Disha', 'Fanous', 'Fanadir', 'Abu Ramada', 'Abu Nugar', 'Careless', 'Erg Sabina', 'Abu Dabbab', 'Elphinstone',
  'Sharm El Luli', 'Cleopatra', 'Red Sea', 'Egypt', 'Bedouin', 'Qulaan', 'Hamata', 'Abu Ghusun',
  // Recurring phrases
  'does not name', 'not name', 'programme names', 'no boat calls', 'nothing calls', 'independent', 'park authority',
  'pickup', 'pick-up', 'drop-off', 'hotel', 'transfer', 'lunch', 'breakfast', 'dinner', 'buffet', 'seafood', 'snorkel',
  'mask', 'fins', 'life jacket', 'life vest', 'marine fee', 'marine tax', 'entry', 'parasail', 'banana', 'sofa', 'dugong',
  'turtle', 'dolphin', 'seagrass', 'reef', 'sandbank', 'island', 'bay', 'yacht', 'speedboat', 'sailing boat', 'boat',
  'jeep', 'desert', 'spring', 'temple', 'safety briefing', 'guide', 'crew', 'Children have their own price',
  'costs extra', 'cannot be booked', 'Dolphins are wild', 'Hold a place online', 'pay later', 'each page says',
  'soft drinks', 'water', 'scuba', 'dive', 'diving', 'glass', 'Home', 'Trips', 'About', 'FAQ', 'Contact',
  // Places and features the B14 facts name
  'Umm Gamar', 'Berenice', 'Hankorab', 'Abu Hamra', 'Moresby', 'Torfa', 'Gota', 'Erug', 'Magawish', 'Nemo Bay', 'Shenwa',
  'Marsa Shona', 'national park', 'nature reserve', 'Wadi El Gemal National Park', 'El Gouna', 'Hamata', 'gazetteer',
  'plateau', 'drop-off', 'pinnacle', 'erg', 'lagoon', 'drift', 'chimney', 'cleaning station', 'macro', 'wall', 'wreck',
  'soft coral', 'hard coral', 'coral garden', 'gorgonian', 'brain coral', 'table coral', 'anemone',
  // Species the B14 facts name
  'barracuda', 'trevally', 'tuna', 'fusilier', 'eagle ray', 'manta', 'shark', 'moray', 'lionfish', 'glassfish',
  'silverside', 'jackfish', 'snapper', 'grouper', 'wrasse', 'Napoleon', 'parrotfish', 'nudibranch', 'crocodilefish',
  'scorpionfish', 'stonefish', 'pipefish', 'octopus', 'goatfish', 'sweetlips', 'bannerfish', 'anthias', 'amberjack',
  'clownfish', 'pufferfish', 'butterflyfish', 'surgeonfish', 'unicornfish', 'hawksbill', 'green turtle', 'blue-spotted',
  'shrimp', 'kofta', 'nuggets', 'spaghetti', 'acacia', 'arak', 'rock carving', 'mine',
  // Places the B17 facts name: Sinai and the Gulf of Aqaba
  'Sharm El Sheikh', 'Dahab', 'Sinai', 'South Sinai', 'Sinai Trail', 'Ras Mohammed', 'White Island', 'Blue Hole',
  'Blue Lagoon', 'Coloured Canyon', 'Colored Canyon', 'Ras Abu Galum', 'Abu Galum', 'Ein Kid', 'Seven Pools',
  'Wadi Zaghara', 'Salama', 'Gulf of Aqaba', 'Nuweiba', 'Ras Shetan', 'St Catherine', 'Nabq',
  // Cairo and Giza
  'Cairo', 'Giza', 'Sakkara', 'Memphis', 'Sphinx', 'Great Sphinx', 'Pyramids', 'Step Pyramid', 'Djoser',
  'Khufu', 'Khafre', 'Menkaure', 'Valley Temple', 'Egyptian Museum', 'Tahrir Square', 'Old Cairo', 'Nile',
  'Ramses II', 'Eastern Desert', 'private day', 'driver', 'air-conditioned', 'entrance fee', 'entrance ticket',
  // El Gouna, Hurghada and the reefs the B17 facts name
  'El Gouna', 'Marsa Abu Galawa', 'Abu Galawa', 'Camel Reef', 'Shabruhr', 'Shabrur', 'Hamda', 'Kizan',
  'Gota Abu Ramada', 'Hebat Allah', 'Numidia', 'nitrox', 'two-tank', 'tank', 'dive guide', 'instructor',
  'certification', 'logbook', 'horseshoe',
  // The Marsa Alam coast and the open sea
  'Shaab Samadai', 'Samadai', 'Dolphin Reef', 'Gebel El Rosas', 'El Quseir', 'Lahami Bay', 'Wadi Lahmy',
  'Wadi Lahmi', 'Ras Hankorab', 'Fury Shoals', 'Daedalus', 'El Ikhwa', 'Big Brother', 'Little Brother',
  'Zabargad', 'St John', 'Ras Banas', 'Berenike', 'Ababda', 'Elba National Park', 'peridot', 'olivine',
  // Features and food the B17 facts name
  'mangrove', 'canyon', 'pool', 'oasis', 'camel', 'quad', 'jeep', 'calamari', 'salad', 'tea', 'Bedouin tent',
  'star', 'telescope', 'sunset', 'wind', 'kite',
  // The Hurghada bays, the Cairo and Luxor sites and the riding words the B18 facts name
  'Makadi Bay', 'Sahl Hasheesh', 'Soma Bay', 'Safaga', 'Luxor', 'Karnak', 'Hatshepsut', 'Colossi of Memnon',
  'Tutankhamun', 'Khan el-Khalili', 'Khan El Khalili', 'Al-Azhar', 'Hanging Church', 'Coptic', 'Saladin',
  'Citadel', 'Alabaster', 'Muhammad Ali', 'Talaat Harb', 'Alexandria', 'Egyptologist', 'Grand Egyptian Museum',
  'Sound and Light', 'Sound & Light', 'felucca', 'koshari', 'falafel', 'ful medames', 'pastries', 'street food',
  'horse riding', 'horseback', 'horse', 'pony', 'paddock', 'handler', 'stable', 'saddle', 'gallop', 'rider',
  'riding level', 'swim', 'swimming', 'wheelchair', 'stroller', 'Smart casual', 'tips', 'skip-the-line',
];

export function containsTerm(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase());
}

export const LOG_TAG = 'netar';
/** Base64 characters per log line: well under the deployment log's ~60 KB line limit. */
export const CHUNK_CHARS = 12000;

export type LogChunk = { t: typeof LOG_TAG; part: string; seq: number; of: number; sha: string; d: string };

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** One payload as log lines: base64 of its UTF-8 JSON, cut into `size`-character pieces. */
export function logChunks(part: string, payload: unknown, size = CHUNK_CHARS): LogChunk[] {
  const json = JSON.stringify(payload);
  const sha = sha256(json);
  const encoded = Buffer.from(json, 'utf8').toString('base64');
  const of = Math.max(1, Math.ceil(encoded.length / size));
  return Array.from({ length: of }, (_, seq) => ({ t: LOG_TAG, part, seq, of, sha, d: encoded.slice(seq * size, (seq + 1) * size) }));
}

/**
 * Every payload rebuilt from chunk records in any order (the log reader may return them out of order,
 * with numbers as strings). A part with a missing piece, or whose digest does not match, is an error.
 */
export function reassembleChunks(records: Array<Record<string, unknown>>): Record<string, unknown> {
  const parts = new Map<string, { of: number; sha: string; pieces: Map<number, string> }>();
  for (const record of records) {
    if (record.t !== LOG_TAG || typeof record.part !== 'string' || typeof record.d !== 'string' || typeof record.sha !== 'string') continue;
    const seq = Number(record.seq);
    const of = Number(record.of);
    const key = `${record.part}\u0000${record.sha}`;
    const entry = parts.get(key) || { of, sha: record.sha, pieces: new Map<number, string>() };
    entry.pieces.set(seq, record.d);
    parts.set(key, entry);
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of parts) {
    const part = key.split('\u0000')[0];
    if (part in out) throw new Error(`${part}: two different payloads share this name`);
    if (entry.pieces.size !== entry.of) throw new Error(`${part}: ${entry.pieces.size} of ${entry.of} pieces`);
    const encoded = Array.from({ length: entry.of }, (_, seq) => {
      const piece = entry.pieces.get(seq);
      if (piece === undefined) throw new Error(`${part}: piece ${seq} missing`);
      return piece;
    }).join('');
    const json = Buffer.from(encoded, 'base64').toString('utf8');
    if (sha256(json) !== entry.sha) throw new Error(`${part}: digest mismatch`);
    out[part] = JSON.parse(json);
  }
  return out;
}

/** Candidate Arabic renderings of one English string, most used first. */
export type MemoryEntry = { en: string; renderings: Array<{ ar: string; uses: number; sites: string[]; fields: string[] }> };

export class TranslationMemory {
  private readonly entries = new Map<string, Map<string, { uses: number; sites: Set<string>; fields: Set<string> }>>();

  add(pairs: Pair[], site: string): void {
    for (const pair of pairs) {
      const en = pair.en.trim();
      const ar = pair.ar.trim();
      const byArabic = this.entries.get(en) || new Map();
      const entry = byArabic.get(ar) || { uses: 0, sites: new Set<string>(), fields: new Set<string>() };
      entry.uses += 1;
      entry.sites.add(site);
      entry.fields.add(fieldOf(pair.path));
      byArabic.set(ar, entry);
      this.entries.set(en, byArabic);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  lookup(en: string): MemoryEntry | null {
    const byArabic = this.entries.get(en.trim());
    if (!byArabic) return null;
    const renderings = [...byArabic.entries()]
      .map(([ar, entry]) => ({ ar, uses: entry.uses, sites: [...entry.sites].sort().slice(0, 6), fields: [...entry.fields].sort() }))
      .sort((a, b) => b.uses - a.uses || a.ar.localeCompare(b.ar));
    return { en: en.trim(), renderings };
  }

  /** Up to `limit` shortest English strings containing the term, with their renderings. */
  examples(term: string, limit: number): MemoryEntry[] {
    return [...this.entries.keys()]
      .filter((en) => containsTerm(en, term))
      .sort((a, b) => a.length - b.length || a.localeCompare(b))
      .slice(0, limit)
      .map((en) => this.lookup(en) as MemoryEntry);
  }
}
