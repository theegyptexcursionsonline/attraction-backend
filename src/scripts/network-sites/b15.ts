/**
 * Batch B15 (2 November 2026), the six places that follow B14. Two groups, the groups the selection itself uses:
 *
 * - B15A: three reefs off Hurghada — Erg Abu Ramada on the south-east flank of Abu Ramada island, Shabruhr Umm
 *   Gamar two kilometres south of its island, and Hamda on the north-east shore of the larger Giftun.
 * - B15B: three places on the coast south of Marsa Alam — Ras Hankorab and Qulaan inside Wadi El Gemal National
 *   Park, and Wadi Lahmy, where the valley of that name meets the sea below Hamata. Not in this file yet: see
 *   below.
 *
 * Every trip is built on the record the client publishes on its own main site, read into the dated snapshot
 * (`network-sites/eeo-snapshot.json`); prices, child rates, departures and inclusions are copied from that
 * record at apply time and never typed here. All four records this batch sells were already in the snapshot,
 * so no snapshot read was needed for it.
 *
 * THE "NEAREST DAYS" RULE, as batches B12 to B14 set it. No client day names any of these six places as a stop,
 * so a site takes the day the client's own records come closest to, and every page says plainly what its
 * programme names and that the programme does not name the site's own place. No page implies a stop, a mooring
 * or even a passing sight the record does not publish. When the client publishes a day that does stop at one of
 * these places, it replaces the trip sold here.
 *
 * What each site sells, and why (the coordinator's assignment of 2 November, `research/days.json`):
 * - Erg Abu Ramada is 4.10 km from Small Giftun, the nearer of the two Giftun islands, so it sells the
 *   three-island yacht day that works Orange Bay, Giftun and Magawish. Its own nearest named point is the
 *   Paradise Island beach, 3.53 km away, but both Paradise Island records are the days batch B14 assigned to
 *   North Abu Ramada — the same island as this erg — and the seed refuses both records outright (each departure
 *   prices a child as an adult). The six-island speedboat names Giftun too and is not taken, because four
 *   network sites already sell it against three for the three-island yacht.
 * - Shabruhr Umm Gamar is 10.16 km from the Dolphin House reef. All four of the client's Dolphin House days are
 *   at that distance and batch B14 sells every one, so the day taken is the one fewest network sites sell: the
 *   five-hour yacht with a seafood lunch, sold by B14's Shaab Abu Nugar alone. Fanadir North's single day is
 *   left alone, so that no two sites in the network carry the same one-day list.
 * - Hamda lies 52 m off the north-east shore of the larger Giftun island, and the day it sells is the afternoon
 *   yacht whose programme stops to snorkel at Giftun without saying where. Hamda is nearer to Giftun than Erg
 *   Abu Ramada is, so it keeps that day; its own line carries no kilometre figure, because its named point is
 *   the island it lies on and a figure would suggest it lies off the island.
 * - Ras Hankorab, Qulaan and Wadi Lahmy all sell the one day the client publishes that names a place inside
 *   their national park: the jeep safari inland to Cleopatra's Temple and a desert spring, which batch B14's
 *   Sharm El Luli also sells. Three sites on one day inside a batch is the owner's decision of 2 November, and
 *   it holds because the client's days leave no alternative: the nearest point any other day names is the
 *   dolphin reef off Marsa Alam, further from each of the three than the temple is. Each page says plainly how
 *   far that day is from its own place — about thirty-seven, sixty and eighty kilometres — and that the day
 *   stops nowhere on the coast.
 *
 * No programme is written here. Two are imported from batch B09, which first sold those records, and the third
 * from batch B14, which first wrote the second Dolphin House yacht (`PROGRAMMES_B14`), so the network says the
 * same thing about the same trip wherever it is sold. The southern group's one day is batch B09's too.
 *
 * Three of the "nearest" sentences the assignment gives are written with one clause changed, and nothing
 * else in the assignment moved. In each case the assignment's own words are word for word a run that a batch
 * B14 site already publishes about the SAME day, and no two sites on the network may carry the same clause:
 * - Shabruhr Umm Gamar's reads "sails north from Hurghada to the Dolphin House reef; its programme does not
 *   name", which batch B14's Shaab Abu Nugar and Fanadir North both publish about that reef. Here it says
 *   "runs north out of Hurghada to the Dolphin House reef, and its programme does not name".
 * - Erg Abu Ramada's ends "and Magawish; its programme does not name Erg", which is batch B14's Erg Sabina's
 *   on the same three-island day. Here the two clauses are joined with "and" instead of a semicolon.
 * - Wadi Lahmy's reads "inland into Wadi El Gemal, to Cleopatra's Temple and a desert spring; its programme
 *   does not name", which is batch B14's Sharm El Luli's on the same jeep day. Here the spring is named before
 *   the temple, and the clauses are joined with "and".
 * Everything else in all six sentences, the places and the distances above all, is the assignment's own.
 *
 * Names: one spelling per name everywhere, and the variants only where the facts give them and only once.
 * Shabruhr Umm Gamar is spelled that way throughout, with Sha'ab Ruhr, Shabrur, Shaab Rur and Shabrur Oum Gamar
 * named once in its tenant description; Hamda is Hamda throughout, with Stone Beach and Umm Dum named once, and
 * Lion's Head once as the one guide's name for it; Ras Hankorab carries Ras Honkorab and Hankorab Beach once;
 * Qulaan carries Qula'an, Qulan, El Qulaan and Al-Qula'an once; Wadi Lahmy carries the gazetteer's Marsa Wadi
 * Lahmi, the valley's Wadi Lahmi, and Wadi Lahami and Wadi Lehama, once each.
 *
 * Each site's facts come only from the batch's facts file, in this file's own plainer words, and a fact is left
 * out rather than stretched. Ras Hankorab says nothing at all about access, fees, facilities, who manages the
 * beach or the unresolved development dispute there, because no source settles any of it. Wadi Lahmy never
 * claims membership of the national park, which is unsettled.
 *
 * B15B IS NOT HERE YET, and the reason is its pictures. The one day those three sites sell publishes exactly ONE
 * photograph: a camel standing in shallow water between mangrove bushes (the same photograph batch B09's two
 * Wadi El Gemal sites and batch B14's Sharm El Luli carry). On a mangrove bay, a nesting beach and a valley
 * mouth with mangroves along its shore that photograph reads as the place itself, and the day never goes near
 * any of them, so the batch concepts forbid it on all three. No other photograph of that record exists anywhere
 * on the network or on the client's own page, which was read again on 2 November to be sure, so until each of
 * those sites has its own pictures it has no photograph it may publish and cannot be created. They follow in
 * their own group, in their own commit.
 *
 * Pictures here. Each of these three sites shows fewer than three distinct photographs of its own, because the
 * one day it sells publishes a single photograph, so each carries a `photoShortfall` note; its own two pictures
 * follow in their own commit, written as the upload results they are, so the creation run itself publishes them.
 * Every record photograph is described in the words the batch that first sold that record used.
 *
 * The logos are supplied at apply time: `--apply` refuses to run without `--logos=<file>` naming every site's
 * approved logo, logoDark and favicon, for every site of the group.
 */
