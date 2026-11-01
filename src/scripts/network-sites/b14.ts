/**
 * Batch B14 (1 November 2026), the ten reefs, bays and shores that take the network to 110. Two groups:
 *
 * - B14A: Shaab Abu Nugar, Fanous East, North Abu Ramada, Careless Reef and Fanadir North, five reefs
 *   off Hurghada.
 * - B14B: Erg Sabina, the tower in the Giftun strait, Fanous West, the sheltered half of the beacon reef,
 *   and three places down the Marsa Alam coast: Abu Dabbab Beach, Elphinstone Reef and Sharm El Luli.
 *
 * Every trip is built on the record the client publishes on its own main site, read into the dated snapshot
 * (`network-sites/eeo-snapshot.json`); prices, child rates, departures and inclusions are copied from that
 * record at apply time and never typed here.
 *
 * THE "NEAREST DAYS" RULE, as batches B12 and B13 set it. No client day names any of these places as a stop,
 * so a site takes the days the client's own records come closest to, and every page says plainly what its
 * programme names and that the programme does not name the site's own place. No page implies a stop, a
 * mooring or even a passing sight the record does not publish: a reef off a boat's course is still not on
 * its programme. When the client publishes a day that does stop at one of these places, it replaces the
 * trips sold here.
 *
 * What each site sells, and why (the coordinator's assignment of 1 November, `research/days.json`):
 * - Shaab Abu Nugar is the northernmost reef Hurghada's boats work, 7.58 km from the Dolphin House reef, so
 *   it sells three of the client's four Dolphin House days: the morning cruise, the speedboat run and the
 *   five-hour yacht with a seafood lunch.
 * - Fanous East lies 6.33 km from Big Giftun, so it sells the premium cruise out to Orange Island. The
 *   nearer Abu Minqar day goes to Fanous West in B14B, which is 5.68 km from that sandbank.
 * - Careless Reef stands 9.81 km north of Big Giftun, so it sells the Orange Bay day with parasailing.
 * - Fanadir North is 12.61 km from the Dolphin House reef, so it sells the fourth Dolphin House day, the
 *   yacht cruise with a dolphin swim and lunch. Abu Minqar is nearer to it and Big Giftun nearer by 80 m,
 *   but the first is kept by Fanous West and the second lies the other way; this reef and this day both run
 *   north.
 * - Fanous West is 5.68 km from the Abu Minqar sandbank, nearer than Fanous East, so it keeps the six-island
 *   speedboat day. That day is the one record this batch sells that batch B13 sells too (Erg Somaya), which
 *   the network allows across batches; the words here are this site's own.
 * - Abu Dabbab Beach is a shallow seagrass bay of dugongs and green turtles, so of the two Marsa Alam
 *   allocations that are equal on distance to within 30 m it takes the two dugong-and-turtle bay days at
 *   Marsa Mubarak, and Elphinstone Reef, an offshore reef reached by boat, takes the Pirates sailing day out
 *   of Port Ghalib. Either is defensible on distance; this one is right on subject.
 * - North Abu Ramada and Erg Sabina each sell days another site already sells, because the day their own
 *   water is nearest to cannot be built from its record (coordinator decision, 1 November). Both sit in the
 *   same water as the days they do sell, so each still sells the nearest day the client publishes that the
 *   seed accepts:
 *   · North Abu Ramada is 3.06 km from the Paradise Island beach at the southern end of the larger Giftun,
 *     but both Paradise Island records price their departures apart from the booking option, doubling the
 *     child price at one or both of them, so the seed refuses every per-person option of both (the one
 *     consistent option of the second is priced per group, which it also refuses). It therefore sells two of
 *     the Orange Bay days batch B13's Shaab Sabina sells, on the same larger Giftun.
 *   · Erg Sabina is 2.67 km from Small Giftun, but the Orange Bay day nearest it carries a price in its
 *     length field ("$$69" on the record, "$69" on the option), and a trip that can be booked must publish a
 *     length, so nothing can sell it without inventing one. It therefore sells the three-island yacht day
 *     batch B13's Erg Somaya sells, which works the same islands.
 *   Each is one field for the client to correct, and correcting it would let the site move to its own
 *   nearest day without touching anything else. The Makadi Bay Paradise Island record read into the
 *   snapshot for this batch stays there: it is unused but harmless, and it is the record the client's fix
 *   would repair.
 * - Sharm El Luli is a bay with no sea day within sixty kilometres, so it sells the one day that enters its
 *   own national park: the jeep safari inland to Cleopatra's Temple and a desert spring, 32.08 km from the
 *   bay. Its pages say plainly that the day is spent inland in the desert and not at the bay. The site is an
 *   independent seller, never the park authority, and it names no park ticket, because the record prices
 *   none.
 *
 * Three programmes are new here, because no batch sells their records yet; the rest are imported from the
 * batch that first sold each record (`b09`), so the network says the same thing about the same trip wherever
 * it is sold:
 * - `hurghada-dolphin-house-yacht-trip-with-snorkeling-lunch`: batch B09 held it back as the second Dolphin
 *   House yacht, "the same day as a record already sold here". Shaab Abu Nugar sells it and Fanadir North
 *   sells the other, so no site here sells both, and the two sites' words are their own. Its own schedule
 *   names Sataya Reef, which is far to the south, so this trip writes the day from the stops the record's
 *   own title, description and inclusions name, exactly as batch B09 did for the Dolphin House morning
 *   cruise. Its "Expert crew and guide assistance" line is left out and said plainly instead.
 * - `hurghada-orange-bay-parasailing-snorkeling-lunch-adventure`: on the client's published list but not in
 *   the 24 October snapshot, so it was read in first (its own commit). Its two "(if option selected)"
 *   inclusions describe the private-boat options this trip does not sell, and its one exclusion lists five
 *   towns this site does not serve; both are left out and the site's own lines put in their place.
 * - `hurghada-orange-bay-snorkeling-diving-cruise-with-massage` (B14B's Erg Sabina day) is NOT written here:
 *   see the held-back notes below.
 *
 * Held back, and why (each is a question for the client in the build report):
 * - `from-hurghada-paradise-island-yacht-speedboat-cruise-with-snorkeling-lunch` and
 *   `makadi-bay-paradise-island-day-trip-with-snorkeling-lunch`, the two days North Abu Ramada's own water
 *   is nearest to. Each prices its departures apart from the booking option itself: every per-person option
 *   of both records doubles the child price at one or both of its two departures (the Hurghada-hotel option
 *   of the first sells at 46.50 adult and 23.25 child, while its own 11:30 departure sells at 46.50 for an
 *   adult AND for a child), so the seed cannot tell which figure a family pays and refuses the record
 *   outright. The second record's one consistent option, the 4-hour private speedboat, is priced per group
 *   rather than per person, which the seed also refuses. Batches B09 and B11 held the first back for the
 *   same reason; the second was read into the snapshot for this batch and carries the same fault.
 * - `hurghada-orange-bay-snorkeling-diving-cruise-with-massage`, the day Erg Sabina's own water is nearest
 *   to: the client publishes a price where the day's length should be ("$$69" on the record, "$69" on the
 *   option and on the published list), so there is no length to copy and nothing here invents one. The
 *   attraction schema requires a length on any trip that can be booked (`duration` is `requiredWhenBookable`),
 *   so a bookable trip without one is refused before it is written, and batch B13 held the same record back
 *   for the same reason.
 * - `makadi-bay-snorkeling-and-diving-at-orange-bay` is filed by the client under Makadi Bay and titled for
 *   it, but the booking option sold here is its "Tour from Hurghada", whose own text reads "This option
 *   includes pickup and drop-off in Hurghada". So this trip collects in Hurghada like every other trip on
 *   the site, and it is written the way batch B13's Shaab Sabina writes it, with no second starting town.
 *   The Makadi Bay handling batch B13 gave Ras Disha belongs to a different record, whose own option
 *   collects in that bay; copying it here would publish a Makadi Bay pickup for a booking that includes a
 *   Hurghada one.
 * - `orange-island-premium-cruise-from-hurghada-with-lunch-transfer` names Orange Bay and the Orange Island
 *   entry fee and no Giftun island, which is why batch B13 could not carry it on a Giftun reef's page. It
 *   sits here on Fanous East, whose nearest named point is the larger Giftun itself, so the day is sold for
 *   what its own record says: a cruise out to Orange Island.
 *
 * Two of the "nearest" sentences `research/days.json` gives are written here with one clause changed, and
 * nothing else in the assignment moved:
 * - Fanadir North's reads "the long fringing reef the boat passes on the way". No programme says the boat
 *   passes the reef, and the batch brief names that exact phrase as one never to write, so this site's
 *   sentence states where the reef lies instead of what the boat does.
 * - Sharm El Luli's ends "about thirty-two kilometres east of those mines", and nothing before it names a
 *   mine; the day's own programme names Cleopatra's Temple and does not name a mine either, so the sentence
 *   measures from that temple, which is the point the distance was measured to.
 * - Careless Reef's "the larger Giftun" is written "Big Giftun", the name the assignment's own table uses,
 *   so that two sites of this batch do not carry the same clause word for word.
 *
 * Names: one spelling per name everywhere, and the variants only where the facts give them and only once.
 * Careless Reef is spelled Careless throughout, with Carless named once in its tenant description; the bay
 * at Abu Dabbab is Abu Dabbab Beach throughout, with the gazetteer's Marsa Abu Dabbab named once, in the
 * assignment's own sentence; El Fanous and El-Fanadir are each named once, where a site must say which reef
 * it is half of.
 *
 * Each site has two pictures of its own place, uploaded for this batch on 1 November, and the creation run
 * writes them first: the home page's opening picture, then the inner pages' one. So no site opens on a
 * photograph another site opens on, and no later picture write is needed (batch B12 had to change pictures
 * after creation and re-stamp its Arabic rows). Behind that pair each site lists the photographs its own
 * records publish, which the client can replace at any time without touching anything else; those are
 * described in the words the batch that first sold each record used. The logos are still an open question:
 * `--apply` refuses to run without `--logos=<file>` naming every site's approved logo, logoDark and
 * favicon, for every site of the group.
 */
