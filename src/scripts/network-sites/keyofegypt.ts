/**
 * Key of Egypt Tours (5 November 2026): one site, number 129 on the network, for a brand the client sent a logo
 * for and asked a site for. It is a tour company of Egypt's Nile valley rather than a place, so none of the
 * "nearest days" machinery of batches B12 to B16 applies here: no site place to disclaim, no distance to give or
 * withhold, and no sentence anywhere saying what a programme does not name.
 *
 * DOMAIN. The client sent the brand first and the owner's instruction was to proceed on the brand alone; the
 * domain followed the same day: `keyofegypt.travel`. As for every network site, the seed writes the network
 * address as `domain` and leaves `customDomain` to its own step after DNS (the gateway bind).
 *
 * WHAT THE COMPANY IS. Only its name and its badge are known. Nothing here claims more: no trading history, no
 * licence or registration, no address, no telephone number, no team, no counts, no ratings and no superlative,
 * and no word of the sort is written anywhere on the site, because nothing published anywhere says it. The
 * tenant description says plainly what the site is — an independent seller of day trips another company
 * publishes and operates — and what those days are. Every trip's words are written here from its own record and
 * nothing else; every price, child rate, option, start time, inclusion and schedule is copied from the client's
 * published record at apply time, read through the dated snapshot (`network-sites/eeo-snapshot.json`), and not
 * one of them is typed in this file.
 *
 * THE EIGHT DAYS, AND WHY EACH. The brand is the Nile valley, so the selection is the valley's own days from the
 * client's catalogue: a spread of towns (five from Cairo or Giza, two from Luxor, one from the Marsa Alam coast),
 * a spread of lengths (five hours to a day that starts at three in the morning) and both ways of taking a day
 * where a record offers both.
 * - `giza-pyramids-sunrise-morning-guided-tour-with-camel-ride-breakfast`: the plateau itself, the shortest day
 *   of the eight, and the only one sold in a shared group at a choice of a first-light or a mid-morning start.
 *   Its private option leaves at other times and so cannot be sold as the same trip (the rule batch B03 set).
 * - `giza-pyramids-sphinx-grand-egyptian-museum-private`: the plateau and the Sphinx with the museum out at
 *   Giza, privately, over a whole day. The sharing option carries no entry tickets and leaves at another time,
 *   so only the private one is sold.
 * - `giza-pyramids-sakkara-memphis-day-tour-with-nile-sail`: Saqqara and Memphis, which the brand's own ground
 *   needs, with the plateau on the way. Three of its options leave together — a shared day in English and two
 *   private days, one of them guided in Italian or Spanish — so this is the one trip of the eight that offers
 *   shared and private side by side.
 * - `cairo-egyptian-museum-citadel-coptic-cairo-nile-dinner-cruise`: the museum on Tahrir Square, the Citadel
 *   and the churches of the old Christian quarter, and the river itself at the end of it; the longest Cairo day
 *   the client publishes with its tickets inside the price.
 * - `cairo-private-heritage-tour-museum-citadel-old-cairo`: the same quarter in a short shared afternoon, for a
 *   guest who wants the museum and the old streets without a whole day. Its shared option is the only one of
 *   that record sold here.
 * - `luxor-east-west-bank-private-tour-with-traditional-felucca-nile-cruise`: Luxor's two banks in one private
 *   day, the valley's other half. The record collects from East Bank hotels only, and the trip says so.
 * - `luxor-sunset-felucca-ride-karnak-sound-and-light-show`: an hour under sail and the lit temple after dark,
 *   the one evening the client publishes in Luxor.
 * - `marsa-alam-to-luxor-valley-of-the-kings-ancient-temples-tour`: the long day up to Luxor from a Red Sea
 *   hotel, which the brief asks for where a record sells it. Of the two such records the client publishes, this
 *   is the one an earlier batch already sells, so its programme is imported rather than written again; the
 *   Makadi Bay record of the same shape is written nowhere on the network and is left for a later pass.
 * Nothing in the client's published list reaches Aswan or Abu Simbel as a day: the only records that stand
 * before those monuments are the multi-day trips with hotels, flights and a Nile cruise, which no day trip on
 * the network sells and which no day here can describe without naming towns it does not serve. So the selection
 * of days has no Aswan and no Abu Simbel day, and claims none. Two of those multi-day records are sold on this
 * site as packages instead, each naming its own record's towns, and they are written by their own seed
 * (`seed-keyofegypt-packages.ts`); this file and this site's fence cover the eight days only.
 *
 * Every one of the eight records is already sold by an earlier batch, so this file writes no programme of its
 * own at all: each is imported from the batch that first sold it, which keeps the network saying the same thing
 * about the same day wherever it is sold. Every trip title is this site's own, and differs from every other
 * site's title for the same record.
 *
 * ONE COPIED LINE IS CONDITIONAL, and it is named here so a changed record cannot slip another one in beside it.
 * The Giza, Sakkara and Memphis record lists among its inclusions "Visits: Papyrus Gallery, Oils Factory,
 * Bazaar, Cotton Store, Carpet School (upon request)", a shopping stop that holds for every option it publishes
 * and therefore for every option sold here. Three sites already live on the network carry that line for this
 * record, and rewriting it would mean editing the shared programme and changing those three sites, which this
 * work may not do. So it is carried exactly as they carry it, and the test beside this file holds it to being
 * the only conditional or on-request line anywhere in the catalogue.
 *
 * PICTURES: no new ones were made. Every photograph here is one the client already publishes on a record this
 * site sells and the network already shows, at the exact address and with the exact words the batch that first
 * published it carries, so no photograph on the network is described two ways. None is a photograph of the
 * company, so the site carries a `photoShortfall` note saying so in its own words.
 *
 * THE LOGO is the client's own badge, uploaded by the coordinator on 5 November. It is a round mark that reads
 * on a light and on a dark surface, so there is no separate dark version: with no `--logos` file the tenant
 * record carries the same badge as logo, dark logo and favicon. `--apply` still refuses to run without
 * `--logos=<file>`, which for this site names that one address three times.
 */
