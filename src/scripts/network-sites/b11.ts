/**
 * Batch B11 (30 October 2026), the new sites: six domains on Fouad's list that have no site yet — the Saqqara
 * necropolis, Djoser's Step Pyramid, the Red Pyramid at Dahshur, the alabaster sphinx at Memphis, the Samadai
 * reef off Marsa Alam and the speedboat days from Hurghada. Two groups:
 *
 * - B11A: Saqqara Necropolis, Pyramid of Djoser, Red Pyramid Egypt, Sphinx of Memphis (the days south of Giza).
 * - B11B: Samadai Beach, Hurghada Speedboat (the Red Sea days).
 *
 * The other five sites of batch B11 are already on the network and keep their tenant records; their catalogues
 * are planned separately and reversibly in `seed-network-b11-existing.ts`, which creates no tenant.
 *
 * Every trip is built on the record the client publishes on its own main site, read into the dated snapshot
 * (`network-sites/eeo-snapshot.json`); prices, child rates, departures and inclusions are copied from that record
 * at apply time and never typed here. Nine records were read into the snapshot for this batch on 30 October 2026
 * (`npm run read:eeo-snapshot`) — eight of them for the five existing sites — and the client's published list was
 * re-read the same day: 217 trips, the same slugs and the same prices as on 27, 28 and 30 October.
 *
 * A trip stays on a site only where the client's own record visits that site's place, judged on the record's own
 * published words (kept beside the test in `__tests__/fixtures/network-b11-record-names.json`). Saqqara Necropolis
 * takes the days whose record names Sakkara or Saqqara; the Pyramid of Djoser only the days whose record names
 * Djoser or the Step Pyramid; the Red Pyramid only the days whose record names the Red Pyramid *and* whose own
 * booking option goes to Dahshur (coordinator, 30 October: the strict rule, so two trips rather than three); the
 * Sphinx of Memphis the days whose own schedule stops at Memphis or Mit Rahina, because the alabaster sphinx
 * stands in that open-air museum and a day that walks it reaches the sphinx (coordinator, 30 October: batch B10's
 * same-day rule, so the same five the Mit Rahina Museum sells). A record that names Memphis in passing, or as part
 * of a company name, is never counted: all three sold here list "Memphis, Egypt" or the Alabaster Sphinx among
 * their own published stops. Samadai Beach takes the one Samadai record; Hurghada Speedboat the days whose record
 * sells a speedboat.
 *
 * Every programme this batch sells was already written by an earlier batch (`b03`, `b09`, `b10`), so this batch
 * imports them rather than restating them: the same options, departures, renames and schedules, so the network
 * says the same thing about the same trip wherever it is sold. No programme is new here.
 *
 * What the coordinator settled on 30 October, kept here so a later batch does not re-open it:
 * - Four sites here sell records that batch B10's sites already sell, because the client's days visit these
 *   monuments together: Saqqara Necropolis and the Sphinx of Memphis each sell the same five as Sakkara Pyramids
 *   and the Mit Rahina Museum, and the Pyramid of Djoser and the Red Pyramid sell a subset of them. Same-subject
 *   sites sharing a record was decided for B10; these six domains are monument names rather than new subjects. The
 *   sites differ in their words, their photos and their design, not in their catalogue.
 * - Settled 30 October: the Red Pyramid keeps the strict rule, two trips. The Sphinx of Memphis takes the
 *   same-day rule and sells five, the same catalogue as the Mit Rahina Museum, because the sphinx stands in the
 *   museum those five days walk.
 * - The client publishes only three distinct photos across every record these four monument sites sell, and all
 *   three already open a site that is live (Memphis and Sakkara, Sakkara Pyramids, Pyramids of Dahshur). No photo
 *   is invented and none is mislabelled, so these sites open on a photo another site opens on. Samadai Beach opens
 *   on the same photo as the live Shaab Samadai site for the same reason: they sell the one record the client
 *   publishes for that reef, and it publishes one photo. No photo on the Sphinx of Memphis shows the sphinx, since
 *   none of the records publishes one. Accepted for now (coordinator, 30 October): every photo here is replaceable
 *   the moment the client supplies each site's own, and nothing but the photo lists and their descriptions change.
 *
 * Held back, and why (each is a question for the client in the build report):
 * - The long packages: `cairo-3-day-tour-pyramids-museums-islamic-cairo-nile-cruise`,
 *   `cairo-4-day-highlights-pyramids-ancient-sites-old-cairo`,
 *   `cairo-nile-cruise-6-day-egypt-highlights-abu-simbel-hot-air-balloon` and
 *   `egypt-in-9-days-cairo-alexandria-nile-cruise-luxor-abu-simbel`. Each runs for days across Alexandria, Aswan,
 *   Luxor and Abu Simbel with hotels, a Nile cruise and internal flights; no batch on the network sells one, and
 *   none of these sites can describe such a day without naming places it does not serve. They are also the only
 *   records besides the two sold here that reach Saqqara, Dahshur or Memphis, so holding them back is what keeps
 *   the Saqqara, Djoser and Red Pyramid catalogues small.
 * - `cairo-private-guided-tour-to-your-choice-of-top-attractions` (its Saqqara option): the record excludes hotel
 *   transfers and sells them as an add-on bound to no booking option, so it does not include the hotel pickup every
 *   network trip promises. Saqqara Necropolis and the Pyramid of Djoser would each have had one more trip. Batch
 *   B10 held the same record back for the same reason.
 * - `sharm-el-sheikh-2-day-cairo-pyramids-gem-luxury-stay`, its second option ("Day 1 Pyramids & GEM + Day 2
 *   Memphis, Saqqara & Old Cairo"): the option's name says Memphis and Saqqara, while its own description says the
 *   second day is three sites chosen from Saqqara, the Citadel, the Hanging Church, the Amr Ibn Al-As Mosque and
 *   the Museum of Civilization — a list without Memphis — and that its entrance fees are not included. Batch B10
 *   held it back for the same reason, and its first option never leaves Giza.
 * - `hurghada-dolphin-house-morning-cruise-dolphin-swim`, `hurghada-dolphin-house-yacht-cruise-with-dolphin-swim-lunch`
 *   and `hurghada-dolphin-house-yacht-trip-with-snorkeling-lunch` are not sold on Samadai Beach: the client files
 *   them under Hurghada and their own records sail to the Dolphin House reef off Hurghada, which is not Samadai.
 *   Only `shaab-samadai-dolphin-sanctuary-snorkel-cruise-from-marsa-alam` names the Samadai reef.
 * - `from-hurghada-paradise-island-yacht-speedboat-cruise-with-snorkeling-lunch` is not sold on Hurghada
 *   Speedboat for two reasons: the record's title offers "yacht or speedboat" while every one of its four booking
 *   options sells a "7 Hour Yacht Tour", so no option this site could sell is a speedboat day; and the record
 *   prices each of its two departures apart from the option itself, which the seed refuses outright.
 * - The photo the client publishes on `hurghada-speedboat-trip-to-6-islands-with-dolphin-watching-snorkeling`
 *   shows a dolphin rising out of a pool beside a swimmer's raised hand, and the one on
 *   `hurghada-dolphin-house-speedboat-trip-dolphin-swim` shows a hand held against a dolphin's head at a tiled
 *   pool edge. Neither is a photograph of the open-sea day the record sells, so neither is used; both trips carry
 *   the photo batch B09 chose for the same record.
 *
 * Photos are the ones each record publishes, already on the network's Cloudinary, with the Hurghada set as batch
 * B09 chose it. Copying them into a network-b11 folder, each site's own photos and the six logos are open
 * questions: `--apply` refuses to run without `--logos=<file>` naming every site's approved logo, logoDark and
 * favicon.
 */