import type { NetworkBatch, PriceSpec } from '../seed-network-sites';
import { PHOTO_C, PROGRAMMES_C as B08C } from './b08';
import { PROGRAMMES_A as B09A, PROGRAMMES_B as B09B } from './b09';

const EEO = 'egypt-excursions-online';
const WATER = 'water-activities';

/** Said once, where every option sold prices children separately; batch B09's line, word for word. */
const CHILD_NOTE = 'Children have their own price, and the booking applies it. The team confirms which ages count as children when it confirms your booking.';
const PICKUP_HURGHADA = 'Pickup and drop-off at your hotel in Hurghada';
/** The client sells pickup from further out as add-ons no booking option carries, so it cannot be booked here. */
const FAR_HURGHADA = 'Pickup from outside Hurghada costs extra and cannot be booked on this site. Ask the team before you book if your hotel is further out.';
/** Dolphins are wild: a trip says where to look for them, never that you will see one or swim beside one. */
const WILD_DOLPHINS = 'Dolphins are wild animals, so no boat can promise a sighting, and swimming near them depends on the sea and on how many boats are there.';

const pickupLegs = (town: string) => ({
  from: { title: 'Hotel pickup', description: `The car collects you from your hotel in ${town}.` },
  back: { title: 'Back to your hotel', description: `The car returns you to your hotel in ${town}.` },
});
const HRG = pickupLegs('Hurghada');

/**
 * Every programme this batch sells. The three written here are the records no earlier batch sells; the rest
 * are the batch that first sold the record.
 */
const P = {
  DOLPHIN_MORNING: B09A.HBT_DOLPHIN_MORNING,
  DOLPHIN_SPEEDBOAT: B09A.HBT_DOLPHIN_SPEEDBOAT,
  DOLPHIN_YACHT: B09A.HBT_DOLPHIN_YACHT,
  ORANGE_LUNCH: B09A.HBT_ORANGE_LUNCH,
  SIX_ISLANDS: B09A.HBT_SIX_ISLANDS,
  ORANGE_DIVE: B09A.HBT_ORANGE_DIVE,
  ORANGE_YACHT: B09A.HBT_ORANGE_YACHT,
  THREE_ISLANDS: B09A.HBT_THREE_ISLANDS,
  MM_TURTLE: B08C.MM_TURTLE,
  MM_DUGONG: B08C.MM_DUGONG,
  MM_SAILING: B08C.MM_SAILING,
  WADI_EL_GEMAL: B09B.WADI_EL_GEMAL,

  /**
   * The second Dolphin House yacht, five hours with a seafood lunch, morning or afternoon. Only the first of
   * the record's three options is sold: the second is the same day with water sports added, and the third
   * collects from towns this site does not serve.
   */
  DOLPHIN_YACHT_LUNCH: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-dolphin-house-yacht-trip-with-snorkeling-lunch',
    category: WATER,
    options: ['hurghada-dolphin-house-yacht-trip-snorkel-sea-b14d3e5761d2'],
    // Every extra the record publishes is bound to one option at a time, and the water sports among them
    // belong to the option this trip does not sell.
    addons: [],
    departures: ['08:30', '14:30'],
    rename: {
      'hurghada-dolphin-house-yacht-trip-snorkel-sea-b14d3e5761d2': {
        name: 'Yacht to Dolphin House with snorkelling and a seafood lunch',
        description: 'Five hours under way: dolphin watching and a swim at the reef, two snorkelling stops, a breakfast buffet and a seafood lunch on board.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      // Points at a section the network page does not have, and a claim the network never shows.
      inclusions: ['Pick-up and drop-off from Hurghada (see Know Before You Go for details)', 'Expert crew and guide assistance'],
      // The water sports are an add-on the option sold does not carry.
      exclusions: ['Water activities: banana ride 5min & sofa ride 5min (availabile as an add-on)'],
    },
    add: {
      inclusions: [PICKUP_HURGHADA, 'The crew beside you through the day'],
      exclusions: ['Banana and sofa rides'],
      needToKnow: [WILD_DOLPHINS, FAR_HURGHADA],
    },
    // The record's schedule opens and closes on lists of pickup areas and names Sataya Reef, which lies far
    // to the south; the day is written from the stops the record's own title, description and inclusions name.
    itinerary: [
      HRG.from,
      { title: 'Out to Dolphin House', description: 'The yacht sails north from Hurghada, with a breakfast buffet on the way.' },
      { title: 'Dolphin House', duration: '1 hour', description: 'Swimming at the reef, where dolphins often feed and rest.' },
      { title: 'Snorkelling at the reef', duration: '30 minutes', description: 'A guided snorkelling stop with the mask, fins and snorkel provided.' },
      { title: 'The small reef', duration: '30 minutes', description: 'A second guided snorkelling stop at the small reef beside it.' },
      { title: 'A seafood lunch', description: 'Lunch on board, with hot drinks, soft drinks and water.' },
      { title: 'Back to Hurghada', description: 'The yacht returns to the marina, and the car takes you back to your hotel.' },
    ],
  },

  /**
   * The Orange Bay day with one parasailing flight for every guest, read into the snapshot on 1 November.
   * Only the option that carries the transfer is sold: the other three are the same day without it, or a
   * private boat priced for a whole family.
   */
  ORANGE_PARASAILING: {
    provider: 'eeo',
    tenant: EEO,
    source: 'hurghada-orange-bay-parasailing-snorkeling-lunch-adventure',
    category: WATER,
    options: ['orange-bay-parasailing-experience-with-transf-4c627578a0f2'],
    // The record's extras are each bound to one option; the two bound to this one are a cake and a pickup
    // from a town this site does not serve.
    addons: [],
    departures: ['08:30'],
    rename: {
      'orange-bay-parasailing-experience-with-transf-4c627578a0f2': {
        name: 'Orange Bay with parasailing and the transfer',
        description: 'The whole island day with one parasailing flight each, and the car from your hotel and back.',
      },
    },
    childNote: CHILD_NOTE,
    omit: {
      // Both describe the private-boat options this trip does not sell.
      inclusions: ['Private boat (if option selected)', 'Private transport (if option selected)'],
      // Names five towns this site does not serve, and an add-on bound to another option.
      exclusions: ['Pickup service from Makadi, Sahl Hasheesh, El Gouna, Soma Bay and Safaga (select at checkout)'],
    },
    add: {
      inclusions: [PICKUP_HURGHADA],
      needToKnow: [FAR_HURGHADA],
    },
    // The record's schedule opens on a list of pickup options and runs through "Limousine", "Ferry" and
    // "Arrive back at:"; the day is written from the stops and times it names.
    itinerary: [
      { time: '08:30', ...HRG.from, duration: '30 minutes' },
      { title: 'Safety briefing', duration: '30 minutes', description: 'The crew run through the day and the safety rules before the boat leaves.' },
      { title: 'Breakfast on board', duration: '15 minutes', description: 'Breakfast as the boat sails out.' },
      { title: 'First snorkelling stop', duration: '45 minutes', description: 'A guided stop with the snorkelling gear and a life jacket.' },
      { title: 'Second snorkelling stop', duration: '45 minutes', description: 'A second guided stop, with a guide on hand for anyone who does not swim.' },
      { title: 'Lunch on board', duration: '1 hour', description: 'A buffet lunch, with water, tea, coffee and soft drinks.' },
      { title: 'Orange Bay Island', duration: '2 hours', description: 'Free time ashore with the entry covered, and one parasailing flight for every guest.' },
      { title: 'Back to Hurghada', duration: '1 hour', description: 'The boat returns and the car takes you back to your hotel.' },
    ],
  },
} satisfies Record<string, PriceSpec>;