import type { NetworkBatch, PriceSpec } from '../seed-network-sites';
import { PROGRAMMES as B03P } from './b03';
import { PROGRAMMES as B03RP } from './b03-rest';
import { PROGRAMMES_D as B08DP } from './b08';
import { PROGRAMMES_B as B09BP } from './b09';

/** Every programme this site sells; each imported from the batch that first sold its record. */
const P = {
  GIZA_SUNRISE: B03P.GPP_SUNRISE,
  GIZA_AND_GEM: B03P.PGE_GEM,
  GIZA_SAKKARA_MEMPHIS: B03P.MAS_WITH_GIZA,
  CAIRO_AND_THE_RIVER: B08DP.EGM_DINNER_CRUISE,
  CAIRO_SHARED_AFTERNOON: B08DP.EGM_OLD_CAIRO_SHARED,
  LUXOR_BOTH_BANKS: B03RP.TOK_BOTH_BANKS,
  LUXOR_AFTER_DARK: B03RP.TOK_SOUND_AND_LIGHT,
  LUXOR_FROM_THE_COAST: B09BP.MA_LUXOR,
} satisfies Record<string, PriceSpec>;

/**
 * The photographs this site shows, every one already published on the network, at the exact address the batch
 * that first published it carries. No upload is made for this site.
 */
const PHOTO = {
  // b03: the Giza plateau, Memphis and Sakkara, and Luxor records.
  camelAtSunrise: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792927953/attractions-network/network-b03/giza-plateau-pyramids/yoge0wgzwbrw8zhfeels.jpg',
  pharaohStatue: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792927957/attractions-network/network-b03/pyramids-of-giza-egypt/pb4ohpdfkiik9alomm7s.jpg',
  stepPyramid: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792927961/attractions-network/network-b03/memphis-and-sakkara/m87zl1cmmc4kcv2nrv4o.jpg',
  feluccasAtCairo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792927962/attractions-network/network-b03/memphis-and-sakkara/i7hlesmpg9oel1enka8o.jpg',
  feluccaAtLowSun: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936145/attractions-network/network-b03/temple-of-karnak/bmqezftsbjtqygdtskec.jpg',
  litColonnade: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936147/attractions-network/network-b03/temple-of-karnak/bsqcfguowy889djhoxqd.jpg',
  // b08: the Cairo museum, Citadel and Old Cairo records.
  mosqueSkyline: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085638/attractions-network/network-b08/egyptian-museum/xqrhaaoye6bbkayz8vl8.jpg',
  domedMosqueAndFlags: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085642/attractions-network/network-b08/egyptian-museum/ujbyb8aj5cxiaqgtiboj.jpg',
  // b09: the Marsa Alam to Luxor record.
  paintedCorridor: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788795436/tours/ofxkew9zdcef0leaoqhp.jpg',
  // b10: the Giza plateau photograph the network publishes on the sunrise record.
  threePyramids: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787780674/tours/cyqhwwakyack600gfghk.jpg',
};