import type { NetworkBatch, PriceSpec } from '../seed-network-sites';
import { PROGRAMMES_A as B09A, PROGRAMMES_B as B09B } from './b09';
import { PROGRAMMES_B14 as B14P } from './b14';

/** Every programme this batch sells; each is the batch that first sold the record. */
const P = {
  THREE_ISLANDS: B09A.HBT_THREE_ISLANDS,
  SUNSET: B09A.HBT_SUNSET,
  DOLPHIN_YACHT_LUNCH: B14P.DOLPHIN_YACHT_LUNCH,
  WADI_EL_GEMAL: B09B.WADI_EL_GEMAL,
} satisfies Record<string, PriceSpec>;

/**
 * Each record's own photograph, as the client publishes it, and the address the batch that first sold the
 * record carries. Read again on 2 November from the client's own page: each of these records publishes exactly
 * one photograph, and these are they.
 */
const PHOTO = {
  yachtAtSunset: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781893/tours/uaguqygoeo7djujix5fy.jpg',
  dolphinPair: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788791898/tours/xnv6gdxnnn9dxzs5pdhf.jpg',
  sailboatAtSunset: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788796522/tours/jxzuelgfb5r9vdl36xoa.jpg',
};

/** Each photograph described as it is, not as the trip it illustrates: the words batch B09 and B14 wrote for it. */
const ALT: Record<keyof typeof PHOTO, string> = {
  yachtAtSunset: 'A motor yacht in silhouette on the sea under an orange sunset, with hills on the horizon',
  dolphinPair: 'A dolphin swimming underwater in green-blue water, with a second dolphin behind it',
  sailboatAtSunset: 'A sailing boat on calm water with the sun setting low behind it',
};

/**
 * Each site's own two pictures, uploaded for this batch on 2 November 2026 and written here as the upload
 * results they are, so the creation run itself publishes them and no later picture write is needed. The first
 * opens the home page and the second carries the inner pages, the trip page among them. What each picture
 * shows is kept beside it: the tenant record has nowhere to store a description of a hero image (its
 * `heroImages` is a list of addresses), so these stay as notes until the storefront has a field for them.
 */