/**
 * Each record's own photo, as the client publishes it. The three Marsa Mubarak photographs are the copies
 * batch B08 made into its own folder for the same records.
 *
 * The six-island day is the one exception, and batch B11's reason stands: the photograph the client
 * publishes on that record shows a dolphin rising out of a pool beside a swimmer's raised hand, which is not
 * a photograph of the open-sea day the record sells, so the trip carries the photograph batch B09 chose for
 * the same record instead.
 */
const PHOTO = {
  dolphinPair: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788791898/tours/xnv6gdxnnn9dxzs5pdhf.jpg',
  whiteSpeedboat: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788290634/tours/bgacpsik0esq6rcwnmmq.jpg',
  dayBoatAtAnchor: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788794476/tours/smf4lqwlugbxjepjbagn.jpg',
  parasailerOverTheBay: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788290048/tours/ncyahtmagpd4boacmjfh.jpg',
  yachtAndDolphins: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788289757/tours/h8x27bcg3l2oc311wf1k.jpg',
  snorkellerSelfie: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788291087/tours/a5hjhquanje6nm8wbsbf.jpg',
  turtleOverReef: PHOTO_C.turtleOverReef,
  turtleInBlue: PHOTO_C.turtleInBlue,
  snorkellerAndSails: PHOTO_C.snorkellerAndSails,
  camelInLagoon: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788796111/tours/qlu2ucaa2kzydntyyovj.jpg',
  diverDescending: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788292330/tours/qgmeqrxj4kngqfei9snq.jpg',
  bowOverLagoon: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787782233/tours/wirlheh3pj6ibboavetn.jpg',
  yachtAtSunset: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781893/tours/uaguqygoeo7djujix5fy.jpg',
};

/**
 * Each photo described as it is, not as the trip it illustrates. All but one are the words the batch that
 * first sold the record wrote; the parasailing photograph is new to the network and is described here from
 * the picture itself.
 */
const ALT: Record<keyof typeof PHOTO, string> = {
  dolphinPair: 'A dolphin swimming underwater in green-blue water, with a second dolphin behind it',
  whiteSpeedboat: 'A white speedboat with a blue stripe cutting across open water, leaving a wake',
  dayBoatAtAnchor: 'A white day boat at anchor in clear water near a low desert shore',
  parasailerOverTheBay: 'A parasailer under a wide striped canopy, towed by a small yellow speedboat across deep blue water, with a sandy cliff shore and moored boats behind',
  yachtAndDolphins: 'A white motor yacht on bright blue water, with a group of dolphins swimming at the surface in front of it',
  snorkellerSelfie: 'A snorkeller in a mask taking a photo of himself underwater above a coral reef',
  turtleOverReef: 'A sea turtle swimming just under the surface above a shallow coral reef',
  turtleInBlue: 'A large sea turtle in deep blue water, with small fish and a reef behind it',
  snorkellerAndSails: 'A snorkeller in a mask at the surface of clear green water, with a tall sailing boat under sail behind',
  camelInLagoon: 'A camel standing in shallow water between green mangrove bushes, with a low ridge behind',
  diverDescending: 'A scuba diver descending through blue water above a reef, with other divers below',
  bowOverLagoon: 'The white bow of a boat heading across a turquoise lagoon towards a low sandy shore',
  yachtAtSunset: 'A motor yacht in silhouette on the sea under an orange sunset, with hills on the horizon',
};

/**
 * Each site's own two pictures, uploaded for this batch on 1 November 2026 and written here as the upload
 * results they are, so the creation run itself publishes them and no later picture write is needed. The
 * first opens the home page and the second carries the inner pages; each site's record photos follow them.
 * What each picture shows is kept beside it: the tenant record has nowhere to store a description of a hero
 * image (its `heroImages` is a list of addresses), so these stay as notes until the storefront has a field
 * for them.
 *
 * All twenty are written here, two for each of the ten sites the batch was planned with.
 */
const HERO: Record<string, [string, string]> = {
  'shaab-abu-nugar': [
    // Table and brain corals sit beneath a rippled waterline, with a flat desert coast on the distant horizon.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521124/attractions-network/tenant-heroes/shaab-abu-nugar/site-20261101-hero-119b31aa7dbf.png',
    // A small cleaner wrasse tends a spotted grouper among table, brain and branching corals on pale sand.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521125/attractions-network/tenant-heroes/shaab-abu-nugar/site-20261101-second-d3a3cdaaf4b0.png',
  ],
  'fanous-east': [
    // Sunlight falls across a shallow coral wall, slender pinnacles and scattered coral blocks on a sloping sandy seabed.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521127/attractions-network/tenant-heroes/fanous-east/site-20261101-hero-c1da53c2c44f.png',
    // Two jackfish approach a dense cloud of silversides beside a sunlit coral wall.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521128/attractions-network/tenant-heroes/fanous-east/site-20261101-second-cf907dec68d7.png',
  ],
  'north-abu-ramada': [
    // A low barren island tip rises above the waterline, with a submerged coral plateau dropping into a wall with sea fans below.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521130/attractions-network/tenant-heroes/north-abu-ramada/site-20261101-hero-6537d844b649.png',
    // Seven barracuda hover in blue water above a coral-covered plateau.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521131/attractions-network/tenant-heroes/north-abu-ramada/site-20261101-second-12ef40a282f7.png',
  ],
  'careless-reef': [
    // Two unequal coral towers rise side by side from a coral garden surrounded by deep blue water.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521133/attractions-network/tenant-heroes/careless-reef/site-20261101-hero-f861866e0c6e.png',
    // A mottled moray eel peers from a crevice bordered by orange and coral-coloured growth.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521134/attractions-network/tenant-heroes/careless-reef/site-20261101-second-d08550839e55.png',
  ],
  'fanadir-north': [
    // A grouper and small cleaner fish wait above a coral block beside a sloping reef wall with dark cracks and small caves.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521135/attractions-network/tenant-heroes/fanadir-north/site-20261101-hero-816a81eaab6b.png',
    // A mottled ochre octopus rests on coral rubble, with its eye, siphon and two curled arms visible against a softly blurred reef background.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521136/attractions-network/tenant-heroes/fanadir-north/site-20261101-second-976f4f60438e.png',
  ],
  'erg-sabina': [
    // A broad coral outcrop covered in pink and violet soft corals rises from a coral-strewn seabed, with small silvery fish sheltering in a hollow in clear turquoise water.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521138/attractions-network/tenant-heroes/erg-sabina/site-20261101-hero-7feb5853b1ea.png',
    // A mottled crocodilefish rests head-on on pale sand and coral rubble beneath clear turquoise water.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521139/attractions-network/tenant-heroes/erg-sabina/site-20261101-second-bc8977075b35.png',
  ],
  'fanous-west': [
    // A narrow sandy underwater channel runs between low coral gardens toward clear turquoise lagoon water.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521140/attractions-network/tenant-heroes/fanous-west/site-20261101-hero-07fcc0b52403.png',
    // A brown mottled moray eel swims above a low coral garden while small silver fish pass overhead.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521141/attractions-network/tenant-heroes/fanous-west/site-20261101-second-95b6b8b7e34f.png',
  ],
  'abu-dabbab-beach': [
    // Warm pale sand borders a calm blue bay with dark seagrass patches, low rocky edges and bare desert hills.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521142/attractions-network/tenant-heroes/abu-dabbab-beach/site-20261101-hero-3aeb8d107671.png',
    // Green seagrass blades rise from sun-dappled sand beneath clear shallow turquoise water.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521144/attractions-network/tenant-heroes/abu-dabbab-beach/site-20261101-second-c8dfb18bafbd.png',
  ],
  'elphinstone-reef': [
    // A long narrow reef lies just beneath deep blue open water, with white surf breaking along its crest and no land visible.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521145/attractions-network/tenant-heroes/elphinstone-reef/site-20261101-hero-ac79ffbded45.png',
    // Orange anthias swim beside a steep reef wall covered in brown soft corals that descends into deep blue water.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521146/attractions-network/tenant-heroes/elphinstone-reef/site-20261101-second-1581933892df.png',
  ],
  'sharm-el-luli': [
    // An empty flat white beach curves beside clear turquoise shallows with bare desert mountains in the distance.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521148/attractions-network/tenant-heroes/sharm-el-luli/site-20261101-hero-95c7332f2214.png',
    // Two yellow-orange clownfish with white bands hover among a green anemone surrounded by pale hard corals.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521149/attractions-network/tenant-heroes/sharm-el-luli/site-20261101-second-b2c0373f7bd4.png',
  ],
};

const HURGHADA = { lat: 27.2579, lng: 33.8116 };
const MARSA_ALAM = { lat: 25.0676, lng: 34.879 };

/**
 * Places these reef sites never name: their boats leave Hurghada for the water off it, exactly as the
 * Hurghada boat site of batch B09 does, so that batch's fence is the fence here.
 */
const NOT_HURGHADA_BOATS = /Cairo|Giza|Luxor|Aswan|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Gouna|Sahl|Makadi|Alexandria|Siwa|Bahariya|Fayoum|Sataya|Samadai/i;
/**
 * Places the two Marsa Mubarak sites never name. Their boats work the bays between Marsa Alam and Port
 * Ghalib, exactly as the Marsa Mubarak site of batch B08 does, so that batch's fence is the fence here.
 */