/**
 * Each photograph described as it is, not as the day it stands beside: the words the batch that first published
 * it wrote for it, word for word, so no photograph on the network is described two ways.
 */
const ALT: Record<keyof typeof PHOTO, string> = {
  camelAtSunrise: 'A saddled camel standing between two pyramids, with the sun low in a yellow sky behind it',
  pharaohStatue: 'A dark granite statue of a pharaoh in a striped headcloth with a cobra at the brow, standing beside a pale stone wall with a modern building and palms behind',
  stepPyramid: 'The stepped pyramid at Sakkara rising behind the restored stone walls and doorways of its funerary enclosure, across open sand',
  feluccasAtCairo: 'Two feluccas under white sails on the river, with the Cairo waterfront, a tall latticed tower and palms behind',
  feluccaAtLowSun: 'A felucca under a tall white sail on the Nile at low sun, with small motorboats carrying passengers and a town along the far bank',
  litColonnade: 'Lit stone columns and standing pharaoh statues of a temple colonnade at night, against a dark blue sky',
  mosqueSkyline: 'Domes and minarets of old stone mosques rising above low rooftops, with the modern city on the skyline behind',
  domedMosqueAndFlags: 'A large mosque with a central dome, half-domes and two tall minarets against a clear sky, with flags flying beside it',
  paintedCorridor: 'A long painted corridor cut into rock, with a wooden walkway and handrails leading down',
  threePyramids: 'The three Giza pyramids under a blue sky with white cloud, the smaller queens’ pyramids and loose blocks in front and rippled sand in the foreground',
};

/**
 * What the site shows on its pages, in the order the creation run writes it: the home page's opening photograph
 * first, then the one its inner pages carry. Both are photographs the client publishes on records this site
 * sells, and neither is a photograph of the company.
 */
const SITE_PICTURES: Record<string, string[]> = {
  'key-of-egypt-tours': [PHOTO.feluccasAtCairo, PHOTO.threePyramids],
};

/** Why the site opens on no photograph of its own subject: there is none, and none was made. */
const SHORTFALL: Record<string, string> = {
  'key-of-egypt-tours': 'No photograph of this company could be made for the site, and none of its own is reused, so it shows two the client publishes on days the site sells: feluccas under sail on the river at Cairo, and the three pyramids of the Giza plateau. Neither is a photograph of the company.',
};

const CAIRO = { lat: 30.0444, lng: 31.2357 };
const LUXOR = { lat: 25.6871, lng: 32.6346 };
const MARSA_ALAM = { lat: 25.0676, lng: 34.879 };

/**
 * The site's fence. Its days work three places — Cairo and Giza with Saqqara, Memphis and Dahshur below them,
 * Luxor on both banks, and the Marsa Alam coast the long Luxor day leaves from — so those are the places it may
 * name. What it bars is every other town and monument the client sells, Aswan and Abu Simbel among them, so no
 * page and no copied line can read as if this site sold a day there. El Quseir is barred in both spellings the
 * records use: one record's own schedule names the town, and this site sells that day as the Marsa Alam day its
 * own inclusions and exclusions describe.
 */
const NOT_THE_NILE_VALLEY = /Hurghada|Sharm|Dahab|Nuweiba|Taba|Nabq|Tiran|Ras Mohamed|Ras Muhammad|Catherine|Quse[ie]r|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Hamata|Alexandria|Aswan|Abu Simbel|Siwa|Bahariya|Fayoum|Dendera|Edfu|Kom Ombo|Abydos|White Desert/i;