import type { NetworkBatch, PriceSpec } from '../seed-network-sites';
import { PROGRAMMES as B03 } from './b03';
import { PROGRAMMES_A as B09A, PROGRAMMES_B as B09B } from './b09';
import { NEW_PROGRAMMES as B10N } from './b10';

/** Every programme this batch sells. All seven were written by the batch that first sold the record. */
const P = {
  SOUTH_SHARED: B03.MAS_SHARED,
  SOUTH_PRIVATE: B03.MAS_PRIVATE,
  GIZA_SOUTH: B03.MAS_WITH_GIZA,
  GIZA_SOUTH_VIP: B03.MAS_NILE_SAIL,
  TWO_DAY_PRIVATE: B10N.TWO_DAY_PRIVATE,
  SAMADAI: B09B.SHAAB_SAMADAI,
  SPEEDBOAT_SNORKEL: B09A.HBT_SPEEDBOAT_SNORKEL,
  DOLPHIN_WATCH: B09A.HBT_DOLPHIN_WATCH,
  SIX_ISLANDS: B09A.HBT_SIX_ISLANDS,
  DOLPHIN_SPEEDBOAT: B09A.HBT_DOLPHIN_SPEEDBOAT,
  HULA_SPEEDBOAT: B09A.HBT_HULA_SPEEDBOAT,
} satisfies Record<string, PriceSpec>;

/**
 * Each record's own photo, as the client publishes it. The two Hurghada dolphin records publish a pool photograph
 * (see the header), so those trips carry the photo batch B09 chose for the same record instead.
 */
const PHOTO = {
  stepPyramid: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788797085/tours/m87zl1cmmc4kcv2nrv4o.jpg',
  stepPyramidAtDusk: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781377/tours/wkmxhvoiwvc36jaxfrr6.jpg',
  feluccasAtCairo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788797148/tours/i7hlesmpg9oel1enka8o.jpg',
  dolphinsOverReef: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788795260/tours/fs65spccs0uncfww6z9k.jpg',
  snorkellerThumbsUp: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788290961/tours/pxb310hq6keozafoaqdx.jpg',
  speedboatAtSpeed: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787782177/tours/tpfuorpe6kgzzx78smwe.jpg',
  snorkellerOverCoral: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788291087/tours/a5hjhquanje6nm8wbsbf.jpg',
  speedboatWake: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788290634/tours/bgacpsik0esq6rcwnmmq.jpg',
  hulaHulaSign: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788795095/tours/daplx8xddplpnqmxbmhp.jpg',
};

/** Each photo described as it is, not as the trip it illustrates. */
const ALT: Record<keyof typeof PHOTO, string> = {
  stepPyramid: 'The stepped pyramid at Sakkara rising behind the restored stone walls and doorways of its funerary enclosure, across open sand',
  stepPyramidAtDusk: 'The stepped pyramid of Djoser rising in six tiers of worn stone above flat open sand, under a hazy sky at the end of the day',
  feluccasAtCairo: 'Two feluccas under white sails on the river, with the Cairo waterfront, a tall latticed tower and palms behind',
  dolphinsOverReef: 'Three dolphins swimming above a coral reef, with a snorkeller in a yellow top swimming nearby',
  snorkellerThumbsUp: 'A snorkeller in a mask giving a thumbs-up underwater in deep blue water',
  speedboatAtSpeed: 'A white and blue speedboat at speed on calm blue sea, with spray at its stern',
  snorkellerOverCoral: 'A snorkeller in a mask taking a photo of himself underwater above a coral reef',
  speedboatWake: 'A white speedboat with a blue stripe cutting across open water, leaving a wake',
  hulaHulaSign: 'A carved wooden sign reading Hula Hula on a white beach, with straw sunshades and turquoise water behind',
};

const CAIRO = { lat: 30.0444, lng: 31.2357 };
const HURGHADA = { lat: 27.2579, lng: 33.8116 };
const MARSA_ALAM = { lat: 25.0676, lng: 34.879 };