const NOT_MARSA = /Gouna|Hurghada|Makadi|Sahl|Safaga|Soma Bay|Quseir|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Catherine|Cairo|Giza|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur|Pyramid|Sphinx/i;
/**
 * The bay inside Wadi El Gemal keeps the fence batch B09's Wadi El Gemal site uses, with one change: that
 * fence bars the word "Sharm", and this site's own place is Sharm El Luli. Sharm El Sheikh, the town the
 * word is barred for, is barred by name instead, so nothing else is let through.
 */
const NOT_WADI_EL_GEMAL_BAY = /Gouna|Hurghada|Makadi|Sahl|Safaga|Soma Bay|Sharm El Sheikh|Sharm el-Sheikh|Dahab|Nabq|Tiran|Ras Mohamed|Catherine|Cairo|Giza|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur|Pyramid|Sphinx/i;

/** The closing line every B11, B12 and B13 site ends on, and every site here. */
const CLOSING = 'Every trip collects you from your hotel and brings you back, and each page says what its own price covers. Hold a place online and pay later, or ask the team first about the pickup time.';

/** B14A: four of the reefs Hurghada's boats work, north and east of the town. */
export const B14A: NetworkBatch = {
  id: 'b14a',
  sites: [
    {
      slug: 'shaab-abu-nugar',
      name: 'Shaab Abu Nugar',
      listingPath: '/trips',
      domain: 'shaababunugar.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'abn-',
      foreignPlaces: NOT_HURGHADA_BOATS,
      tagline: 'Dolphin House days out of Hurghada',
      description: `Shaab Abu Nugar is the northernmost of the reefs Hurghada’s boats work, and the sites on it are grouped around one long reef shaped like a T; the short form Abu Nugar is used for it as well. The main reef rises from a sandy floor scattered with coral gardens and pinnacles and runs out into a sheer drop-off, and three more sites ring it: Torfa Abu Nugar to the north, which runs east to west and holds a fine coral garden; Gota Abu Nugar to the east, an oval reef that reaches the surface and can be covered end to end in a single dive; and Erug Abu Nugar to the south, a chain of pinnacles standing on sand. The coral is the reason to come — table corals, big brain corals, horn corals and gorgonian gardens, with cleaning stations where wrasses and shrimps tend groupers and snappers — and turtles are a particular draw, with eagle rays, broomtail wrasse, parrotfish and nudibranchs all recorded; the guides who describe it say the fish numbers are modest and the coral is what makes the reef.\n\nThese days cruise north from Hurghada to the Dolphin House reef; their programmes do not name Shaab Abu Nugar, the northernmost of the Hurghada reefs, which lies about eight kilometres south of it. Three trips are sold here: a morning cruise with breakfast, the same water reached by speedboat, and five hours by yacht with a seafood lunch. ${CLOSING}`,
      seo: {
        metaTitle: 'Shaab Abu Nugar: Dolphin House Boat Days',
        metaDescription: 'Boat days north from Hurghada to the Dolphin House reef: a morning cruise, a speedboat run and a five-hour yacht with lunch, with a car from your hotel.',
        keywords: ['shaab abu nugar reef', 'dolphin house boat day hurghada', 'northernmost hurghada reefs', 'dolphin house yacht with seafood lunch', 'hurghada dolphin day hotel car'],
      },
      theme: { primaryColor: '#15324A', secondaryColor: '#F2EEE3', accentColor: '#C8432E' },
      heroImages: [...HERO['shaab-abu-nugar'], PHOTO.dolphinPair, PHOTO.whiteSpeedboat],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/shaab-abu-nugar/monogram.png',
      trips: [
        {
          path: 'morning-cruise-to-dolphin-house',
          price: P.DOLPHIN_MORNING,
          title: 'A Morning Cruise North to the Dolphin House',
          short: 'Breakfast on board and two sessions of forty minutes in the water at the Dolphin House reef, with the gear handed out and the drinks included.',
          description: 'The boat leaves at half past eight and runs north up the coast. Two sessions of forty minutes are spent in the water at the Dolphin House reef, where dolphins often feed and rest, with breakfast and the drinks on board between them and the mask, fins and snorkel handed out. The programme names Hurghada and the Dolphin House reef, not Shaab Abu Nugar, the reef about eight kilometres south of it; no boat calls there.\n\nDolphins are wild, so nobody aboard can promise one. A car collects you in Hurghada and brings you back, children have their own price, and a pickup from further out than the town cannot be booked here.',
          highlights: [
            'Two sessions of forty minutes',
            'Breakfast served between them',
            'Mask, fins and snorkel handed out',
            'Away at half past eight',
          ],
          seo: {
            metaTitle: 'A Morning Cruise North to the Dolphin House Reef',
            metaDescription: 'A morning boat from Hurghada to the Dolphin House reef: two sessions of forty minutes in the water, breakfast on board and the gear, with a hotel car.',
          },
          images: [PHOTO.dolphinPair],
          imageAlts: [ALT.dolphinPair],
        },
        {
          path: 'speedboat-run-to-dolphin-house',
          price: P.DOLPHIN_SPEEDBOAT,
          title: 'The Same Water, Reached by Speedboat',
          short: 'A fast hull out to the Dolphin House reef and two guided stops in the water, with the snorkelling gear, the drinks and the fruit aboard.',
          description: 'A speedboat covers the run in about an hour, with shade on deck, and leaves ninety minutes at the reef: two guided stops for snorkelling and for swimming where dolphins often feed and rest. The programme names Hurghada and the Dolphin House reef, not Shaab Abu Nugar, the reef about eight kilometres south of it; no boat calls there.\n\nWater, soft drinks and fruit are served aboard and the gear is handed out. Dolphins are wild, so nobody aboard can promise one. The car runs both ways from your Hurghada hotel, children have their own price, and pickup from beyond the town is not on this page.',
          highlights: [
            'About an hour out by fast hull',
            'Two guided stops at the reef',
            'Shade on deck for the run',
            'Water, soft drinks and fruit',
          ],
          seo: {
            metaTitle: 'Dolphin House by Speedboat: Two Stops at the Reef',
            metaDescription: 'A speedboat from Hurghada to the Dolphin House reef: about an hour out, two guided stops for snorkelling and swimming, the gear and drinks aboard.',
          },
          images: [PHOTO.whiteSpeedboat],
          imageAlts: [ALT.whiteSpeedboat],
        },
        {
          path: 'yacht-day-with-a-seafood-lunch',
          price: P.DOLPHIN_YACHT_LUNCH,
          title: 'Five Hours by Yacht, Morning or Afternoon',
          short: 'Five hours on a yacht: an hour at the Dolphin House reef, two snorkelling stops, a breakfast buffet as you sail and a seafood lunch after.',
          description: 'Five hours on a yacht, and you pick the morning or the afternoon when you book. An hour goes to dolphin watching and a swim at the Dolphin House reef, then half an hour of snorkelling there and half an hour at the small reef beside it, with a breakfast buffet as the yacht sails out. The programme names Hurghada and the Dolphin House reef, not Shaab Abu Nugar, the reef about eight kilometres south of it; no boat calls there.\n\nA seafood lunch follows, with hot drinks, soft drinks and water; the banana and sofa rides are not part of it. Dolphins are wild, so nobody aboard can promise one. Children have their own price, and a pickup from outside the town has to be settled with the team.',
          highlights: [
            'Morning or afternoon, five hours',
            'An hour at the Dolphin House reef',
            'Snorkelling at the reef and the small one',
            'A breakfast buffet, then seafood',
          ],
          seo: {
            metaTitle: 'Five Hours by Yacht to Dolphin House, Lunch Aboard',
            metaDescription: 'Five hours by yacht from Hurghada: an hour at the Dolphin House reef, two snorkelling stops, a breakfast buffet as you sail and a seafood lunch after.',
          },
          images: [PHOTO.dolphinPair],
          imageAlts: [ALT.dolphinPair],
        },
      ],
    },
    {
      slug: 'fanous-east',
      name: 'Fanous East',
      listingPath: '/trips',
      domain: 'fanouseasthurghada.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'fne-',
      foreignPlaces: NOT_HURGHADA_BOATS,
      tagline: 'The Orange Island cruise from Hurghada',
      description: `Fanous East is the eastern and busier half of El Fanous, a reef about three hundred metres long that runs east to west off the Hurghada coast; a natural break in it is what divides the two halves. Fanous means lamp, lantern or beacon in local speech, and the reef takes its name from the beacon standing on top of it. On this side a shallow wall rises from a sloping sandy bottom littered with coral blocks and fine pinnacles, and it is at its finest where it is shallowest; two striking ergs stand about twenty metres off the main reef, split by cavities and cracks and densely carpeted with soft and hard corals, a set-up the guides single out for photographers. The whole reef is known for drawing dolphins and is recorded under the names Dolphin Reef and Dolphin Playground as well, and on this side jackfish and lionfish hunt clouds of glassfish and silversides around the pinnacles, among surgeonfish, tangs and unicornfish.\n\nThis day cruises out to Orange Island on the larger Giftun; its programme does not name Fanous East, the beacon reef that lies about six kilometres north-west of the island's far end. One trip is sold here: the premium cruise, with two snorkelling stops, the island entry and a buffet lunch. ${CLOSING}`,
      seo: {
        metaTitle: 'Fanous East: the Orange Island Premium Cruise',
        metaDescription: 'A premium cruise out of Hurghada to Orange Island: two snorkelling stops with the gear, two hours ashore with the entry covered and a buffet lunch aboard.',
        keywords: ['fanous east beacon reef', 'orange island premium cruise', 'hurghada reef snorkelling cruise', 'orange island entry included', 'hurghada island day by coach'],
      },
      theme: { primaryColor: '#0E3C45', secondaryColor: '#FBF1DC', accentColor: '#E8A33D' },
      heroImages: [...HERO['fanous-east'], PHOTO.dayBoatAtAnchor],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/fanous-east/monogram.png',
      trips: [
        {
          path: 'orange-island-premium-cruise',
          price: P.ORANGE_LUNCH,
          title: 'Out to Orange Island, Two Stops in the Water',
          short: 'Eight in the morning for the island: two snorkelling stops with the gear, two hours ashore with the entry covered and a buffet lunch on board.',
          description: 'The coach is round by eight and the boat is away for its first snorkelling stop. Two hours are spent on the island with the guide and the entry covered, and the buffet lunch and the second stop fall on the way back: chips, spaghetti, rice, roast potatoes, chicken nuggets and kofta. The programme names Hurghada and Orange Island, not Fanous East, the reef about six kilometres north-west of the island’s far end; nothing calls there.\n\nThe snorkelling gear and the drinks on board are in the price. Children have their own price, and a coach takes you from your Hurghada hotel in the morning and returns you there once the day is done.',
          highlights: [
            'Two hours ashore on the island',
            'The island entry counted in',
            'A snorkelling stop either side of lunch',
            'Chips, spaghetti, rice and kofta',
          ],
          seo: {
            metaTitle: 'Out to Orange Island, Two Stops in the Water',
            metaDescription: 'A cruise from Hurghada at eight: two snorkelling stops with the gear, two hours on Orange Island with the entry covered and a buffet lunch on board.',
          },
          images: [PHOTO.dayBoatAtAnchor],
          imageAlts: [ALT.dayBoatAtAnchor],
        },
      ],
    },
    {
      slug: 'north-abu-ramada',
      name: 'North Abu Ramada',
      listingPath: '/trips',
      domain: 'northaburamadahurghada.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'nar-',
      foreignPlaces: NOT_HURGHADA_BOATS,
      tagline: 'Two Orange Bay days out of Hurghada',
      description: `North Abu Ramada is the northern site on the Sha’ab Abu Ramada reef, which rings the small island of Abu Ramada south of Small Giftun; the island is recorded in the gazetteer as Jazirat Abu Rimathi. The site is a plateau that runs out from the island’s north and tips over into a vertical wall, a coral top above a face of coral and gorgonians. The mooring sits inside a small bend in that wall, and beneath the lip, where the plateau gives way, there is a chimney. The reef’s open northern end is exposed to weather and to strong current, which is what feeds it, and it is at its liveliest as a drift when the flow comes from the north. Schools of giant barracuda, bigeye trevally and yellowfin tuna work the fusiliers sweeping across the plateau, turtles feed on the soft corals, squadrons of up to twelve eagle rays have been seen flying past in formation, and lionfish and groupers stake out glassfish in the cavities.\n\nThese days sail to Orange Bay on the larger Giftun; their programmes do not name North Abu Ramada, the plateau off the north tip of Abu Ramada island, about three kilometres south-east of that island’s southern end. Two trips are sold here: a day that snorkels and dives, and a yacht that comes at two lengths. ${CLOSING}`,
      seo: {
        metaTitle: 'North Abu Ramada: Two Orange Bay Days',
        metaDescription: 'Two days on the water from Hurghada, both ashore at Orange Bay on the larger Giftun: one that dives as well as snorkels, and one yacht at two lengths.',
        keywords: ['north abu ramada plateau', 'orange bay snorkel and dive day', 'abu ramada island reef', 'orange bay yacht five or eight hours', 'hurghada orange bay with a hotel car'],
      },
      theme: { primaryColor: '#0A2747', secondaryColor: '#F1E8D4', accentColor: '#2E9B7D' },
      heroImages: [...HERO['north-abu-ramada'], PHOTO.diverDescending, PHOTO.bowOverLagoon],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/north-abu-ramada/monogram.png',
      trips: [
        {
          path: 'orange-bay-snorkel-and-dive',
          price: P.ORANGE_DIVE,
          title: 'Snorkel First, Then a Dive, Then the Island',
          short: 'Half past seven away, Giftun by boat, an hour and a quarter ashore at Orange Bay, and two ways into the water with the kit provided.',
          description: 'Two ways into the water on one ticket. The boat leaves at half past seven for Giftun; an hour and a quarter is spent ashore on Orange Bay Island, and what is left of the day goes to snorkelling, mask and fins provided, and to one scuba dive with the whole kit. The programme names Orange Bay and the island it sits beside, not North Abu Ramada, the plateau three kilometres south-east of the larger island’s southern end; no boat stops there.\n\nThe meal is an open buffet aboard, with hot and cold drinks through the day, and the marine fee, the life vest and the guide need no paying for. A child is priced apart from an adult, and a car runs you to the boat from your Hurghada hotel and home again.',
          highlights: [
            'Two ways into the water, one ticket',
            'An hour and a quarter on the island',
            'A scuba dive with the whole kit',
            'Marine fee and life vest covered',
          ],
          seo: {
            metaTitle: 'Snorkel First, Then a Dive, Then the Island',
            metaDescription: 'A boat out of Hurghada at half past seven: snorkelling with the kit, one scuba dive, an hour and a quarter ashore on Orange Bay and a buffet aboard.',
          },
          images: [PHOTO.diverDescending],
          imageAlts: [ALT.diverDescending],
        },
        {
          path: 'orange-bay-yacht-five-or-eight-hours',
          price: P.ORANGE_YACHT,
          title: 'Pick Your Length: a Short Yacht Day or a Long One',
          short: 'The short day: breakfast, one stop in the water, an hour ashore. The long one: lunch as well, another stop and another hour on the island.',
          description: 'One yacht, two lengths, and the choice is yours at booking. Take five hours and you get a breakfast buffet, a single stop in the water and sixty minutes on the island; take eight and lunch, another stop and another hour ashore come with it. The programme names Orange Bay and the island it sits beside, not North Abu Ramada, the plateau three kilometres south-east of the larger island’s southern end; no boat stops there.\n\nWhichever you pick, the gear, the island entry and the marine tax are in the price, and a guide sails with the boat, plus one more for guests who do not swim. A child is priced apart from an adult. The hotels are collected from first, and the yacht leaves at half past eight.',
          highlights: [
            'A five-hour day or an eight-hour one',
            'Breakfast as the yacht sails out',
            'One stop in the water, or two',
            'A guide aboard for guests who do not swim',
          ],
          seo: {
            metaTitle: 'Pick Your Length: a Short Yacht Day or a Long One',
            metaDescription: 'One yacht day at two lengths from Hurghada: five hours with breakfast, a stop in the water and an hour ashore, or eight with lunch and twice that.',
          },
          images: [PHOTO.bowOverLagoon],
          imageAlts: [ALT.bowOverLagoon],
        },
      ],
    },
    {
      slug: 'careless-reef',
      name: 'Careless Reef',
      listingPath: '/trips',
      domain: 'carlessreefhurghada.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'crf-',
      foreignPlaces: NOT_HURGHADA_BOATS,
      tagline: 'An Orange Bay day with a flight over it',
      description: `Careless Reef stands in open water north-east of Hurghada, in the gap that separates the Umm Gamar reefs from Giftun Island, and runs roughly two hundred metres. Its spelling is disputed: the national register of dive sites and one guide print Carless, while another prints the longer form and calls that the right one, so this site uses Careless throughout. The reef rises from deep water as though pushed up from the abyss, with two large coral towers standing on a plateau of coral gardens and a smaller pinnacle at the southern end; the plateau tilts towards an edge that drops straight down, coral forests on the northern drop-off and small coral towers on the southern side. It is known above all for a large resident group of unusually tolerant moray eels of several species, which the guides put down to years of fish-feeding and which will hold still for a camera. It has no shelter of its own and the current is strong and not reliably northerly, so boats reach it only in good weather — and that same current carries in the food that makes it so rich. Nudibranchs, turtles, whitetip reef sharks, tuna, big groupers and giant trevallies are all recorded, with a resident school of bannerfish to the north.\n\nThis day is spent at Orange Bay on Big Giftun; its programme does not name Careless Reef, which stands in open water about ten kilometres north of the island. One trip is sold here: the island day with two snorkelling stops, a buffet lunch and one parasailing flight for every guest. ${CLOSING}`,
      seo: {
        metaTitle: 'Careless Reef: an Orange Bay Day with Parasailing',
        metaDescription: 'A day out of Hurghada to Orange Bay: two guided stops in the water, time ashore with the entry covered, a buffet lunch and one parasailing flight each.',
        keywords: ['careless reef hurghada', 'orange bay day with parasailing', 'moray eel dive site hurghada', 'orange bay island entry covered', 'hurghada island day with a flight'],
      },
      theme: { primaryColor: '#10141F', secondaryColor: '#E7D9B8', accentColor: '#E06A4E' },
      heroImages: [...HERO['careless-reef'], PHOTO.parasailerOverTheBay],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/careless-reef/monogram.png',
      trips: [
        {
          path: 'orange-bay-day-with-parasailing',
          price: P.ORANGE_PARASAILING,
          title: 'A Day at Orange Bay, and One Flight Over It',
          short: 'Two snorkelling stops, two hours on Orange Bay with the entry covered, a buffet lunch and one parasailing flight for every guest aboard.',
          description: 'The car comes round early and the boat is away by half past eight, after a safety briefing and breakfast on deck. The day holds two guided snorkelling stops of forty-five minutes with the gear and a life jacket, a buffet lunch, and two hours on Orange Bay Island with the entry covered and one parasailing flight for every guest. The programme names Hurghada and Orange Bay, not Careless Reef, which stands out in the open water north of the island; no boat goes there.\n\nWater, tea, coffee and soft drinks are unlimited and seasonal fruit comes with them. There are two to four guides on each boat and one for guests who do not swim, with toilets and a shower on board. Children have their own price, and pickup from outside Hurghada is not something this page can book.',
          highlights: [
            'One parasailing flight for each guest',
            'Two hours ashore, entry covered',
            'Two guided stops of forty-five minutes',
            'A guide for guests who do not swim',
          ],
          seo: {
            metaTitle: 'A Day at Orange Bay, and One Flight Over It',
            metaDescription: 'Out of Hurghada by half past eight: two guided snorkelling stops, two hours on Orange Bay with the entry covered, a buffet lunch and a flight each.',
          },
          images: [PHOTO.parasailerOverTheBay],
          imageAlts: [ALT.parasailerOverTheBay],
        },
      ],
    },
    {
      slug: 'fanadir-north',
      name: 'Fanadir North',
      listingPath: '/trips',
      domain: 'fanadirnorthhurghada.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'fdn-',
      foreignPlaces: NOT_HURGHADA_BOATS,
      tagline: 'A yacht day north, with lunch aboard',
      description: `Fanadir North is the northern end of El Fanadir, a long narrow fringing reef that runs up the coast directly north of Hurghada and encloses a shallow lagoon; the name is printed El-Fanadir as well. The reef leads to a sheer drop-off at twenty to twenty-five metres which carries on far down into deeper water, and the wall below twelve metres gives on to a plateau that runs to about twenty. It is a long sloping face of coral, and what makes it worth the dive are the cracks and caves along it: one prominent coral block works as a busy cleaning station, and the trail of cleaning stations along the reef is described as almost endless. Its shape invites a drift along the wall, and in good weather the very north tip can be dived too. It is a macro hunting ground — scorpionfish, stonefish and lionfish lie up for the abundant pipefish, camouflaged octopuses are common, blue-spotted rays rest at the foot of the main wall, moray eels of several kinds come and go, and the schools of goatfish and sweetlips are large — while near the surface it teems with silversides, with packs of tuna and jacks cruising through.\n\nThis day runs up the coast from Hurghada to the Dolphin House reef; its programme does not name Fanadir North, the top of the long fringing reef that lies about thirteen kilometres short of it. One trip is sold here: five hours by yacht, with time at the reef, two snorkelling stops and a seafood lunch. ${CLOSING}`,
      seo: {
        metaTitle: 'Fanadir North: a Yacht Day to Dolphin House',
        metaDescription: 'Five hours by yacht from Hurghada to the Dolphin House reef: time in the water at the reef, two snorkelling stops and a seafood lunch served on board.',
        keywords: ['fanadir north reef', 'el fanadir fringing reef hurghada', 'dolphin house yacht cruise', 'macro diving wall hurghada', 'five hour yacht day hurghada'],
      },
      theme: { primaryColor: '#2F2A2E', secondaryColor: '#F3EBDC', accentColor: '#C77B30' },
      heroImages: [...HERO['fanadir-north'], PHOTO.yachtAndDolphins],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/fanadir-north/monogram.png',
      trips: [
        {
          path: 'dolphin-house-yacht-cruise',
          price: P.DOLPHIN_YACHT,
          title: 'A Yacht Run North, and Five Hours to Fill It',
          short: 'Five hours out of Hurghada by yacht: an hour at the Dolphin House reef, two snorkelling stops, a breakfast buffet and a seafood lunch aboard.',
          description: 'The yacht takes the whole run north and gives five hours to it. An hour is spent at the Dolphin House reef watching for dolphins and swimming, then thirty minutes of guided snorkelling at the reef and thirty more at a smaller one nearby, with a breakfast buffet before and a seafood lunch after. The programme names Hurghada and the Dolphin House reef, not Fanadir North, which lies about thirteen kilometres short of that reef; nothing stops there.\n\nThe crew are with you through the day and the drinks are hot and cold; the banana and sofa rides are not part of this price. Dolphins are wild, so nobody aboard can promise one. Children have their own price, and a pickup from outside the town is not part of this price.',
          highlights: [
            'An hour in the water at the reef',
            'Thirty minutes of guided snorkelling',
            'A second, smaller reef nearby',
            'Breakfast first, seafood after',
          ],
          seo: {
            metaTitle: 'A Yacht Run North, and Five Hours to Fill It',
            metaDescription: 'Five hours by yacht out of Hurghada: an hour at the Dolphin House reef, two guided snorkelling stops, a breakfast buffet and a seafood lunch aboard.',
          },
          images: [PHOTO.yachtAndDolphins],
          imageAlts: [ALT.yachtAndDolphins],
        },
      ],
    },
  ],
};

