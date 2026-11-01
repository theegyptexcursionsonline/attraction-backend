/**
 * Batch B14 (1 November 2026), the ten reefs, bays and shores that take the network to 110. Two groups:
 *
 * - B14A: Shaab Abu Nugar, Fanous East, Careless Reef and Fanadir North, four reefs off Hurghada.
 * - B14B: the rest, in the message that follows.
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
 * Held back, and why (each is a question for the coordinator and the client in the build report):
 * - North Abu Ramada, the fifth site of this group, is NOT in the batch. Both days assigned to it are
 *   refused by the seed, so the site would have no trip at all, and nothing here invents one:
 *   · `from-hurghada-paradise-island-yacht-speedboat-cruise-with-snorkeling-lunch` and
 *     `makadi-bay-paradise-island-day-trip-with-snorkeling-lunch` each price their departures apart from the
 *     booking option itself. Every per-person option of both records doubles the child price at one or both
 *     of its two departures (the Hurghada-hotel option of the first sells at 46.50 adult and 23.25 child,
 *     while its own 11:30 departure sells at 46.50 for an adult AND for a child), so the seed cannot tell
 *     which figure a family pays and refuses the record outright. Batches B09 and B11 held the first back
 *     for the same reason; the second was read into the snapshot for this batch and carries the same fault.
 *   · The second record's one clean option, the 4-hour private speedboat, is priced per group rather than
 *     per person, which the seed also refuses.
 *   Reading the record in has therefore settled the coordinator's open question: the records are complete
 *   but self-contradictory on price. One field per departure is the client's to correct; until then this
 *   site has no day, and whether it waits or is swapped is the coordinator's call.
 * - `hurghada-orange-bay-snorkeling-diving-cruise-with-massage`, the only day assigned to Erg Sabina in
 *   B14B: the client publishes a price where the day's length should be ("$$69" on the record, "$69" on the
 *   option and on the published list), so there is no length to copy and nothing here invents one. The batch
 *   brief asks for the day to be sold with no length written for it, but the attraction schema requires a
 *   length on any trip that can be booked (`duration` is `requiredWhenBookable`), so a bookable trip without
 *   one is refused before it is written. The three ways out are the client correcting the one field, the day
 *   being sold by enquiry with no price, or the coordinator naming the length; all three are decisions, so
 *   the record stays held back exactly as batch B13 held it.
 * - `orange-island-premium-cruise-from-hurghada-with-lunch-transfer` names Orange Bay and the Orange Island
 *   entry fee and no Giftun island, which is why batch B13 could not carry it on a Giftun reef's page. It
 *   sits here on Fanous East, whose nearest named point is the larger Giftun itself, so the day is sold for
 *   what its own record says: a cruise out to Orange Island.
 *
 * The "nearest" sentence `research/days.json` gives Fanadir North reads "the long fringing reef the boat
 * passes on the way". No programme says the boat passes the reef, and the batch brief names that exact
 * phrase as one never to write, so this site's sentence states where the reef lies instead of what the boat
 * does. Nothing else in the assignment moved.
 *
 * Photographs are the ones each record publishes, already on the network's Cloudinary, with the four
 * Hurghada boat photographs described in the words batch B09 used for the same records. Each site here still
 * shows fewer than three distinct photographs of its own, so each carries a `photoShortfall` note; the two
 * pictures of each place follow in their own commit once the coordinator sends the upload results, and the
 * note goes with them. The four logos are an open question too: `--apply` refuses to run without
 * `--logos=<file>` naming every site's approved logo, logoDark and favicon, for all of them.
 */
import type { NetworkBatch, PriceSpec } from '../seed-network-sites';
import { PROGRAMMES_A as B09A } from './b09';

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

/** Each record's own photo, as the client publishes it. */
const PHOTO = {
  dolphinPair: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788791898/tours/xnv6gdxnnn9dxzs5pdhf.jpg',
  whiteSpeedboat: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788290634/tours/bgacpsik0esq6rcwnmmq.jpg',
  dayBoatAtAnchor: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788794476/tours/smf4lqwlugbxjepjbagn.jpg',
  parasailerOverTheBay: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788290048/tours/ncyahtmagpd4boacmjfh.jpg',
  yachtAndDolphins: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788289757/tours/h8x27bcg3l2oc311wf1k.jpg',
};