/**
 * Places the four monument sites never name. Their days run between Cairo, Giza, Sakkara, Memphis and Dahshur,
 * so those names are theirs to use; the rest of Egypt is not.
 */
const NOT_SOUTH_OF_GIZA = /Hurghada|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum/i;
/** The Samadai reef day stays on the Marsa Alam coast, and never names the Hurghada reef of the same kind. */
const NOT_SAMADAI = /Gouna|Hurghada|Makadi|Sahl|Safaga|Soma Bay|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Catherine|Cairo|Giza|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur|Pyramid|Sphinx|Dolphin House/i;
/** The speedboat days leave from Hurghada and name no other town, exactly as batch B09's boat site does. */
const NOT_HURGHADA = /Cairo|Giza|Luxor|Aswan|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Gouna|Sahl|Makadi|Alexandria|Siwa|Bahariya|Fayoum|Sataya|Samadai/i;

/** B11A: the four sites of the necropolis south of Giza. */
export const B11A: NetworkBatch = {
  id: 'b11a',
  sites: [
    {
      slug: 'saqqara-necropolis',
      name: 'Saqqara Necropolis',
      listingPath: '/trips',
      domain: 'saqqaranecropolis.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'sqn-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      tagline: 'Guided days in the burial ground of Memphis',
      description: 'Saqqara Necropolis sells the days that cross the burial ground of the old capital: a field of sand and stone thirty kilometres south of Giza, where the Step Pyramid of Djoser stands among mastaba tombs, shaft graves and funerary enclosures built over three thousand years.\n\nSome of these days go on to Memphis and to Dahshur, some begin on the Giza plateau, and one runs over two days and ends in the museums of Cairo. Every trip collects you from your hotel and brings you back, and each page says what its own price covers. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Saqqara Necropolis Tours with Hotel Pickup in Cairo',
        metaDescription: 'Guided days through the Saqqara necropolis and its Step Pyramid, with Memphis, Dahshur and the Giza plateau, and hotel pickup in Cairo or Giza.',
        keywords: ['saqqara necropolis tour', 'sakkara day trip from cairo', 'saqqara and memphis tour', 'step pyramid guided tour', 'saqqara tour with hotel pickup'],
      },
      theme: { primaryColor: '#3B2F1E', secondaryColor: '#F4EFE4', accentColor: '#C2763B' },
      heroImages: [PHOTO.stepPyramid, PHOTO.stepPyramidAtDusk, PHOTO.feluccasAtCairo],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/saqqara-necropolis/monogram.png',
      trips: [
        {
          path: 'sakkara-memphis-and-dahshur-shared',
          price: P.SOUTH_SHARED,
          title: 'Sakkara, Memphis and Dahshur in a Shared Group',
          short: 'A shared day south of Giza with a guide and the entry tickets: the Saqqara necropolis, the ruins of Memphis and the pyramids of Dahshur.',
          description: 'The day opens at Saqqara, where the guide walks you through the necropolis of the old capital and the Step Pyramid at its centre. It carries on to Memphis, the capital itself, now a field of ruins with its fallen colossus of Ramses II, and ends at Dahshur among the Bent and Red Pyramids.\n\nThe vehicle is air-conditioned and shared with other guests, the guide speaks English, and the entry tickets for the sites the day visits are in the price. Pickup from your hotel in Cairo or Giza is included, and the day leaves at eleven.',
          highlights: [
            'The Saqqara necropolis and its Step Pyramid',
            'The ruins of Memphis and its fallen colossus',
            'The Bent and Red Pyramids at Dahshur',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Saqqara, Memphis and Dahshur: Shared Day Tour',
            metaDescription: 'A shared guided day at the Saqqara necropolis, Memphis and Dahshur, with the entry tickets and hotel pickup in Cairo or Giza.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-sakkara-memphis-and-dahshur',
          price: P.SOUTH_PRIVATE,
          title: 'Private Day at Saqqara, Memphis and Dahshur',
          short: 'The same three places with your own guide and vehicle, an eight o’clock start and the entry tickets.',
          description: 'This is the private way to walk the necropolis: your own guide, your own air-conditioned vehicle, and an eight o’clock start that reaches Saqqara before the shared groups. The guide takes you through the enclosure of the Step Pyramid and the tombs around it, then on to Memphis and to Dahshur.\n\nThe guide can be asked for in another language, the entry tickets for the sites the day visits are in the price, and the vehicle collects you from your hotel in Cairo or Giza and brings you back.',
          highlights: [
            'Your own guide and vehicle for the day',
            'The Step Pyramid enclosure and the tombs around it',
            'Memphis and the pyramids of Dahshur',
            'An early start and the entry tickets included',
          ],
          seo: {
            metaTitle: 'Private Saqqara, Memphis and Dahshur Day Tour',
            metaDescription: 'A private guided day at Saqqara, Memphis and Dahshur with your own vehicle, the entry tickets and hotel pickup in Cairo or Giza.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'giza-pyramids-sakkara-and-memphis',
          price: P.GIZA_SOUTH,
          title: 'The Giza Pyramids, Saqqara and Memphis in One Day',
          short: 'One day from the Giza plateau to the necropolis and the old capital, shared or private, with the entry tickets.',
          description: 'The day begins on the Giza plateau among the pyramids and the Great Sphinx, then drives south to Saqqara, where the guide walks you through the necropolis and its Step Pyramid, and ends at Memphis among the ruins of the capital these tombs were built for.\n\nYou choose how to travel: a shared group, or your own guide and vehicle. The entry tickets for the sites the day visits are in the price either way, and the vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'The Giza plateau, Saqqara and Memphis in one day',
            'A shared group or your own guide and vehicle',
            'The Step Pyramid and the necropolis around it',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Giza Pyramids, Saqqara and Memphis Day Tour',
            metaDescription: 'A guided day from the Giza plateau to the Saqqara necropolis and Memphis, shared or private, with the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'Private Day at Saqqara and Memphis with Lunch and a Nile Sail',
          short: 'A private day that takes in the plateau, the necropolis, Memphis and Dahshur, with lunch and an hour under sail on the Nile.',
          description: 'The longest way to see the necropolis, and the slowest. Your own guide and vehicle take you from the Giza plateau to Saqqara, through the necropolis and the Step Pyramid at its heart, on to the ruins of Memphis and the pyramids of Dahshur, with lunch along the way.\n\nThe day closes on the river, an hour under the white sail of a felucca. The entry tickets for the sites the day visits are in the price, and the vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'The necropolis, Memphis and Dahshur with your own guide',
            'Lunch at a local restaurant',
            'An hour on the Nile under sail',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Private Saqqara and Memphis Day with a Nile Sail',
            metaDescription: 'A private day at the Giza plateau, Saqqara, Memphis and Dahshur with lunch, an hour under sail on the Nile and hotel pickup.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'Two Private Days: the Necropolis, Memphis and the Museums',
          short: 'Day one at the Giza plateau, Saqqara and Memphis; day two at the Egyptian Museum and the Museum of Egyptian Civilization.',
          description: 'Saqqara comes on the first day, after the plateau: the guide walks you through the necropolis and stands you before the Step Pyramid, then carries on to Memphis, its colossal statue of Ramses II and the alabaster sphinx beside it.\n\nThe second day is spent in the museums, first the Egyptian Museum on Tahrir Square and then the Museum of Egyptian Civilization with its hall of royal mummies. Your own guide and vehicle for both days, the entry fees, and lunch on each. The vehicle collects you from your hotel on both mornings.',
          highlights: [
            'The necropolis and the Step Pyramid on day one',
            'Memphis, its colossus and the alabaster sphinx',
            'The Egyptian Museum and the royal mummies on day two',
            'Your own guide and vehicle on both days',
          ],
          seo: {
            metaTitle: 'Two Private Days: Saqqara, Memphis and Cairo Museums',
            metaDescription: 'Two private days: the Giza plateau, the Saqqara necropolis and Memphis, then the Egyptian Museum and the Museum of Egyptian Civilization.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
      ],
    },
    {
      slug: 'pyramid-of-djoser',
      name: 'Pyramid of Djoser',
      listingPath: '/trips',
      domain: 'pyramidofdjoser.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'pdj-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      photoShortfall: 'The trips this site sells publish two photos between them.',
      tagline: 'Guided days that stand before the Step Pyramid',
      description: 'Pyramid of Djoser sells the days whose own record brings you to the Step Pyramid at Saqqara: six tiers of stone raised for the pharaoh Djoser by his architect Imhotep, the first building of its size anywhere to be built in cut stone, and the ancestor of every pyramid that followed it.\n\nEach of these days walks the enclosure around it and goes on to Memphis and Dahshur or to the museums of Cairo. Every trip collects you from your hotel and brings you back, and each page says what its own price covers. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Pyramid of Djoser Tours: the Step Pyramid at Saqqara',
        metaDescription: 'Guided days at the Step Pyramid of Djoser in Saqqara, with Memphis, Dahshur or the Cairo museums, and hotel pickup in Cairo or Giza.',
        keywords: ['pyramid of djoser tour', 'step pyramid saqqara tour', 'djoser step pyramid day trip', 'imhotep step pyramid guided tour', 'saqqara step pyramid with pickup'],
      },
      theme: { primaryColor: '#2E3A2F', secondaryColor: '#F1EEE3', accentColor: '#CC8A3E' },
      heroImages: [PHOTO.stepPyramidAtDusk, PHOTO.stepPyramid],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/pyramid-of-djoser/monogram.png',
      trips: [
        {
          path: 'sakkara-memphis-and-dahshur-shared',
          price: P.SOUTH_SHARED,
          title: 'Shared Day at the Step Pyramid, Memphis and Dahshur',
          short: 'A shared day with a guide and the entry tickets: the Step Pyramid of Djoser, the ruins of Memphis and the pyramids of Dahshur.',
          description: 'The Step Pyramid is the first stop. The guide walks you into the enclosure Imhotep laid out around it, past the colonnade and the courts, and stands you below the six tiers themselves. From there the day goes on to Memphis, the old capital, and to the Bent and Red Pyramids at Dahshur.\n\nThe vehicle is air-conditioned and shared with other guests, the guide speaks English, and the entry tickets for the sites the day visits are in the price. Pickup from your hotel in Cairo or Giza is included, and the day leaves at eleven.',
          highlights: [
            'The Step Pyramid of Djoser and its enclosure',
            'The ruins of Memphis and its fallen colossus',
            'The Bent and Red Pyramids at Dahshur',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Step Pyramid of Djoser: Shared Day with Memphis',
            metaDescription: 'A shared guided day at the Step Pyramid of Djoser, Memphis and Dahshur, with the entry tickets and hotel pickup in Cairo or Giza.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-sakkara-memphis-and-dahshur',
          price: P.SOUTH_PRIVATE,
          title: 'Private Day at the Step Pyramid, Memphis and Dahshur',
          short: 'The Step Pyramid with your own guide and vehicle, an eight o’clock start, then Memphis and Dahshur, with the entry tickets.',
          description: 'An eight o’clock start brings you to the Step Pyramid before the shared groups reach it, and your own guide has the time to take the enclosure slowly: the colonnade, the courts of the jubilee festival, and the six tiers Djoser was buried beneath.\n\nThe day carries on to Memphis and to Dahshur. The guide can be asked for in another language, the entry tickets for the sites the day visits are in the price, and your own vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'The Step Pyramid before the shared groups arrive',
            'Your own guide and vehicle for the day',
            'Memphis and the pyramids of Dahshur',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Private Step Pyramid of Djoser Tour with Dahshur',
            metaDescription: 'A private early day at the Step Pyramid of Djoser, Memphis and Dahshur, with your own guide, the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'Two Private Days: the Step Pyramid, Memphis and the Museums',
          short: 'Day one at the Giza plateau, the Step Pyramid and Memphis; day two at the Egyptian Museum and the Museum of Egyptian Civilization.',
          description: 'The Step Pyramid comes on the first day, between the Giza plateau and Memphis. Your own guide walks you through the enclosure at Saqqara and stands you before the six tiers, then carries on to the old capital, its colossal statue of Ramses II and the alabaster sphinx beside it.\n\nThe second day is spent in the museums, first the Egyptian Museum on Tahrir Square and then the Museum of Egyptian Civilization with its hall of royal mummies. Your own guide and vehicle for both days, the entry fees, and lunch on each.',
          highlights: [
            'The Step Pyramid of Djoser on day one',
            'The Giza plateau, Memphis and its colossus',
            'The Egyptian Museum and the royal mummies on day two',
            'Your own guide and vehicle on both days',
          ],
          seo: {
            metaTitle: 'Two Private Days: Step Pyramid and Cairo Museums',
            metaDescription: 'Two private days: the Giza plateau, the Step Pyramid of Djoser and Memphis, then the Egyptian Museum and the Museum of Egyptian Civilization.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
      ],
    },
    {
      slug: 'red-pyramid-egypt',
      name: 'Red Pyramid Egypt',
      listingPath: '/trips',
      domain: 'redpyramidegypt.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'rpe-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      photoShortfall: 'The two trips this site sells publish two photos between them.',
      tagline: 'Guided days at the Red Pyramid of Dahshur',
      description: 'Red Pyramid Egypt sells the days whose own record brings you to Dahshur and names the Red Pyramid: the first true pyramid Egypt finished, built for Sneferu in the stone that gives it its colour, and the one whose burial chambers you can still walk down into.\n\nThe Bent Pyramid stands in the same field, and each of these days reaches both after crossing the Saqqara necropolis and the ruins of Memphis. Every trip collects you from your hotel and brings you back, and each page says what its own price covers. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Red Pyramid of Dahshur Tours with Hotel Pickup',
        metaDescription: 'Guided days at the Red Pyramid and the Bent Pyramid of Dahshur, with Saqqara and Memphis, and hotel pickup in Cairo or Giza.',
        keywords: ['red pyramid dahshur tour', 'dahshur day trip from cairo', 'bent and red pyramid tour', 'sneferu red pyramid guided tour', 'dahshur tour with hotel pickup'],
      },
      theme: { primaryColor: '#5A2A22', secondaryColor: '#F6EDE6', accentColor: '#B85C38' },
      heroImages: [PHOTO.stepPyramid, PHOTO.stepPyramidAtDusk],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/red-pyramid-egypt/monogram.png',
      trips: [
        {
          path: 'sakkara-memphis-and-dahshur-shared',
          price: P.SOUTH_SHARED,
          title: 'Shared Day at the Red Pyramid, Saqqara and Memphis',
          short: 'A shared day with a guide and the entry tickets: the Saqqara necropolis, the ruins of Memphis and the Bent and Red Pyramids at Dahshur.',
          description: 'Dahshur closes this day, and the Red Pyramid is what you come for: the smooth-sided pyramid Sneferu finished, named for the colour its stone turns in the sun, with the Bent Pyramid standing in the same field a few hundred metres away.\n\nThe day starts at Saqqara, among the necropolis and its Step Pyramid, and goes on to Memphis. The vehicle is air-conditioned and shared with other guests, the guide speaks English, and the entry tickets for the sites the day visits are in the price. Pickup from your hotel in Cairo or Giza is included.',
          highlights: [
            'The Red Pyramid and the Bent Pyramid at Dahshur',
            'The Saqqara necropolis and its Step Pyramid',
            'The ruins of Memphis and its fallen colossus',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Red Pyramid, Saqqara and Memphis: Shared Day Tour',
            metaDescription: 'A shared guided day at the Red and Bent Pyramids of Dahshur, Saqqara and Memphis, with the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-sakkara-memphis-and-dahshur',
          price: P.SOUTH_PRIVATE,
          title: 'Private Day at the Red Pyramid, Saqqara and Memphis',
          short: 'The Red Pyramid and the Bent Pyramid with your own guide and vehicle, an eight o’clock start, and the entry tickets.',
          description: 'The private way to reach Dahshur, and the one with time to spare at the Red Pyramid itself, where a passage runs down from the north face into the burial chambers inside. The Bent Pyramid stands in the same field, and your own guide has the day to tell you why the one explains the other.\n\nThe day begins at Saqqara and takes in Memphis on the way. The guide can be asked for in another language, the entry tickets for the sites the day visits are in the price, and your own vehicle collects you from your hotel in Cairo or Giza at eight.',
          highlights: [
            'The Red Pyramid with your own guide',
            'The Bent Pyramid in the same field',
            'Saqqara and the ruins of Memphis',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Private Red Pyramid and Dahshur Day Tour',
            metaDescription: 'A private day at the Red and Bent Pyramids of Dahshur with Saqqara and Memphis, your own guide, the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
      ],
    },
    {
      slug: 'sphinx-of-memphis',
      name: 'Sphinx of Memphis',
      listingPath: '/trips',
      domain: 'sphinxofmemphis.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'som-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      tagline: 'Guided days that reach the alabaster sphinx',
      description: 'Sphinx of Memphis sells the days that stop at Mit Rahina, where the alabaster sphinx lies: a single block of calcite carved into a lion with a king’s head, in the open-air museum beside the fallen colossus of Ramses II, in what is left of Egypt’s first capital.\n\nEvery one of these days walks that museum. Some go on to Saqqara and Dahshur, some begin on the Giza plateau, and one runs over two days and ends in the museums of Cairo. Every trip collects you from your hotel and brings you back, and each page says what its own price covers. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Sphinx of Memphis Tours at Mit Rahina, with Pickup',
        metaDescription: 'Guided days at the alabaster sphinx and colossus of Memphis at Mit Rahina, with Saqqara, Dahshur or the Giza plateau, and hotel pickup.',
        keywords: ['sphinx of memphis tour', 'alabaster sphinx mit rahina', 'memphis open air museum tour', 'mit rahina day trip from cairo', 'memphis sphinx tour with pickup'],
      },
      theme: { primaryColor: '#263445', secondaryColor: '#EFF1F0', accentColor: '#A9814B' },
      heroImages: [PHOTO.stepPyramidAtDusk, PHOTO.stepPyramid, PHOTO.feluccasAtCairo],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/sphinx-of-memphis/monogram.png',
      trips: [
        {
          path: 'sakkara-memphis-and-dahshur-shared',
          price: P.SOUTH_SHARED,
          title: 'Shared Day at Memphis, Saqqara and Dahshur',
          short: 'A shared day with a guide and the entry tickets: the open-air museum at Memphis, the Saqqara necropolis and the pyramids of Dahshur.',
          description: 'Memphis closes this day. The guide walks you through the open-air museum at Mit Rahina, where the colossus of Ramses II lies on its back under a roof of its own and the alabaster sphinx rests in the garden outside it, carved from one block of calcite.\n\nBefore that the day crosses the Saqqara necropolis with its Step Pyramid, and the field at Dahshur with the Bent and Red Pyramids. The vehicle is air-conditioned and shared with other guests, the guide speaks English, and the entry tickets for the sites the day visits are in the price, with pickup from your hotel in Cairo or Giza.',
          highlights: [
            'The alabaster sphinx and the colossus at Mit Rahina',
            'The Saqqara necropolis and its Step Pyramid',
            'The Bent and Red Pyramids at Dahshur',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Memphis, Saqqara and Dahshur: Shared Day Tour',
            metaDescription: 'A shared guided day at the Memphis open-air museum, the Saqqara necropolis and Dahshur, with the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-sakkara-memphis-and-dahshur',
          price: P.SOUTH_PRIVATE,
          title: 'Private Day at Memphis, Saqqara and Dahshur',
          short: 'The same three places with your own guide and vehicle, an eight o’clock start and the entry tickets.',
          description: 'The private way to reach Mit Rahina, and the one with time to stand at the sphinx rather than pass it. Your own guide walks you round the open-air museum, the colossus of Ramses II under its roof and the alabaster sphinx in the garden, and can tell you which king’s face the carvers were working from.\n\nAn eight o’clock start puts the day ahead of the shared groups at Saqqara, and Dahshur follows. The guide can be asked for in another language, the entry tickets for the sites the day visits are in the price, and your own vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'The alabaster sphinx with your own guide',
            'The colossus of Ramses II under its roof',
            'Saqqara and the pyramids of Dahshur',
            'An early start and the entry tickets included',
          ],
          seo: {
            metaTitle: 'Private Memphis, Saqqara and Dahshur Day Tour',
            metaDescription: 'A private guided day at the Memphis open-air museum, Saqqara and Dahshur with your own vehicle, the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'giza-pyramids-sakkara-and-memphis',
          price: P.GIZA_SOUTH,
          title: 'The Giza Pyramids, Saqqara and Memphis in One Day',
          short: 'One day from the Giza plateau to the necropolis and the open-air museum at Memphis, shared or private, with the entry tickets.',
          description: 'The day begins on the Giza plateau among the pyramids and the Great Sphinx, drives south to the Saqqara necropolis and its Step Pyramid, and ends at Mit Rahina, where the alabaster sphinx and the colossus of Ramses II lie in the open-air museum of the capital these tombs were built for.\n\nYou choose how to travel: a shared group, or your own guide and vehicle. The entry tickets for the sites the day visits are in the price either way, and the vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'The alabaster sphinx at the end of the day',
            'The Giza plateau and the Great Sphinx',
            'The Saqqara necropolis and its Step Pyramid',
            'A shared group or your own guide and vehicle',
          ],
          seo: {
            metaTitle: 'Giza Pyramids, Saqqara and Memphis Day Tour',
            metaDescription: 'A guided day from the Giza plateau to Saqqara and the Memphis open-air museum, shared or private, with the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'Private Day at Memphis and Saqqara with Lunch and a Nile Sail',
          short: 'A private day taking in the plateau, Saqqara, the open-air museum at Memphis and Dahshur, with lunch and an hour under sail.',
          description: 'The longest way to reach the sphinx, and the slowest. Your own guide and vehicle take you from the Giza plateau to Saqqara, on to Mit Rahina for the colossus and the alabaster sphinx beside it, and out to the Bent and Red Pyramids at Dahshur, with lunch along the way.\n\nThe day closes on the river, an hour under the white sail of a felucca. The entry tickets for the sites the day visits are in the price, and the vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'The alabaster sphinx and colossus with your own guide',
            'Saqqara, Dahshur and the Giza plateau',
            'Lunch at a local restaurant',
            'An hour on the Nile under sail',
          ],
          seo: {
            metaTitle: 'Private Memphis and Saqqara Day with a Nile Sail',
            metaDescription: 'A private day at the Giza plateau, Saqqara, the Memphis open-air museum and Dahshur, with lunch, an hour under sail and hotel pickup.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'Two Private Days: the Alabaster Sphinx, Memphis and the Museums',
          short: 'Day one at the Giza plateau, Saqqara and Memphis, where the alabaster sphinx lies; day two in the museums of Cairo.',
          description: 'The alabaster sphinx comes at the end of the first day. Your own guide takes you from the Giza plateau to the Step Pyramid at Saqqara and on to Mit Rahina, where the colossal statue of Ramses II lies under its own roof and the sphinx rests in the garden beside it, cut from a single block of calcite.\n\nThe second day is spent in the museums, first the Egyptian Museum on Tahrir Square and then the Museum of Egyptian Civilization with its hall of royal mummies. Your own guide and vehicle for both days, the entry fees, and lunch on each. The vehicle collects you from your hotel on both mornings.',
          highlights: [
            'The alabaster sphinx in the garden at Mit Rahina',
            'The colossal statue of Ramses II beside it',
            'The Giza plateau and Saqqara on the same day',
            'The Egyptian Museum and the royal mummies on day two',
          ],
          seo: {
            metaTitle: 'Alabaster Sphinx of Memphis: Two Private Days',
            metaDescription: 'Two private days taking in the alabaster sphinx and colossus at Memphis, the Giza plateau, Saqqara and the museums of Cairo.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
      ],
    },
  ],
};

/** B11B: the Samadai reef and the speedboat days on the Red Sea. */
export const B11B: NetworkBatch = {
  id: 'b11b',
  sites: [
    {
      slug: 'samadai-beach',
      name: 'Samadai Beach',
      listingPath: '/trips',
      domain: 'samadaibeach.com',
      city: 'Marsa Alam',
      area: 'Marsa Alam',
      pickupDestination: 'marsa-alam',
      coordinates: MARSA_ALAM,
      currency: 'USD',
      slugPrefix: 'sdb-',
      foreignPlaces: NOT_SAMADAI,
      photoShortfall: 'The one trip this site sells publishes one photo.',
      tagline: 'The boat day out to the Samadai reef',
      description: 'Samadai Beach sells the day that sails out to Shaab Samadai, the horseshoe of reef off Marsa Alam where a pod of spinner dolphins rests through the daylight hours. The lagoon inside it is divided into zones, and boats and swimmers keep to the outer ones so the dolphins are left alone in the middle.\n\nThe trip is a snorkelling day by boat, with the guide, the equipment and lunch aboard. It collects you from your hotel and brings you back, and the page says what its price covers. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Samadai Beach: the Shaab Samadai Reef Snorkel Day',
        metaDescription: 'The guided boat day out to the Shaab Samadai dolphin reef off Marsa Alam, with snorkelling, lunch aboard and hotel pickup.',
        keywords: ['samadai beach trip', 'shaab samadai snorkelling day', 'samadai dolphin reef marsa alam', 'samadai boat trip with lunch', 'samadai reef tour with pickup'],
      },
      theme: { primaryColor: '#0E4759', secondaryColor: '#E9F4F5', accentColor: '#EFA93C' },
      heroImages: [PHOTO.dolphinsOverReef],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/samadai-beach/monogram.png',
      trips: [
        {
          path: 'samadai-reef-snorkelling-boat-day',
          price: P.SAMADAI,
          title: 'Snorkelling Boat Day at the Samadai Reef',
          short: 'A guided boat day out to the Shaab Samadai lagoon, with snorkelling stops, the equipment and lunch aboard.',
          description: 'The boat leaves the harbour in the morning and runs out to Shaab Samadai, a crescent of reef lying a few kilometres off the coast with a shallow lagoon inside it. Spinner dolphins spend the daylight hours in the sheltered middle, and the boats and swimmers keep to the zones outside it.\n\nThe guide takes you in over the coral, the mask, snorkel and fins are aboard, and lunch is served on the boat. The day includes pickup from your hotel in Marsa Alam and the drive back at the end of it.',
          highlights: [
            'The crescent reef and lagoon of Shaab Samadai',
            'Guided snorkelling over the coral',
            'Mask, snorkel and fins aboard',
            'Lunch on the boat and hotel pickup',
          ],
          seo: {
            metaTitle: 'Shaab Samadai Reef: Guided Snorkelling Boat Day',
            metaDescription: 'A guided boat day to the Shaab Samadai reef off Marsa Alam, with snorkelling stops, equipment, lunch aboard and hotel pickup.',
          },
          images: [PHOTO.dolphinsOverReef],
          imageAlts: [ALT.dolphinsOverReef],
        },
      ],
    },
    {
      slug: 'hurghada-speedboat',
      name: 'Hurghada Speedboat',
      listingPath: '/trips',
      domain: 'hurghadaspeedboat.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'hsb-',
      foreignPlaces: NOT_HURGHADA,
      tagline: 'Days on the water by speedboat',
      description: 'Hurghada Speedboat sells the days that go out by speedboat rather than by day boat: a small, fast hull that reaches the reefs and the islands in minutes instead of hours, carries a handful of guests rather than a deck full, and can change its plan with the wind.\n\nSome of these days are snorkelling trips over the reefs, some run out to the islands, and some go looking for dolphins in the open water. Every trip collects you from your hotel and brings you back, and each page says what its own price covers. Hold a place online and pay later, or ask the team first about the pickup time.',
      seo: {
        metaTitle: 'Hurghada Speedboat Trips with Hotel Pickup',
        metaDescription: 'Speedboat days from Hurghada to the reefs and islands, with snorkelling, dolphin watching and hotel pickup and drop-off.',
        keywords: ['hurghada speedboat trip', 'speedboat snorkelling hurghada', 'hurghada speedboat island tour', 'dolphin watching speedboat hurghada', 'private speedboat day hurghada'],
      },
      theme: { primaryColor: '#08364B', secondaryColor: '#E6F2F7', accentColor: '#F0954A' },
      heroImages: [PHOTO.speedboatAtSpeed, PHOTO.snorkellerThumbsUp, PHOTO.hulaHulaSign],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/hurghada-speedboat/monogram.png',
      trips: [
        {
          path: 'speedboat-snorkelling-trip',
          price: P.SPEEDBOAT_SNORKEL,
          title: 'Speedboat Snorkelling Trip',
          short: 'A short speedboat day over the reefs off Hurghada, with the snorkelling equipment and hotel pickup.',
          description: 'The speedboat leaves from the marina and is over the reef within minutes, which is the whole point of taking one: the time a day boat spends motoring out is time you spend in the water instead. There are two starts, one in the morning and one after lunch.\n\nThe crew takes you to the snorkelling spots, the mask, snorkel and fins are aboard, and soft drinks are served on the boat. Pickup from your hotel in Hurghada and the drive back are included.',
          highlights: [
            'Over the reef within minutes of leaving',
            'A morning or an afternoon start',
            'Mask, snorkel and fins aboard',
            'Soft drinks and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Hurghada Speedboat Snorkelling Trip with Pickup',
            metaDescription: 'A short speedboat trip over the reefs off Hurghada with snorkelling equipment, soft drinks aboard and hotel pickup.',
          },
          images: [PHOTO.snorkellerThumbsUp],
          imageAlts: [ALT.snorkellerThumbsUp],
        },
        {
          path: 'dolphin-watching-by-speedboat',
          price: P.DOLPHIN_WATCH,
          title: 'Dolphin Watching by Speedboat',
          short: 'A speedboat out into open water to look for dolphins, with two or three snorkelling stops. This option makes no island stop.',
          description: 'A speedboat can turn and follow where a day boat cannot, and this trip spends its time in open water looking for dolphins rather than queueing at a beach. Dolphins are wild animals, so no boat can promise a sighting, and whether you can swim near them depends on the sea and on how many boats are out.\n\nThere are two starts, morning and early afternoon. The crew makes two or three guided snorkelling stops, the gear and life jackets are aboard, and drinks and fruit are served on the boat. This is the option that does not stop at an island, and pickup from your hotel in Hurghada is included.',
          highlights: [
            'Open water by speedboat, looking for dolphins',
            'Two or three guided snorkelling stops',
            'Gear, life jackets, drinks and fruit aboard',
            'A morning or an afternoon start, with hotel pickup',
          ],
          seo: {
            metaTitle: 'Hurghada Dolphin Watching Speedboat Trip',
            metaDescription: 'A speedboat trip from Hurghada looking for dolphins in open water, with two or three snorkelling stops and hotel pickup. No island stop.',
          },
          images: [PHOTO.speedboatAtSpeed],
          imageAlts: [ALT.speedboatAtSpeed],
        },
        {
          path: 'six-islands-by-speedboat',
          price: P.SIX_ISLANDS,
          title: 'Six Islands by Speedboat',
          short: 'A full day by speedboat around six islands off Hurghada, with three snorkelling stops and the island entry fees.',
          description: 'Six islands in a day is a speedboat’s kind of trip: the hull is quick enough between them that the day is spent at the stops rather than on the way to them. The route takes in Orange Bay, White Island, Magawish, Abu Minqar and a sandbank, with the entry fees for them in the price.\n\nThere are three guided snorkelling stops, one of them over a wreck, and the gear and life jackets are aboard. Drinks and seasonal fruit are served on the boat, the captain watches for dolphins in the open water between the islands, and pickup from your hotel in Hurghada is included. Lunch is not part of this price.',
          highlights: [
            'Six islands in one day by speedboat',
            'Three guided snorkelling stops, one over a wreck',
            'The island entry fees included',
            'Drinks and fruit aboard, with hotel pickup',
          ],
          seo: {
            metaTitle: 'Six Islands Speedboat Day from Hurghada',
            metaDescription: 'A full speedboat day around six islands off Hurghada, with three snorkelling stops, the island entry fees and hotel pickup.',
          },
          images: [PHOTO.snorkellerOverCoral],
          imageAlts: [ALT.snorkellerOverCoral],
        },
        {
          path: 'dolphin-house-by-speedboat',
          price: P.DOLPHIN_SPEEDBOAT,
          title: 'Dolphin House by Speedboat',
          short: 'A short speedboat run out to the Dolphin House reef, with snorkelling over the coral.',
          description: 'The Dolphin House is a horseshoe reef out from Hurghada where spinner dolphins rest through the day, and a speedboat reaches it fast enough to make the trip four hours rather than a whole day.\n\nThe boat makes two guided snorkelling and swimming stops at the reef, with the equipment and life jackets aboard. Water, soft drinks and seasonal fruit are served on the boat, and there is a shaded area on deck. Pickup from your hotel in Hurghada and the drive back are included.',
          highlights: [
            'The Dolphin House reef by fast boat',
            'Two guided snorkelling and swimming stops',
            'Equipment, drinks and fruit aboard',
            'Hotel pickup and drop-off included',
          ],
          seo: {
            metaTitle: 'Dolphin House Speedboat Trip from Hurghada',
            metaDescription: 'A short speedboat run from Hurghada out to the Dolphin House reef, with guided snorkelling, equipment aboard and hotel pickup.',
          },
          images: [PHOTO.speedboatWake],
          imageAlts: [ALT.speedboatWake],
        },
        {
          path: 'hula-hula-island-by-speedboat',
          price: P.HULA_SPEEDBOAT,
          title: 'Hula Hula Island by Speedboat',
          short: 'A speedboat run out to the Hula Hula beach, with snorkelling on the way and time ashore.',
          description: 'Hula Hula is a stretch of white sand with straw sunshades and shallow turquoise water in front of it, and the speedboat is there in a fraction of the time a day boat takes. There are two starts, morning and early afternoon, and the island entry ticket is in the price.\n\nThe crew makes a guided snorkelling stop, the gear and life jackets are aboard, and the rest of the time is yours on the beach. Fruit and soft drinks are served, and pickup from your hotel in Hurghada is included.',
          highlights: [
            'The Hula Hula beach by fast boat',
            'A morning or an afternoon start',
            'A guided snorkelling stop and the entry ticket',
            'Fruit and soft drinks aboard, with hotel pickup',
          ],
          seo: {
            metaTitle: 'Hula Hula Island Speedboat Trip from Hurghada',
            metaDescription: 'A speedboat run from Hurghada to the Hula Hula beach, with a snorkelling stop, equipment aboard and hotel pickup.',
          },
          images: [PHOTO.hulaHulaSign],
          imageAlts: [ALT.hulaHulaSign],
        },
      ],
    },
  ],
};