/** B14B: the sheltered half of the beacon reef, and three places down the Marsa Alam coast. */
export const B14B: NetworkBatch = {
  id: 'b14b',
  sites: [
    {
      slug: 'erg-sabina',
      name: 'Erg Sabina',
      listingPath: '/trips',
      domain: 'ergsabina.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'egs-',
      foreignPlaces: NOT_HURGHADA_BOATS,
      tagline: 'A three-island yacht day from Hurghada',
      description: `Erg Sabina is a single coral erg standing on a coral floor in the Giftun archipelago, just east of the Shaab Sabina reef and off the eastern side of Giftun Island, and the erg itself runs tens of metres to the north. It is a shallow site — a dive register gives ten metres as its maximum and an operator ten to twelve — which is why the light on it is good and why it is reckoned one of the better spots in the archipelago for underwater photography. The erg stands about fifty metres north of the main reef and is a haven of delicate soft corals and glassfish. Current can get up here because of the shape of the Giftun passage, and the site is only partly sheltered from the wind. Butterflyfish, crocodilefish, turtles and eagle rays are recorded by both guides, along with jackfish, lionfish and scorpionfish working the schools of glassfish.\n\nThis day sails to Orange Bay, the Giftun islands and Magawish; its programme does not name Erg Sabina, the coral tower in the strait between the two Giftun islands, under three kilometres from Small Giftun. One trip is sold here: eight hours by yacht, working three islands. ${CLOSING}`,
      seo: {
        metaTitle: 'Erg Sabina: a Three-Island Yacht Day',
        metaDescription: 'A yacht day out of Hurghada: Magawish, the Giftun nature reserve and Orange Bay in eight hours, with two stops in the water and seafood at midday.',
        keywords: ['erg sabina coral tower', 'giftun strait soft corals', 'three island yacht day hurghada', 'orange bay and magawish cruise', 'hurghada yacht with a seafood lunch'],
      },
      theme: { primaryColor: '#7A2E3B', secondaryColor: '#EEF1F0', accentColor: '#1F9AA8' },
      heroImages: [...HERO['erg-sabina'], PHOTO.yachtAtSunset],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/erg-sabina/monogram.png',
      trips: [
        {
          path: 'three-islands-and-two-stops-in-the-water',
          price: P.THREE_ISLANDS,
          title: 'Three Islands, Two Stops in the Water, One Yacht',
          short: 'Eight hours, one yacht: time ashore on two islands, forty minutes of snorkelling in the Giftun reserve, two more stops in the water and seafood.',
          description: 'Three islands in eight hours. Sixty minutes are spent ashore on Orange Bay and sixty more at Magawish, with forty minutes in the water inside the Giftun Island nature reserve between them, and two further stops at two more sites along the route. The programme names all three islands, not Erg Sabina, the coral tower out in the strait between them; nothing stops at the tower.\n\nBreakfast comes as the yacht sails out and the midday meal is seafood; soft drinks, hot drinks, water and fruit in season are unlimited, and each island’s entrance fee is already paid. Dolphins are looked for on the way out and are never promised. A child is priced apart from an adult, and the car reaches your Hurghada hotel in time for a half past eight sailing.',
          highlights: [
            'Sixty minutes on Orange Bay',
            'Forty inside the Giftun reserve',
            'Magawish Island for an hour',
            'Two stops in the water on the way',
          ],
          seo: {
            metaTitle: 'Three Islands, Two Stops in the Water, One Yacht',
            metaDescription: 'Eight hours by yacht out of Hurghada: time ashore on Orange Bay and Magawish, forty minutes in the Giftun reserve, and seafood served at midday.',
          },
          images: [PHOTO.yachtAtSunset],
          imageAlts: [ALT.yachtAtSunset],
        },
      ],
    },
    {
      slug: 'fanous-west',
      name: 'Fanous West',
      listingPath: '/trips',
      domain: 'fanouswesthurghada.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'fnw-',
      foreignPlaces: NOT_HURGHADA_BOATS,
      tagline: 'The six-island run out of Hurghada',
      description: `Fanous West is the western half of El Fanous, on the far side of the natural break that divides that reef in two, off the Hurghada coast. The name means lamp, or lantern, or beacon, and it comes from the beacon standing on the reef. This side is a flat sandy bottom flanking a shallow reef wall, with two large ergs and several smaller towers rising from it, and a narrow channel leads in through a sloping garden of corals to a lagoon about nine metres deep, the garden itself running down to fourteen. It is the sheltered side: turtles feed in its coral gardens, giant moray eels roam among silversides and jackfish, European moray and lionfish are recorded, and the reef as a whole draws dolphins and answers to Dolphin Reef and to Dolphin Playground.\n\nThis day runs six islands by speedboat and walks the Abu Minqar sandbank; its programme does not name Fanous West, the sheltered western half of the beacon reef about six kilometres north of that sandbank. One trip is sold here: the speedboat that works six islands between one morning and one evening. ${CLOSING}`,
      seo: {
        metaTitle: 'Fanous West: the Six-Island Speedboat Day',
        metaDescription: 'A speedboat day out of Hurghada: Giftun, Nemo Bay, Orange Bay, Magawish, a wreck and the Abu Minqar sandbank, with the island fees and the gear.',
        keywords: ['fanous west sheltered reef', 'six island speedboat day hurghada', 'abu minqar sandbank walk', 'beacon reef lagoon channel', 'hurghada speedboat island fees'],
      },
      theme: { primaryColor: '#1C4E7A', secondaryColor: '#FBFAF6', accentColor: '#38B6B0' },
      heroImages: [...HERO['fanous-west'], PHOTO.snorkellerSelfie],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/fanous-west/monogram.png',
      trips: [
        {
          path: 'six-islands-and-the-sandbank',
          price: P.SIX_ISLANDS,
          title: 'Six Islands in One Day, Ending on the Sandbank',
          short: 'A fast hull with three stops in the water, time at four islands and over a wreck, and the last call of the day on the Abu Minqar sandbank.',
          description: 'A speedboat gets round six islands between one morning and one evening. Two hours go to the water by Giftun; after that come Nemo Bay, then Orange Bay, then Magawish, then a wreck to swim over, and the sandbank at Abu Minqar to finish. Three of the six are for snorkelling. The programme names those islands and the Giftun National Park area, not Fanous West, the sheltered half of the beacon reef six kilometres north of the sandbank; nothing calls there.\n\nThe price covers the island entrance fees, a guide and a life jacket, the snorkelling gear, water and soft drinks, fruit in season, and the shade on deck; lunch ashore it does not. Dolphins are watched for from the deck, and being wild they are never promised. Children have their own price, and a pickup from outside the town cannot be booked here.',
          highlights: [
            'Three of the six are for snorkelling',
            'Two hours in the water by Giftun',
            'A wreck to swim over',
            'The Abu Minqar sandbank last of all',
          ],
          seo: {
            metaTitle: 'Six Islands in One Day, Ending on the Sandbank',
            metaDescription: 'A speedboat out of Hurghada with three stops in the water, four islands, a wreck to swim over and a last call on the Abu Minqar sandbank.',
          },
          images: [PHOTO.snorkellerSelfie],
          imageAlts: [ALT.snorkellerSelfie],
        },
      ],
    },
    {
      slug: 'abu-dabbab-beach',
      name: 'Abu Dabbab Beach',
      listingPath: '/trips',
      domain: 'abudabbabbeach.com',
      city: 'Marsa Alam',
      area: 'Marsa Alam',
      pickupDestination: 'marsa-alam',
      coordinates: MARSA_ALAM,
      currency: 'USD',
      slugPrefix: 'adb-',
      foreignPlaces: NOT_MARSA,
      tagline: 'Dugong and turtle days at Marsa Mubarak',
      description: `Abu Dabbab Beach is a sheltered sandy bay on the coast north of Marsa Alam, reef at both ends and sand in the middle, and that sand carries one of the largest patches of seagrass in the region. The seagrass is what the dugongs graze, and more Red Sea dugong sightings come from this bay than from anywhere else; it is a nesting site for sea turtles too, and a resident population of green turtles feeds there alongside them. One thing to know before reading about it elsewhere: the name covers two different things about four kilometres apart, this bay and a chain of six offshore reefs mapped as Abu Dabbab 1 to 6, so a page about the name may mean either.\n\nThese days snorkel the bay at Marsa Mubarak for dugongs and green turtles; their programmes do not name Marsa Abu Dabbab, the seagrass bay about twenty-one kilometres down the same coast where most of the Red Sea's dugongs are seen. Two trips are sold here, both boat days out of Marsa Alam: eight hours in the bay, and a shorter sailing that closes at Port Ghalib Marina. ${CLOSING}`,
      seo: {
        metaTitle: 'Abu Dabbab Beach: Marsa Mubarak Boat Days',
        metaDescription: 'Boat days out of Marsa Alam into the bay at Marsa Mubarak: guided snorkelling where turtles and dugongs feed, a meal on board and a car from your hotel.',
        keywords: ['abu dabbab beach seagrass bay', 'marsa mubarak dugong snorkelling', 'green turtle bay north of marsa alam', 'marsa alam boat day with lunch', 'dugongs grazing seagrass red sea'],
      },
      theme: { primaryColor: '#2E6B4E', secondaryColor: '#F2E7D2', accentColor: '#E6763D' },
      heroImages: [...HERO['abu-dabbab-beach'], PHOTO.turtleOverReef, PHOTO.turtleInBlue],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/abu-dabbab-beach/monogram.png',
      trips: [
        {
          path: 'a-full-day-at-marsa-mubarak',
          price: P.MM_TURTLE,
          title: 'A Full Day in the Bay at Marsa Mubarak',
          short: 'Eight hours out of Marsa Alam: a session in the water either side of the meal, with the gear and the national park fees in the price.',
          description: 'A nine o’clock call at your hotel, then the drive down to the boat. Two sessions in the water follow, one before the meal and one after it, each led by an instructor over the coral and the shoals of the bay, which is where the turtles and the dugongs feed. The programme names Marsa Alam and Marsa Mubarak, not Abu Dabbab Beach, the seagrass bay twenty-one kilometres down the same coast; no boat goes there.\n\nBoth are wild animals and neither is ever promised. The mask, the fins, the life jacket and the park fees are all in the price; tips are not, and a hotel north of the town costs extra and is settled with the team. Children have their own price.',
          highlights: [
            'One session in the water, then another',
            'Mask, fins and life jacket in the price',
            'A meal between the two of them',
            'The national park fees covered',
          ],
          seo: {
            metaTitle: 'A Full Day in the Bay at Marsa Mubarak',
            metaDescription: 'Eight hours out of Marsa Alam: a session in the water either side of the meal at Marsa Mubarak, with the gear, the park fees and a hotel car.',
          },
          images: [PHOTO.turtleOverReef],
          imageAlts: [ALT.turtleOverReef],
        },
        {
          path: 'two-bays-and-the-marina',
          price: P.MM_DUGONG,
          title: 'Two Bays, Then an Hour Round the Marina',
          short: 'Four and a half hours: two guided stops in the bays of Marsa Mubarak and Small Shenwa, a buffet aboard, and the marina at Port Ghalib to close.',
          description: 'Half an hour of sailing puts the boat in the first bay. Two guided stops follow with free time between them, at Marsa Mubarak and then at Small Shenwa, in water that turtles and dugongs live in; both are wild, and a sighting is never promised. The programme names Marsa Mubarak, Small Shenwa and the marina, not Abu Dabbab Beach, the seagrass bay twenty-one kilometres down the same coast; no boat goes there.\n\nA buffet is laid out aboard, lunch or dinner depending on the sailing, and the last call of the day is Port Ghalib Marina, for a guided walk and the shops. Snorkelling gear is not in the price, so bring a set with you or raise it with the team first. The pickup time is settled when your booking is confirmed, and children have their own price.',
          highlights: [
            'Marsa Mubarak, then Small Shenwa',
            'Free time between the two stops',
            'An open buffet lunch or dinner',
            'A walk round Port Ghalib Marina',
          ],
          seo: {
            metaTitle: 'Two Bays, Then an Hour Round the Marina',
            metaDescription: 'Four and a half hours out of Marsa Alam: two guided stops in two bays, a buffet aboard and a walk round Port Ghalib Marina to close the day.',
          },
          images: [PHOTO.turtleInBlue],
          imageAlts: [ALT.turtleInBlue],
        },
      ],
    },
    {
      slug: 'elphinstone-reef',
      name: 'Elphinstone Reef',
      listingPath: '/trips',
      domain: 'elphinstonereef.com',
      city: 'Marsa Alam',
      area: 'Marsa Alam',
      pickupDestination: 'marsa-alam',
      coordinates: MARSA_ALAM,
      currency: 'USD',
      slugPrefix: 'elr-',
      foreignPlaces: NOT_MARSA,
      tagline: 'A sailing boat out of Port Ghalib',
      description: `Elphinstone Reef stands alone in the open sea about nine kilometres off the coast north of Marsa Alam, a spindle-shaped reef roughly six hundred metres long that is also recorded as Abu Hamra. It was named after John Elphinstone, twelfth Lord Elphinstone, and charted around 1830 by Robert Moresby while he was surveying the Red Sea. There is a plateau at each end: the northern one runs about eighty metres long and ten to twenty-five metres wide, covered in colourful soft corals and thick with life, while the deep part of the southern plateau is brown soft coral and swarms of anthias. Its east and west walls fall away past a hundred metres, and the open-sea position and the frequent current make it one of the demanding sites of southern Egypt rather than an easy one. Divers come for the chance of big fish: whitetip sharks on the southern plateau and along the western wall, with silky, hammerhead and grey reef sharks, tuna, amberjack, Napoleon wrasse and turtles, mantas and rays from July to October, and tiger sharks rarely.\n\nThis day sails from Port Ghalib to the bays of Marsa Mubarak and Marsa Shona; its programme does not name Elphinstone Reef, which stands alone in open water about twenty-five kilometres south of Marsa Shona and nine kilometres off the coast. One trip is sold here: the sailing boat out of the marina, morning or afternoon. ${CLOSING}`,
      seo: {
        metaTitle: 'Elphinstone Reef: the Port Ghalib Sailing Day',
        metaDescription: 'A sailing boat out of Port Ghalib to the bays of Marsa Mubarak and Marsa Shona: two guided stops of forty-five minutes and an open buffet on deck.',
        keywords: ['elphinstone reef marsa alam', 'port ghalib sailing boat day', 'marsa shona snorkelling stop', 'offshore spindle reef red sea', 'half day under sail marsa alam'],
      },
      theme: { primaryColor: '#0F4C81', secondaryColor: '#EEF4F8', accentColor: '#E2557F' },
      heroImages: [...HERO['elphinstone-reef'], PHOTO.snorkellerAndSails],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/elphinstone-reef/monogram.png',
      trips: [
        {
          path: 'sailing-boat-out-of-port-ghalib',
          price: P.MM_SAILING,
          title: 'Under Sail from the Marina, Morning or Afternoon',
          short: 'Four and a half hours under sail, morning or afternoon: forty-five minutes in the water in each of two bays, and a buffet served on deck.',
          description: 'The boat casts off twice a day, once in the morning and once after noon, and a shared bus runs you down from your Marsa Alam hotel roughly an hour and a half before it goes. Thirty-five minutes of sailing brings the first bay, where forty-five minutes are spent in the water; forty-five more follow at the second, both led by a guide. The programme names Port Ghalib, Marsa Mubarak and Marsa Shona, not Elphinstone Reef, which stands alone twenty-five kilometres south of the second bay; nothing sails there.\n\nA buffet is served on deck, with fizzy drinks and tea served through the day. The snorkelling gear is not in the price. Be at the marina half an hour before the boat goes and carry an ID card or a passport. Children have their own price.',
          highlights: [
            'Forty-five minutes in each bay',
            'Marsa Mubarak, then Marsa Shona',
            'A buffet laid out on deck',
            'A morning boat or an afternoon one',
          ],
          seo: {
            metaTitle: 'Under Sail from the Marina, Morning or Afternoon',
            metaDescription: 'A sailing boat out of Port Ghalib, morning or afternoon: forty-five minutes in the water in each of two bays, a buffet on deck and a hotel bus.',
          },
          images: [PHOTO.snorkellerAndSails],
          imageAlts: [ALT.snorkellerAndSails],
        },
      ],
    },
    {
      slug: 'sharm-el-luli',
      name: 'Sharm El Luli',
      listingPath: '/trips',
      domain: 'sharm-elluli.com',
      city: 'Marsa Alam',
      area: 'Marsa Alam',
      pickupDestination: 'marsa-alam',
      coordinates: MARSA_ALAM,
      currency: 'USD',
      slugPrefix: 'sll-',
      foreignPlaces: NOT_WADI_EL_GEMAL_BAY,
      tagline: 'The jeep day inland into Wadi El Gemal',
      description: `Sharm El Luli is a bay on the Red Sea coast about fifty-six kilometres south-south-east of Marsa Alam, roughly half way to Berenice and some six kilometres south-east of the entrance to Wadi El Gemal; its Arabic name means the al-Luli bay. It runs about twelve hundred metres from west to east and widens to seven hundred and thirty metres at its western end, and its beach is flat and white, changing width only with the tide before it carries on into a shallow sandy stretch of water that stays clear unless wind or fins stir the sand up. Outside the bay there are extensive coral reefs, more on the south side than the north, where the bottom drops to about twenty metres: hard and soft corals and anemones, with clownfish, Napoleon wrasse, pufferfish, butterflyfish and hawksbill turtles recorded. The bay lies inside Wadi El Gemal–Hamata National Park, declared in 2003, which also covers the inland wadi, its rock carvings and old mines and the islands off this coast, and nothing is built on the beach. One thing to know before you go looking for it: the bay and Ras Hankorab, a cape about seven kilometres to the south, are routinely treated as one place, and the bay is sold as Hankorab Beach as well.\n\nThis day drives inland into Wadi El Gemal to Cleopatra’s Temple and a desert spring; its programme does not name Sharm El Luli, the bay in the same park about thirty-two kilometres east of that temple, on the coast. One trip is sold here, and it is a desert day inland rather than a day at the bay: the jeep safari that ends with a Bedouin dinner. ${CLOSING}`,
      seo: {
        metaTitle: 'Sharm El Luli: the Wadi El Gemal Jeep Day',
        metaDescription: 'An afternoon and evening inland by jeep in Wadi El Gemal National Park: a panorama, a desert spring, Cleopatra’s Temple and a Bedouin dinner.',
        keywords: ['sharm el luli bay', 'wadi el gemal jeep safari', 'cleopatra temple and desert spring', 'bedouin dinner under the stars', 'wadi el gemal national park day'],
      },
      theme: { primaryColor: '#2F7D4F', secondaryColor: '#FFFDF7', accentColor: '#2BB3C0' },
      heroImages: [...HERO['sharm-el-luli'], PHOTO.camelInLagoon],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/sharm-el-luli/monogram.png',
      trips: [
        {
          path: 'jeep-safari-with-a-bedouin-dinner',
          price: P.WADI_EL_GEMAL,
          title: 'Into the Valley by Jeep, and Dinner Under the Stars',
          short: 'Seven hours from noon: inland by jeep into the national park for a high view, two desert trees, a spring and a temple ruin, then a Bedouin dinner.',
          description: 'Noon is the pickup, and the jeep turns off the coast road inland into the national park. What it halts for: a high view over the valley, an acacia, an arak tree, water rising in the desert, and the ruins of the temple named for Cleopatra. The programme names Wadi El Gemal, the temple and the spring, not Sharm El Luli, the bay on the coast thirty-two kilometres east of them; the jeep never reaches it.\n\nDinner is Bedouin and comes at the end, before the drive home. This is a day inland in the desert, not a day at the bay. Which order the halts come in is settled with your booking, and children have their own price.',
          highlights: [
            'A high view over the valley',
            'An acacia, then an arak tree',
            'Water rising in the desert',
            'Dinner the Bedouin way to close',
          ],
          seo: {
            metaTitle: 'Into the Valley by Jeep, and Dinner Under the Stars',
            metaDescription: 'Seven hours from noon, inland by jeep in Wadi El Gemal National Park: a high view, two desert trees, a spring, a temple ruin and a Bedouin dinner.',
          },
          images: [PHOTO.camelInLagoon],
          imageAlts: [ALT.camelInLagoon],
        },
      ],
    },
  ],
};