/**
 * Each photo described as it is, not as the trip it illustrates. Four are the words batch B09 wrote for the
 * same records; the parasailing photograph is new to the network and described here from the picture itself.
 */
const ALT: Record<keyof typeof PHOTO, string> = {
  dolphinPair: 'A dolphin swimming underwater in green-blue water, with a second dolphin behind it',
  whiteSpeedboat: 'A white speedboat with a blue stripe cutting across open water, leaving a wake',
  dayBoatAtAnchor: 'A white day boat at anchor in clear water near a low desert shore',
  parasailerOverTheBay: 'A parasailer under a wide striped canopy, towed by a small yellow speedboat across deep blue water, with a sandy cliff shore and moored boats behind',
  yachtAndDolphins: 'A white motor yacht on bright blue water, with a group of dolphins swimming at the surface in front of it',
};

const HURGHADA = { lat: 27.2579, lng: 33.8116 };

/**
 * Places these reef sites never name: their boats leave Hurghada for the water off it, exactly as the
 * Hurghada boat site of batch B09 does, so that batch's fence is the fence here.
 */
const NOT_HURGHADA_BOATS = /Cairo|Giza|Luxor|Aswan|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Gouna|Sahl|Makadi|Alexandria|Siwa|Bahariya|Fayoum|Sataya|Samadai/i;

/** The closing line every B11, B12 and B13 site ends on, and every site here. */
const CLOSING = 'Every trip collects you from your hotel and brings you back, and each page says what its own price covers. Hold a place online and pay later, or ask the team first about the pickup time.';

/** Why each site shows fewer than three photographs of its own until its own pictures are uploaded. */
const SHORTFALL_ONE = 'The one day this site sells publishes a single photograph, so the home page opens on it until the site’s own pictures are added; the photographs are an open question for the client.';
const SHORTFALL_TWO = 'The three days this site sells publish two distinct photographs between them, so the home page opens on those until the site’s own pictures are added; the photographs are an open question for the client.';

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
      heroImages: [PHOTO.dolphinPair, PHOTO.whiteSpeedboat],
      photoShortfall: SHORTFALL_TWO,
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
      heroImages: [PHOTO.dayBoatAtAnchor],
      photoShortfall: SHORTFALL_ONE,
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
      description: `Careless Reef stands in open water about an hour north-east of Hurghada, in the gap that separates the Umm Gamar reefs from Giftun Island, and runs roughly two hundred metres. Its spelling is disputed: the national register of dive sites and one guide print Carless, while another prints the longer form and calls that the right one, so this site uses Careless throughout. The reef rises from deep water as though pushed up from the abyss, with two large coral towers standing on a plateau of coral gardens and a smaller pinnacle at the southern end; the plateau tilts towards an edge that drops straight down, coral forests on the northern drop-off and small coral towers on the southern side. It is known above all for a large resident group of unusually tolerant moray eels of several species, which the guides put down to years of fish-feeding and which will hold still for a camera. It has no shelter of its own and the current is strong and not reliably northerly, so boats reach it only in good weather — and that same current carries in the food that makes it so rich. Nudibranchs, turtles, whitetip reef sharks, tuna, big groupers and giant trevallies are all recorded, with a resident school of bannerfish to the north.\n\nThis day is spent at Orange Bay on Big Giftun; its programme does not name Careless Reef, which stands in open water about ten kilometres north of the island. One trip is sold here: the island day with two snorkelling stops, a buffet lunch and one parasailing flight for every guest. ${CLOSING}`,
      seo: {
        metaTitle: 'Careless Reef: an Orange Bay Day with Parasailing',
        metaDescription: 'A day out of Hurghada to Orange Bay: two guided stops in the water, time ashore with the entry covered, a buffet lunch and one parasailing flight each.',
        keywords: ['careless reef hurghada', 'orange bay day with parasailing', 'moray eel dive site hurghada', 'orange bay island entry covered', 'hurghada island day with a flight'],
      },
      theme: { primaryColor: '#10141F', secondaryColor: '#E7D9B8', accentColor: '#E06A4E' },
      heroImages: [PHOTO.parasailerOverTheBay],
      photoShortfall: SHORTFALL_ONE,
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
      heroImages: [PHOTO.yachtAndDolphins],
      photoShortfall: SHORTFALL_ONE,
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