const HERO: Record<string, [string, string]> = {
  'erg-abu-ramada': [
    // A single soft-coral-covered outcrop rises from pale sand in violet-blue water while small orange fish circle it.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793636412/attractions-network/tenant-heroes/erg-abu-ramada/site-20261102-hero-8f06a430f66e.png',
    // Rounded pink, violet and apricot soft corals fill the frame with a few hard corals and small orange fish in the gaps.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793636415/attractions-network/tenant-heroes/erg-abu-ramada/site-20261102-second-e3665c65d549.png',
  ],
  'shabruhr-umm-gamar': [
    // A dark vertical reef wall with several cave-like recesses, sparse hard corals and lilac soft corals borders deep blue water.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793636416/attractions-network/tenant-heroes/shabruhr-umm-gamar/site-20261102-hero-29c6f4f878aa.png',
    // A steep dark reef wall descends through deep blue water with many small fish near the rock and three larger silver fish farther out.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793636419/attractions-network/tenant-heroes/shabruhr-umm-gamar/site-20261102-second-d35eb1d55bb1.png',
  ],
  hamda: [
    // Schools of small silver and yellow fish sweep over a sunlit hard-coral plateau that drops into deep blue water.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793636421/attractions-network/tenant-heroes/hamda/site-20261102-hero-b6d8084c9db4.png',
    // A curved hard-coral wall with layered cabbage corals rises from pale sand in clear green-blue water with a few small fish.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793636423/attractions-network/tenant-heroes/hamda/site-20261102-second-07246dc681d1.png',
  ],
  'ras-hankorab': [
    // A low dark rocky headland extends into a calm blue bay above a short curve of white sand in warm late-afternoon light.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793636425/attractions-network/tenant-heroes/ras-hankorab/site-20261102-hero-9500e18ea46d.png',
    // Dark coral patches show through clear shallow water beside clean white sand, with low bare desert ground on the horizon.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793636426/attractions-network/tenant-heroes/ras-hankorab/site-20261102-second-537d08d08878.png',
  ],
  qulaan: [
    // Five separate low grey-green mangrove clumps stand in calm pale-green shallows before a pale sand bar, a dark fringing reef line, and open sea.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793636428/attractions-network/tenant-heroes/qulaan/site-20261102-hero-012a11f3bec4.png',
    // A grey mangrove clump fills the right foreground beside a pale-green lagoon, with an irregular fringing reef line and blue open sea beyond.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793636430/attractions-network/tenant-heroes/qulaan/site-20261102-second-74d97298ed37.png',
  ],
  'wadi-lahmy': [
    // A broad pale gravel valley opens between dark desert hills onto a calm blue lagoon, with low mangroves along the right shore and open sea beyond.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793636433/attractions-network/tenant-heroes/wadi-lahmy/site-20261102-hero-4f5a45caa162.png',
    // A broad stony gravel wash with scattered scrub runs inland between low dark desert hills under a clear blue sky.
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793636436/attractions-network/tenant-heroes/wadi-lahmy/site-20261102-second-52648bf9f037.png',
  ],
};

/**
 * What each of the three southern sites shows on its day's card and on its trip page. The day they sell is the
 * one record on the network whose only photograph those pages may not show, and no photograph of the inland day
 * exists, so each shows its own inner-pages picture instead, which is what the batch concepts allow. Of the
 * three, only Wadi Lahmy's is a picture of the day's own country, a dry valley running inland; the other two
 * show the place the day never reaches, which is a gap the coordinator must close with a picture of the inland
 * day before these three go live.
 */
const INLAND_PICTURE = (slug: string): string => HERO[slug][1];

const HURGHADA = { lat: 27.2579, lng: 33.8116 };
const MARSA_ALAM = { lat: 25.0676, lng: 34.879 };

/**
 * Places these three reef sites never name: their boats leave Hurghada for the water off it, exactly as the
 * Hurghada boat site of batch B09 and the reef sites of batches B13 and B14 do, so that fence is the fence
 * here. It bars Sataya and Samadai by name, which is why the second Dolphin House yacht must carry the
 * schedule batch B14 wrote for it rather than its record's own.
 */
const NOT_HURGHADA_BOATS = /Cairo|Giza|Luxor|Aswan|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Gouna|Sahl|Makadi|Alexandria|Siwa|Bahariya|Fayoum|Sataya|Samadai/i;
/**
 * Places the three park and coast sites never name. It is the fence batch B14 gave the bay inside Wadi El
 * Gemal: batch B09's Wadi El Gemal fence with the bare word "Sharm" replaced by the town it is barred for, so
 * that Ras Hankorab can say which place it is not — Sharm El Luli, the bay seven kilometres up the same shore
 * that is routinely sold under this beach's name — without letting anything else through.
 */
const NOT_WADI_EL_GEMAL_COAST = /Gouna|Hurghada|Makadi|Sahl|Safaga|Soma Bay|Sharm El Sheikh|Sharm el-Sheikh|Dahab|Nabq|Tiran|Ras Mohamed|Catherine|Cairo|Giza|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur|Pyramid|Sphinx/i;

/** The closing line every B11 to B14 site ends on, and every site here. */
const CLOSING = 'Every trip collects you from your hotel and brings you back, and each page says what its own price covers. Hold a place online and pay later, or ask the team first about the pickup time.';