/** The closing line every B11 to B16 site ends on, and this one. */
const CLOSING = 'Every trip collects you from your hotel and brings you back, and each page says what its own price covers. Hold a place online and pay later, or ask the team first about the pickup time.';

/** Key of Egypt Tours: eight of the client's Nile valley days, sold under a brand that claims nothing. */
export const KEYOFEGYPT: NetworkBatch = {
  id: 'keyofegypt',
  sites: [
    {
      slug: 'key-of-egypt-tours',
      name: 'Key of Egypt Tours',
      listingPath: '/trips',
      // The client's domain, named on 5 Nov after the brand.
      domain: 'keyofegypt.travel',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'koe-',
      foreignPlaces: NOT_THE_NILE_VALLEY,
      tagline: 'Nile valley days from Cairo, Luxor and the coast',
      description: `Key of Egypt Tours is a name and a badge, and this site claims nothing else about the company behind them: no trading history, no licence, no office, no telephone number, no team and no figure of any kind, because nothing published anywhere says any of it. What the site is, plainly, is an independent seller of day trips another company publishes and runs. Each day on these pages is one of that company's own records, sold at the price that record publishes, with its own booking options, start times, inclusions and schedule carried across and nothing added to them. The days are the valley's own: the Giza plateau and the Sphinx, the museum on Tahrir Square and the newer one out at Giza, the Citadel above the city and the churches of the old Christian quarter below it, the stepped pyramid at Sakkara and the ruined capital at Memphis, Luxor on both banks with Karnak lit after dark, and the long run up to Luxor from a hotel on the Marsa Alam coast.

Eight trips are on sale here, shared and private, from five hours that begin before first light to a day that starts at three in the morning and ends back at the coast. Each page names the record its day is built on and which of that record's booking options this site sells, and where a published line holds only for an option sold elsewhere, the page says so instead of letting the promise stand. Two of the eight collect from a narrower area than the rest, and each of those says where on its own page. ${CLOSING}`,
      seo: {
        metaTitle: 'Key of Egypt Tours: Cairo, Luxor and Nile Valley Days',
        metaDescription: 'Eight published day trips in the Nile valley: the Giza plateau and the Sphinx, the Cairo museums and old quarter, Sakkara and Memphis, and both banks at Luxor.',
        keywords: [
          'key of egypt tours nile valley day trips',
          'giza plateau and sphinx guided day',
          'tahrir square museum and old quarter day',
          'luxor east and west bank private day',
          'luxor day trip from the marsa alam coast',
        ],
      },
      theme: { primaryColor: '#0B3A4E', secondaryColor: '#F7F2E7', accentColor: '#B8862B' },
      heroImages: [...SITE_PICTURES['key-of-egypt-tours']],
      photoShortfall: SHORTFALL['key-of-egypt-tours'],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793880149/attractions-network/tenant-logos/key-of-egypt-tours/client-0d02a3b1fadd.png',
      trips: [
        {
          path: 'five-hours-an-hour-in-the-saddle-two-among-the-pyramids',
          price: P.GIZA_SUNRISE,
          title: 'Five Hours: an Hour in the Saddle, Two Among the Pyramids',
          short: 'The shortest of the eight, taken in a group: sixty minutes in the saddle out on the sand, breakfast, then two guided hours inside the pyramid complex.',
          description: 'Pick the start that suits you: the record publishes a first-light one and a mid-morning one, and the vehicle is at your hotel in Cairo or Giza for whichever you choose. An hour goes in the saddle — a camel or a horse, whichever the morning gives you — out on the sand below the pyramids. Breakfast follows, and after it two hours inside the complex with an Egyptologist guide, among the pyramids of Khufu, Khafre and Menkaure and up to the Sphinx. The entry to the complex is settled inside this price.\n\nThe option sold here is the shared one: you ride and walk with other guests, in one vehicle and behind one guide, and a child pays the adult price. Wear shoes you can walk sand in, bring a hat and something for the sun, and take the first-light start if you would rather have the plateau before the heat.',
          highlights: [
            'A first-light or a mid-morning start',
            'Sixty minutes up in the saddle',
            'Breakfast between the ride and the walk',
            'Two guided hours and the complex entry',
          ],
          seo: {
            metaTitle: 'An Hour in the Saddle and Two Among the Giza Pyramids',
            metaDescription: 'Five shared hours from a Cairo or Giza hotel: sixty minutes in the saddle below the plateau, breakfast, then two guided hours inside the complex.',
          },
          images: [PHOTO.camelAtSunrise],
          imageAlts: [ALT.camelAtSunrise],
        },
        {
          path: 'a-private-day-between-the-plateau-and-the-new-museum',
          price: P.GIZA_AND_GEM,
          title: 'A Private Day Between the Plateau and the New Museum',
          short: 'A whole day with your own guide and vehicle: the plateau for three hours, the Sphinx for one, the museum out at Giza for three more, every ticket paid.',
          description: 'The vehicle is at your hotel in Cairo or Giza for nine, and the day is yours alone. Three hours go to the plateau on foot with an Egyptologist guide, and an hour more to the Sphinx and the ground around it. Then an hour in which to find your own lunch, because this option does not carry one. The afternoon runs to three more hours, indoors this time, at the Grand Egyptian Museum out at Giza: part of it with the guide, part of it yours to wander. The entry to the pyramids, to the Sphinx and to the museum is inside the price.\n\nA child has its own price on this day, and the team confirms which ages count as children when it confirms the booking. Pickup from outside Cairo or Giza is charged on top and cannot be booked here, so tell the team where you are staying first if your hotel is further out.',
          highlights: [
            'A guide and a vehicle of your own, all day',
            'Three hours on the plateau, one at the Sphinx',
            'Three hours in the museum out at Giza',
            'The entry to all three inside the price',
          ],
          seo: {
            metaTitle: 'A Private Day: the Plateau, the Sphinx and the New Museum',
            metaDescription: 'A private day from a Cairo or Giza hotel: the plateau for three hours, the Sphinx for one, then three more indoors at the Grand Egyptian Museum.',
          },
          images: [PHOTO.pharaohStatue],
          imageAlts: [ALT.pharaohStatue],
        },
        {
          path: 'shared-or-private-giza-sakkara-and-the-ruins-of-memphis',
          price: P.GIZA_SAKKARA_MEMPHIS,
          title: 'Shared or Private: Giza, Sakkara and the Ruins of Memphis',
          short: 'One day, three ways of taking it: the plateau for two hours, the stepped pyramid at Sakkara, and the ruins of the old capital at Memphis.',
          description: 'The vehicle leaves your hotel in Cairo or Giza at eight and runs half an hour out to the plateau, where two guided hours go among the pyramids and the Sphinx. The road then turns south: an hour at Sakkara for the stepped pyramid of Djoser and the tombs around it, and an hour at Memphis, where the old capital lies in ruins. The drive back is another half hour. The entry tickets for the stops the day makes are inside the price; lunch is not, on any of the three ways of booking it.\n\nThose three leave together, which is why they sit on one page: a shared day guided in English, the same day privately with your own guide and vehicle, and that private day guided in Italian or in Spanish instead. Children have their own price on the options that publish one; on the other they pay the adult price, and the team confirms the ages when it confirms the booking.',
          highlights: [
            'Two guided hours on the plateau',
            'The stepped pyramid and the tombs at Sakkara',
            'The ruined capital at Memphis',
            'Shared in English, or private in one of three languages',
          ],
          seo: {
            metaTitle: 'Giza, Sakkara and Memphis: Shared or Private in a Day',
            metaDescription: 'From a Cairo or Giza hotel at eight: two guided hours on the plateau, the stepped pyramid of Djoser at Sakkara, and Memphis in ruins, tickets paid.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'twelve-hours-tahrir-square-the-citadel-four-churches-and-the-river',
          price: P.CAIRO_AND_THE_RIVER,
          title: 'Twelve Hours: Tahrir Square, the Citadel, Four Churches and the River',
          short: 'A private twelve-hour day across the city: two hours in the museum, the mosque inside the Citadel, four old churches, and dinner afloat on the Nile.',
          description: 'Your own air-conditioned vehicle is at the door in Cairo or Giza for nine, for ten or for eleven, whichever start you book. Two hours go to the museum on Tahrir Square with your own guide. An hour goes to the Mosque of Muhammad Ali Pasha inside the walls of the Citadel, and lunch at a local restaurant follows it. Then the old Christian quarter, four churches in turn: the Hanging Church, the Ben Ezra Synagogue beside it, St Barbara and St Sergius and St Bacchus. The entry fees for the sites the day visits are inside the price.\n\nThe last two hours are on the water, at dinner on a Nile cruise with entertainment on board. Drinks at lunch and at dinner are not in the price, and nor is anything you choose to tip. This day goes to the museum on Tahrir Square in the middle of the city, not to the newer museum out at Giza. A child has its own price, confirmed with your booking.',
          highlights: [
            'Two hours in the museum on Tahrir Square',
            'The mosque inside the Citadel walls',
            'Four churches of the old quarter in turn',
            'Dinner afloat to close the day',
          ],
          seo: {
            metaTitle: 'Twelve Hours in Cairo, Ending at Dinner on the Nile',
            metaDescription: 'A private twelve-hour Cairo day: two hours in the museum on Tahrir Square, the Citadel mosque, lunch, four old churches, and dinner afloat.',
          },
          images: [PHOTO.domedMosqueAndFlags],
          imageAlts: [ALT.domedMosqueAndFlags],
        },
        {
          path: 'an-eleven-oclock-start-the-museum-the-old-quarter-and-the-bazaar',
          price: P.CAIRO_SHARED_AFTERNOON,
          title: 'An Eleven O’Clock Start: the Museum, the Old Quarter and the Bazaar',
          short: 'A short shared afternoon with a licensed guide: the museum on Tahrir Square, the churches of the old quarter, then the lanes of Khan el-Khalili.',
          description: 'This is the short way to take the city. The vehicle is at your Cairo or Giza hotel for eleven, and the group’s first stop is the museum on Tahrir Square, walked through its halls with a licensed English-speaking guide. The old Christian quarter follows, the historic churches around the Fort of Babylon, and after it the alleyways of Khan el-Khalili and the shops along them. The entry tickets for the museum and for the churches of the quarter are inside the price. Lunch is not, and nor are drinks or anything you buy for yourself.\n\nThe option sold here is the shared one, so the vehicle and the guide are shared, and children and infants pay what adults pay. Carry your passport or an identity card, and something to pay with in the market. The record publishes this as a day of three to five hours, so the afternoon runs with the traffic rather than to a clock. It is the museum on Tahrir Square, not the newer one out at Giza.',
          highlights: [
            'An eleven o’clock start, three to five hours',
            'The museum on Tahrir Square with a guide',
            'The churches around the Fort of Babylon',
            'The lanes of Khan el-Khalili to finish',
          ],
          seo: {
            metaTitle: 'A Shared Afternoon: the Museum, Old Cairo and the Bazaar',
            metaDescription: 'A shared afternoon from eleven: the museum on Tahrir Square, the churches of the old quarter and the lanes of Khan el-Khalili, tickets included.',
          },
          images: [PHOTO.mosqueSkyline],
          imageAlts: [ALT.mosqueSkyline],
        },
        {
          path: 'west-bank-in-the-morning-a-sail-and-two-temples-after',
          price: P.LUXOR_BOTH_BANKS,
          title: 'West Bank in the Morning, a Sail, and Two Temples After',
          short: 'Eight hours in Luxor with a guide and a driver of your own: the royal tombs, Hatshepsut, the Colossi, lunch, a sail across, then two temples.',
          description: 'A car calls at your East Bank hotel in Luxor at seven or at eight, then crosses the river. The morning stays on the West Bank. First the Valley of the Kings, its royal tombs walked with your guide; then the temple of Hatshepsut on its terraces under the cliff face; and the pair of seated statues standing on flat ground at the Colossi of Memnon. Lunch comes after them, and it is in the price. A felucca carries you back across the water, and the afternoon closes on the East Bank at Karnak and at Luxor Temple. The entrance fees for the temples are inside the price.\n\nThe pickup this price covers is from East Bank hotels. A West Bank pickup is charged on top and cannot be booked here, so tell the team where you are staying before you book. The guide on this day speaks English; a Spanish, German or French-speaking guide costs extra and is not sold on this site. A child has its own price, confirmed with your booking.',
          highlights: [
            'The royal tombs with your own guide',
            'Hatshepsut below the cliffs, then the Colossi',
            'A felucca back across the river',
            'Karnak and Luxor Temple to close',
          ],
          seo: {
            metaTitle: 'Both Banks of Luxor in a Private Day, with a Felucca',
            metaDescription: 'Eight private hours in Luxor: the royal tombs, the terraces of Hatshepsut, the Colossi, lunch, a sail back across, then Karnak and Luxor Temple.',
          },
          images: [PHOTO.feluccaAtLowSun],
          imageAlts: [ALT.feluccaAtLowSun],
          where: { city: 'Luxor', area: 'Luxor', coordinates: LUXOR },
        },
        {
          path: 'an-hour-under-sail-then-the-lit-temple-at-karnak',
          price: P.LUXOR_AFTER_DARK,
          title: 'An Hour Under Sail, Then the Lit Temple at Karnak',
          short: 'Five hours in Luxor with a private car and a guide: an hour on a felucca as the sun drops, then the sound and light show inside Karnak after dark.',
          description: 'A private air-conditioned car collects you from your hotel in Luxor, and the first hour is on the river: a wooden felucca on the corniche, past farmland and the waterfront as the sun goes down. Then Karnak after dark, for the sound and light show inside the temple complex, the monuments lit and the story of ancient Thebes told as you walk, and of the three gods of the place, Amun, Mut and Khonsu. The entry fee for the show is inside the price, and so is the guide and the car both ways.\n\nThe record publishes start times right through the day, because the sail is timed for sunset and the show runs after it; the team confirms your pickup time when it confirms the booking. Lunch is not in this price, and nor is anything you tip. A child has its own price on this day.',
          highlights: [
            'An hour on a felucca at sundown',
            'The lit temple complex after dark',
            'The story of Thebes told as you walk',
            'A private car and guide both ways',
          ],
          seo: {
            metaTitle: 'A Felucca at Sundown and Karnak Lit After Dark',
            metaDescription: 'Five hours in Luxor with a private car and guide: an hour on a felucca as the sun drops, then the sound and light show inside Karnak after dark.',
          },
          images: [PHOTO.litColonnade],
          imageAlts: [ALT.litColonnade],
          where: { city: 'Luxor', area: 'Luxor', coordinates: LUXOR },
        },
        {
          path: 'a-three-oclock-start-for-the-valley-of-the-kings',
          price: P.LUXOR_FROM_THE_COAST,
          title: 'A Three O’Clock Start for the Valley of the Kings',
          short: 'Luxor and back in one day from the Marsa Alam coast: seven hours up through the night, the royal tombs, Hatshepsut, the Colossi, a buffet and Karnak.',
          description: 'The van reaches your Marsa Alam hotel at three o’clock in the morning, and the drive inland takes about seven hours. Two hours then go to the Valley of the Kings, the royal tombs cut into the rock, walked with a guide. Three quarters of an hour at the terraced temple of Hatshepsut below the cliffs follows, and twenty minutes at the Colossi of Memnon out on the open ground. A buffet lunch comes next, and then Karnak on the east bank before the long drive home.\n\nTwo things sit outside this price and are worth reading before you book. The entrance to the tomb of Tutankhamun belongs to an option this site does not sell, so it is not covered. And the pickup in the price is from hotels on the coast at Marsa Alam, not from further north, which the record charges for separately. A child has its own price, confirmed with your booking.',
          highlights: [
            'A three in the morning start from the coast',
            'Two hours among the royal tombs',
            'Hatshepsut below the cliffs, then the Colossi',
            'A buffet lunch, then Karnak',
          ],
          seo: {
            metaTitle: 'Luxor and Back in a Day from the Marsa Alam Coast',
            metaDescription: 'A day from a Marsa Alam hotel at three o’clock: the royal tombs, the terraces of Hatshepsut, the Colossi of Memnon, a buffet lunch, then Karnak.',
          },
          images: [PHOTO.paintedCorridor],
          imageAlts: [ALT.paintedCorridor],
          where: { city: 'Marsa Alam', area: 'Marsa Alam', coordinates: MARSA_ALAM },
        },
      ],
    },
  ],
};