/** B15A: three of the reefs Hurghada's boats work, east and north-east of the town. */
export const B15A: NetworkBatch = {
  id: 'b15a',
  sites: [
    {
      slug: 'erg-abu-ramada',
      name: 'Erg Abu Ramada',
      listingPath: '/trips',
      domain: 'ergaburamadahurghada.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'ear-',
      foreignPlaces: NOT_HURGHADA_BOATS,
      tagline: 'Orange Bay, Giftun and Magawish by yacht',
      description: `Erg Abu Ramada, also called Camel Reef, is a coral erg off the south-east side of the small island of Abu Ramada, which lies south of Small Giftun. The guides list it on its own, apart from North Abu Ramada at the island’s north tip, from Abu Ramada South, and from Gota Abu Ramada, the reef they call the Aquarium about four kilometres to the south-west. It is one big erg with three peaks: they stand on a plateau above a sandy shelf and rise almost to the surface, and north of them the sand gives way to a coral garden. The site is open to the weather and its current is often strong, so it is dived less often than its neighbours — depending on the current, one guide writes, it can be heaven or hell — and that same current and exposure are what have kept it thickly covered in soft corals, with hard corals among them and clouds of small orange anthias over it. Caverns and small caves open in the erg, and moray eels are seen around the peaks. Two published positions for it lie forty metres apart, about a hundred and ninety metres off the island’s south-south-east shore.\n\nThis yacht day calls at Orange Bay, Giftun and Magawish, and its programme does not name Erg Abu Ramada, the three-peaked coral erg off the south-east side of Abu Ramada island, about four kilometres south of Small Giftun. Just the one trip is sold here: eight hours under way, with an island at either end of the day and the reserve between them. ${CLOSING}`,
      seo: {
        metaTitle: 'Erg Abu Ramada: Orange Bay, Giftun and Magawish',
        metaDescription: 'A yacht day out of Hurghada: an hour on Orange Bay, forty minutes in the Giftun reserve, an hour at Magawish and a seafood lunch served on board.',
        keywords: ['erg abu ramada camel reef', 'three island yacht out of hurghada', 'orange bay giftun and magawish day', 'abu ramada island soft coral erg', 'hurghada yacht day with a hotel car'],
      },
      theme: { primaryColor: '#1E1846', secondaryColor: '#FBF1EC', accentColor: '#A63E0E' },
      heroImages: [...HERO['erg-abu-ramada'], PHOTO.yachtAtSunset],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/erg-abu-ramada/monogram.png',
      trips: [
        {
          path: 'three-islands-in-one-sailing',
          price: P.THREE_ISLANDS,
          title: 'Orange Bay, Giftun and Magawish in One Sailing',
          short: 'Eight hours by yacht: an hour on Orange Bay, forty minutes in the Giftun reserve, an hour at Magawish and two snorkelling stops on the route.',
          description: 'Eight hours and three islands. An hour goes to Orange Bay, forty minutes to snorkelling inside the Giftun Island reserve and an hour to Magawish, with two stops in the water along the route and every island fee already settled. Its programme names those three islands, not Erg Abu Ramada, the erg off the south-east side of Abu Ramada island about four kilometres south of Small Giftun; no boat stops at the erg.\n\nA breakfast buffet is laid out while the yacht is still under way, and the main meal of the day is seafood; water, soft drinks, hot drinks and seasonal fruit are poured and passed round at no charge. Dolphins are wild, so the crew watch for them and nobody aboard promises one. A child pays a child’s price, and the car calls at your hotel in Hurghada in good time for a half past eight departure.',
          highlights: [
            'An hour ashore on Orange Bay',
            'Forty minutes inside the Giftun reserve',
            'Magawish for the last hour',
            'Two snorkelling stops along the route',
          ],
          seo: {
            metaTitle: 'A Yacht Day to Orange Bay, Giftun and Magawish',
            metaDescription: 'Eight hours by yacht from Hurghada: an hour on Orange Bay, forty minutes in the Giftun reserve, an hour at Magawish and two stops in the water.',
          },
          images: [PHOTO.yachtAtSunset],
          imageAlts: [ALT.yachtAtSunset],
        },
      ],
    },
    {
      slug: 'shabruhr-umm-gamar',
      name: 'Shabruhr Umm Gamar',
      listingPath: '/trips',
      domain: 'shabruhrummgamar.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'shu-',
      foreignPlaces: NOT_HURGHADA_BOATS,
      tagline: 'The Dolphin House by yacht, five hours',
      description: `Shabruhr Umm Gamar — written Sha’ab Ruhr, Shabrur, Shaab Rur and Shabrur Oum Gamar as well — is a small outlying reef lying south of Umm Gamar island, north-east of Hurghada. One atlas calls it an extension of the Umm Gamar reef and the guides list it as a site in its own right; its northern edge is about two kilometres south of the island, and the reef as mapped runs some five hundred metres across. Umm Gamar means mother of the moon, said to be for the island’s crescent shape, and a lighthouse stands on the island. Egypt’s national diving chamber counts this reef among the sites Hurghada is known for and calls it a sort of encyclopedia of the Red Sea: a relatively small reef crowded with reef species and open-water fish, badly damaged some years ago by an outbreak of crown-of-thorns starfish and once again a favourite of experienced divers. The reef is the top of an underwater mountain, its east side falling to great depths and its west side a wall pocked with small caves, and it is dived as a drift along those walls. The wreck of a small patrol boat lies on it: it struck the reef while anchoring, and part of it rests on the reef with the rest on a deeper ledge.\n\nThis yacht day runs north out of Hurghada to the Dolphin House reef, and its programme does not name Shabruhr Umm Gamar, the small reef south of Umm Gamar island, about ten kilometres south-east of the Dolphin House. One trip is sold here, and it runs five hours: an hour in the water at that reef, two guided snorkelling stops and a seafood lunch. ${CLOSING}`,
      seo: {
        metaTitle: 'Shabruhr Umm Gamar: a Dolphin House Yacht Day',
        metaDescription: 'Five hours by yacht out of Hurghada: an hour in the water at the Dolphin House reef, two guided snorkelling stops and a seafood lunch served aboard.',
        keywords: ['shabruhr umm gamar reef', 'dolphin house yacht five hours', 'umm gamar island lighthouse', 'drift wall diving north of hurghada', 'patrol boat wreck on the reef'],
      },
      theme: { primaryColor: '#2F3532', secondaryColor: '#F3F3EE', accentColor: '#5A3DB5' },
      heroImages: [...HERO['shabruhr-umm-gamar'], PHOTO.dolphinPair],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/shabruhr-umm-gamar/monogram.png',
      trips: [
        {
          path: 'five-hours-north-with-lunch-aboard',
          price: P.DOLPHIN_YACHT_LUNCH,
          title: 'Five Hours North, and Lunch Where the Boat Lies',
          short: 'Five hours afloat, morning or afternoon: sixty minutes where the dolphins rest, two guided stops in the water and a seafood meal on the way back.',
          description: 'Five hours afloat, and the sailing you want is chosen at booking: one leaves in the morning and the other after midday. Sixty minutes are given to the reef where dolphins feed and rest, with a swim; thirty more go to guided snorkelling on that reef, and thirty to the smaller one next door. Breakfast is laid on while the yacht is still heading out. Its programme names that reef and the smaller one by it, not Shabruhr Umm Gamar, the reef about ten kilometres south-east of the Dolphin House; the yacht turns for home well north of it.\n\nThe main meal is seafood, and the drinks that come with it are hot and cold; the banana ride and the sofa ride belong to a different option and are not in this price. A sighting is never promised, because these are wild animals in open water. Children are priced on their own, and a hotel beyond the town is something to raise with the team before booking.',
          highlights: [
            'A morning sailing or an afternoon one',
            'Sixty minutes in the water at the reef',
            'A smaller reef next door to it',
            'Breakfast under way, seafood later',
          ],
          seo: {
            metaTitle: 'Five Hours North, and Lunch Where the Boat Lies',
            metaDescription: 'Five hours afloat from Hurghada, morning or afternoon: an hour where the dolphins rest, two guided stops in the water and seafood on the way home.',
          },
          images: [PHOTO.dolphinPair],
          imageAlts: [ALT.dolphinPair],
        },
      ],
    },
    {
      slug: 'hamda',
      name: 'Hamda',
      listingPath: '/trips',
      domain: 'hamdahurghada.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'hmd-',
      foreignPlaces: NOT_HURGHADA_BOATS,
      tagline: 'An afternoon yacht out of Hurghada',
      description: `Hamda, also called Stone Beach and Umm Dum, and Lion’s Head by one guide, is a dive site on the north-east side of Big Giftun, the larger of the two Giftun islands, inside Giftun National Park. It is a plateau attached to the island’s reef wall: it begins at about fifteen metres and ends in steep walls that drop away into deep water, and a small bend in the island’s shore gives it some shelter from the wind. Most of the life is in the shallows above the plateau, where the schools of reef fish gather; moray eels are seen on the plateau and below it, turtles and sharks come by, and whale sharks have been seen here. Two dive registers publish its position twenty-one metres apart, about fifty metres off the island’s shore, and a third register’s own distances to its neighbours agree to within a hundred and fifty metres.\n\nThis afternoon yacht stops to snorkel at Giftun; its programme does not say where at Giftun, and it does not name Hamda, the plateau off the north-east shore of the larger Giftun island. One trip is sold here: the afternoon sailing, five hours with forty minutes in the water and a meal on the way home. ${CLOSING}`,
      seo: {
        metaTitle: 'Hamda: the Afternoon Yacht and Snorkelling Day',
        metaDescription: 'Five hours out of Hurghada on an afternoon yacht: an hour and a half under sail each way, forty minutes snorkelling at Giftun and a meal aboard.',
        keywords: ['hamda stone beach giftun', 'umm dum dive site big giftun', 'afternoon snorkelling yacht hurghada', 'giftun national park plateau', 'five hour yacht trip from hurghada'],
      },
      theme: { primaryColor: '#2E3A3F', secondaryColor: '#F4F1EA', accentColor: '#0B2D48' },
      heroImages: [...HERO['hamda'], PHOTO.sailboatAtSunset],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/hamda/monogram.png',
      trips: [
        {
          path: 'afternoon-yacht-and-a-stop-at-giftun',
          price: P.SUNSET,
          title: 'Out at Half Past Three, Snorkelling at Giftun',
          short: 'Five hours from half past three: an hour and a half under sail each way, forty minutes snorkelling at Giftun and calamari with chips aboard.',
          description: 'The car comes round at half past three, and the yacht works out along the coast for ninety minutes. Forty minutes go to snorkelling at Giftun, with the gear handed out and a guide on hand for anyone who does not swim, and then the yacht turns for home as the light drops. Its programme names the Red Sea and Giftun Island, not Hamda, the plateau off the north-east shore of the larger Giftun island; it does not say where at Giftun the boat stops, and nothing calls at the plateau.\n\nCalamari with fish and chips is served on the way back and the drinks keep coming. The nature reserve fee is paid on the day and is not part of this price, and neither are towels or underwater photographs. A child has a price of its own, and a pickup from beyond the town cannot be booked on this page.',
          highlights: [
            'An hour and a half under sail',
            'Forty minutes of snorkelling at Giftun',
            'A guide on hand for non-swimmers',
            'Calamari, fish and chips on the way back',
          ],
          seo: {
            metaTitle: 'An Afternoon Yacht from Hurghada, Snorkelling at Giftun',
            metaDescription: 'Out of Hurghada at half past three: an hour and a half under sail each way, forty minutes snorkelling at Giftun and calamari with chips aboard.',
          },
          images: [PHOTO.sailboatAtSunset],
          imageAlts: [ALT.sailboatAtSunset],
        },
      ],
    },
  ],
};

/** B15B: the nesting beach, the mangrove bay and the valley mouth, on the coast south of Marsa Alam. */
export const B15B: NetworkBatch = {
  id: 'b15b',
  sites: [
    {
      slug: 'ras-hankorab',
      name: 'Ras Hankorab',
      listingPath: '/trips',
      domain: 'rashankorabbeach.com',
      city: 'Marsa Alam',
      area: 'Marsa Alam',
      pickupDestination: 'marsa-alam',
      coordinates: MARSA_ALAM,
      currency: 'USD',
      slugPrefix: 'rhk-',
      foreignPlaces: NOT_WADI_EL_GEMAL_COAST,
      tagline: 'The jeep day inland, thirty-seven kilometres off',
      description: `Ras Hankorab, written Ras Honkorab as well and sold as Hankorab Beach, is a headland inside Wadi El Gemal National Park, standing on the Red Sea shore some sixty kilometres from Marsa Alam as a line is drawn, south-south-east of the town; its beach lies in the bay at the headland’s south-west foot, and the cape’s tip is a little under two kilometres away to the east-north-east. One thing to settle before reading about it elsewhere: this is not Sharm El Luli. That bay lies about seven kilometres to the north-north-west, and the two are routinely treated as one place — the map pin labelled Sharm El Luli sits on this beach, and in 2017 it read Sharm El Luli aka Hankorab beach. The beach is white sand on a calm, shallow bay, coral reefs lie just off it, and swimmers share the bay with sea turtles; endangered green turtles nest on the sand, coming ashore at night in the nesting season. The park’s own plan puts the beach at one position, and a map pin placed on the same shore in 2017 lies five hundred and seventy-three metres along it.\n\nThis day drives inland by jeep to Cleopatra’s Temple and a desert spring in Wadi El Gemal; its programme names no stop on the coast and does not name Ras Hankorab, the beach on the park’s shore about thirty-seven kilometres east-south-east of that temple. The whole of the one trip sold here is spent inland: the jeep safari up the valley, taking in the temple, the spring, two desert trees and a Bedouin dinner. ${CLOSING}`,
      seo: {
        metaTitle: 'Ras Hankorab: a Jeep Day Inland from the Beach',
        metaDescription: 'Seven hours from midday, by jeep into Wadi El Gemal National Park: the temple ruin, a desert spring, a lookout over the valley and dinner to close.',
        keywords: ['ras hankorab beach', 'hankorab beach wadi el gemal', 'green turtle nesting beach red sea', 'jeep safari inland from the coast', 'wadi el gemal day from marsa alam'],
      },
      theme: { primaryColor: '#1A2A33', secondaryColor: '#F6F1E7', accentColor: '#22325F' },
      heroImages: [...HERO['ras-hankorab']],
      photoShortfall: 'The one day this site sells publishes a single photograph, and it is the one photograph these pages may not show, so the site shows its own two pictures and no photograph of that record at all.',
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/ras-hankorab/monogram.png',
      trips: [
        {
          path: 'a-jeep-day-inland-from-the-beach',
          price: P.WADI_EL_GEMAL,
          title: 'Up the Valley by Jeep, and a Bedouin Dinner',
          short: 'Seven hours from midday, every one of them inland: the temple that carries Cleopatra’s name, water rising in the desert, two desert trees and dinner.',
          description: 'Midday is the pickup, and the jeep leaves the coast road for the park’s inland valley. It halts at the temple that carries Cleopatra’s name, at water rising in the desert, at an acacia and an arak, and at a lookout high over the valley floor. Its programme names the valley, the spring and the temple, not Ras Hankorab, the beach on the park’s shore about thirty-seven kilometres east-south-east of that temple; the jeep goes the other way and stops nowhere on the coast.\n\nA Bedouin dinner closes the day before the drive back, and the halts fall in whichever order the team confirms with your booking. Every hour of this day is spent inland in the desert, and none of it on the shore this site is named for. A child is priced apart from an adult.',
          highlights: [
            'The temple ruin in the valley',
            'Water coming up in dry desert',
            'A lookout high over the valley floor',
            'A Bedouin dinner to close',
          ],
          seo: {
            metaTitle: 'Up the Valley by Jeep, and a Bedouin Dinner',
            metaDescription: 'Seven hours from midday in the park’s inland valley: the temple ruin, water rising in the desert, a lookout, two desert trees and dinner.',
          },
          images: [INLAND_PICTURE('ras-hankorab')],
          imageAlts: ['Dark coral patches show through clear shallow water beside clean white sand, with low bare desert ground on the horizon.'],
        },
      ],
    },
    {
      slug: 'qulaan',
      name: 'Qulaan',
      listingPath: '/trips',
      domain: 'qulaanmangrovebeach.com',
      city: 'Marsa Alam',
      area: 'Marsa Alam',
      pickupDestination: 'marsa-alam',
      coordinates: MARSA_ALAM,
      currency: 'USD',
      slugPrefix: 'qln-',
      foreignPlaces: NOT_WADI_EL_GEMAL_COAST,
      tagline: 'An inland jeep day, sixty kilometres away',
      description: `Qulaan — also written Qula’an, Qulan, El Qulaan and Al-Qula’an — is a small bay at the mouth of Wadi Qulaan, within Wadi El Gemal National Park on the Red Sea shore, ninety kilometres or so below Marsa Alam and about eleven kilometres north-west of Hamata. Grey mangroves grow in the bay’s lagoon, standing in the water: a survey of the Egyptian Red Sea’s mangroves counts the Wadi Qulaan delta among its thirteen mangrove sites, and the trees shelter young fish and birds. A fringing coral reef rings the lagoon, and about nine kilometres offshore lie the Qulaan islands, a small archipelago named after the same wadi. A village of the Ababda, the park’s indigenous people, stands beside the bay: it lived by small-scale fishing, the park’s plan chose it as one of the places where the Ababda’s own culture and the mangroves would be shown to visitors, and it now lives partly from low-impact tourism.\n\nThis is an inland day by jeep, to Cleopatra’s Temple and a spring in the Wadi El Gemal desert, with no stop named on the coast; its programme does not name Qulaan, the mangrove bay and Ababda village on the shore about sixty kilometres east-south-east of that temple. Just one trip is sold here, and the day stays inland: the jeep safari into the park’s dry interior, ending with dinner. ${CLOSING}`,
      seo: {
        metaTitle: 'Qulaan: the Inland Jeep Day in Wadi El Gemal',
        metaDescription: 'A jeep day in the dry interior of Wadi El Gemal National Park: an acacia, an arak, water in dry ground, the temple ruin and dinner to finish.',
        keywords: ['qulaan mangrove bay', 'ababda village wadi el gemal', 'grey mangroves red sea lagoon', 'qulaan islands archipelago', 'inland jeep day from marsa alam'],
      },
      theme: { primaryColor: '#18231F', secondaryColor: '#F2F3EE', accentColor: '#1E5B57' },
      heroImages: [...HERO['qulaan']],
      photoShortfall: 'The one day this site sells publishes a single photograph, and it is the one photograph these pages may not show, so the site shows its own two pictures and no photograph of that record at all.',
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/qulaan/monogram.png',
      trips: [
        {
          path: 'the-day-that-stays-inland',
          price: P.WADI_EL_GEMAL,
          title: 'Inland All Day: the Jeep Run to the Temple',
          short: 'Seven hours away from the coast: an acacia and an arak, water in dry ground, a viewpoint, the temple ruin and dinner to finish the day.',
          description: 'The jeep collects you at midday and turns inland, away from the shore. It stops at an acacia and at an arak, at water in dry ground, at a viewpoint above the valley and at the temple ruin that carries Cleopatra’s name. The programme behind it names Wadi El Gemal, that temple and the desert spring, not Qulaan, the mangrove bay and Ababda village about sixty kilometres east-south-east of that temple; nothing on this day goes near the bay.\n\nThe dinner is the last thing on it, served before the road back, and the halts are put in order when the booking is confirmed. The whole of it happens in the desert: no part of this day is spent at the bay or among its mangroves. Children have a price of their own.',
          highlights: [
            'An acacia, then an arak',
            'Water in dry ground',
            'A viewpoint above the valley',
            'Dinner to finish the day',
          ],
          seo: {
            metaTitle: 'Inland All Day: the Jeep Run to the Temple',
            metaDescription: 'Seven hours inland from Marsa Alam: an acacia and an arak, water in dry ground, a viewpoint above the valley, the temple ruin and dinner.',
          },
          images: [INLAND_PICTURE('qulaan')],
          imageAlts: ['A grey mangrove clump fills the right foreground beside a pale-green lagoon, with an irregular fringing reef line and blue open sea beyond.'],
        },
      ],
    },
    {
      slug: 'wadi-lahmy',
      name: 'Wadi Lahmy',
      listingPath: '/trips',
      domain: 'wadilahmyredsea.com',
      city: 'Marsa Alam',
      area: 'Marsa Alam',
      pickupDestination: 'marsa-alam',
      coordinates: MARSA_ALAM,
      currency: 'USD',
      slugPrefix: 'wlh-',
      foreignPlaces: NOT_WADI_EL_GEMAL_COAST,
      tagline: 'Eighty kilometres inland, by jeep',
      description: `Wadi Lahmy is where the desert valley of Wadi Lahmi reaches the Red Sea, about nine kilometres south-east of Hamata; the gazetteer records the anchorage at the valley’s mouth as Marsa Wadi Lahmi and the valley itself as Wadi Lahmi, written Wadi Lahami and Wadi Lehama too, and the bay just to the south is known as Lahami Bay. The watercourse is seasonal, and its mapped course runs some fifty kilometres down from the interior before it reaches the sea here. About eight kilometres up the valley stood a station of the ancient road from Berenike to Edfu: a university survey of the Eastern Desert roads lists Wadi Lahma among that road’s stations, and an archaeological atlas places a fort there, beside the watercourse. Mangroves grow along the shore just north of the mouth, and Lahami Bay is listed for its mangroves as well. The bay is sheltered, with a sandy, gently sloping beach giving on to a shallow sandy lagoon and a fringing house reef, and the Fury Shoals lie offshore to the east, the nearest of them ten to twelve kilometres out.\n\nThis jeep day goes inland into Wadi El Gemal, to a desert spring and to Cleopatra’s Temple, and its programme does not name Wadi Lahmy, where the Wadi Lahmi valley meets the sea below Hamata, about eighty kilometres south-east of that temple. Only one trip is sold here, and the valley is where it goes, not the shore: the jeep safari to that spring and that temple, with dinner before the drive back. ${CLOSING}`,
      seo: {
        metaTitle: 'Wadi Lahmy: a Jeep Day Up the Valley',
        metaDescription: 'Eighty kilometres inland by jeep, into Wadi El Gemal: a spring in the desert, the temple ruin, a viewpoint, two desert trees and dinner.',
        keywords: ['wadi lahmy red sea', 'marsa wadi lahmi anchorage', 'berenike to edfu road station', 'mangroves below hamata', 'jeep day up the valley from marsa alam'],
      },
      theme: { primaryColor: '#3A2E24', secondaryColor: '#F1EEE7', accentColor: '#0F6680' },
      heroImages: [...HERO['wadi-lahmy']],
      photoShortfall: 'The one day this site sells publishes a single photograph, and it is the one photograph these pages may not show, so the site shows its own two pictures and no photograph of that record at all.',
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/wadi-lahmy/monogram.png',
      trips: [
        {
          path: 'the-valley-and-not-the-shore',
          price: P.WADI_EL_GEMAL,
          title: 'Eighty Kilometres Inland, and Dinner at the End',
          short: 'Seven hours by jeep, eighty kilometres up the country: a spring in the desert, the temple ruin, a viewpoint, two desert trees and dinner at dusk.',
          description: 'The jeep calls at midday and heads inland into the park’s valley. It stops at a spring in the desert, at the temple the maps call Cleopatra’s, at a viewpoint and at two desert trees, an acacia and an arak. What its programme names is the valley, its spring and the temple, not Wadi Lahmy, where the Wadi Lahmi valley meets the sea below Hamata, about eighty kilometres south-east of that temple; nothing on the day comes down to the coast.\n\nDinner is served before the road home, and the running order is fixed when the booking is confirmed. This is a desert day eighty kilometres from the valley’s mouth, and no part of it is spent at the sea. A child’s price is not an adult’s.',
          highlights: [
            'A spring in the desert',
            'The temple the maps call Cleopatra’s',
            'An acacia and an arak',
            'Dinner before the road home',
          ],
          seo: {
            metaTitle: 'Eighty Kilometres Inland, and Dinner at the End',
            metaDescription: 'A jeep day in Wadi El Gemal, eighty kilometres from this valley’s mouth: a spring, the temple ruin, a viewpoint and two desert trees.',
          },
          images: [INLAND_PICTURE('wadi-lahmy')],
          imageAlts: ['A broad stony gravel wash with scattered scrub runs inland between low dark desert hills under a clear blue sky.'],
        },
      ],
    },
  ],
};
