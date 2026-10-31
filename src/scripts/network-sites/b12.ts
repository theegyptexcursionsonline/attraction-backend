/**
 * Batch B12 (31 October 2026), the ten sites after B11: nine monuments of the Saqqara necropolis and its
 * neighbours, and one stretch of mangrove shore inside Ras Mohamed National Park. Two groups:
 *
 * - B12A: Imhotep Museum, Serapeum of Saqqara, Pyramid of Teti, Pyramid of Unas, Pyramid of Userkaf,
 *   Tomb of Nefer, Buried Pyramid, Pyramid of Pepi II, Pyramid of Sahure (the days south of Giza).
 * - B12B: Mangrove Forest Egypt (the two Ras Mohamed days out of Sharm el-Sheikh).
 *
 * Every trip is built on the record the client publishes on its own main site, read into the dated snapshot
 * (`network-sites/eeo-snapshot.json`); prices, child rates, departures and inclusions are copied from that
 * record at apply time and never typed here. The client's published list was re-screened on 31 October 2026
 * and is unchanged: 217 trips, the same slugs and the same prices as on 27, 28 and 30 October.
 *
 * THE "NEAREST DAYS" RULE, new in this batch (coordinator, 31 October). Every one of the forty-three unbuilt
 * new-build domains was matched against the client's list, its full records and every network trip. No client
 * trip names any of those forty-three places as a stop. One place is a true match: two Ras Mohamed days name
 * the mangroves in their own published "what's included". So this batch takes the ten domains the client's
 * days come closest to, and each page says plainly what its programme names and that the programme does not
 * name the site's own monument. No page implies a stop the record does not publish. When the client publishes
 * a day that does stop at one of these monuments, it replaces the trips sold here.
 *
 * What each site may sell, and why:
 * - The seven North Saqqara monuments (Imhotep Museum, Serapeum, Teti, Unas, Userkaf, Nefer, Buried Pyramid)
 *   each stand inside the Saqqara necropolis, so each sells the five days whose record stops at Saqqara.
 * - The Pyramid of Pepi II stands at South Saqqara, which lies between Saqqara and Dahshur, so it sells only
 *   the three days that stop at both: the shared day, the private day and the VIP private day with the sail.
 *   The three that reach Saqqara without Dahshur are held back from it.
 * - The Pyramid of Sahure stands at Abusir, which the road from the Giza plateau to Saqqara passes, so it
 *   sells only the three days that drive it: the Giza-and-south day, the VIP private day and the two-day
 *   private trip. The two days that start at Dahshur rather than Giza are held back from it.
 * - Mangrove Forest Egypt sells the two days whose own schedules stop at the mangrove shore. Its city, area,
 *   pickup, coordinates and `foreignPlaces` follow the Sharm sites of `b03-rest.ts`.
 *
 * Every programme this batch sells was already written by an earlier batch (`b03`, `b03-rest`, `b10`), so this
 * batch imports them rather than restating them: the same options, departures, renames and schedules, so the
 * network says the same thing about the same trip wherever it is sold. No programme is new here.
 *
 * What the coordinator settled on 31 October, kept here so a later batch does not re-open it:
 * - Nine sites here sell records that batches B03, B10 and B11 already sell, because the client's days visit
 *   these monuments' necropolis together. Same-subject sites sharing a record was decided for B10; these ten
 *   domains are monument names rather than new subjects. The sites differ in their words, their photos and
 *   their design, not in their catalogue. No two sites on the network share a trip title.
 * - The client publishes only three distinct photos across every record the nine monument sites sell, and all
 *   three already open a site that is live (Mit Rahina Museum, Sakkara Pyramids, Pyramids of Dahshur). No
 *   photo is invented and none is mislabelled, so these sites open on a photo another site opens on; the nine
 *   are ordered so that the three are spread across them rather than repeated. Accepted for now: every photo
 *   here is replaceable the moment the client supplies each site's own, and nothing but the photo lists and
 *   their descriptions change. The two Ras Mohamed photos are batch B03's rehosted copies of the records' own,
 *   described exactly as that batch described them.
 * - The Pyramid of Pepi II's vetted facts include the letter the boy king sent to Harkhuf, which is copied on
 *   Harkhuf's tomb at Aswan. Aswan is a place this site does not serve, so that fact is left out of its copy
 *   rather than named: the site's description carries only the two facts that stay south of Giza.
 *
 * Held back, and why (each is a question for the client in the build report):
 * - A day that stops at any of these nine monuments. None exists in the client's published list, which is the
 *   whole reason for the "nearest days" rule above. The list of days to ask the client for is in the build
 *   report: a Saqqara day that enters the Serapeum galleries or the Imhotep Museum, a South Saqqara day, and
 *   an Abusir day.
 * - The long packages (`cairo-3-day-tour-pyramids-museums-islamic-cairo-nile-cruise`,
 *   `cairo-4-day-highlights-pyramids-ancient-sites-old-cairo`,
 *   `cairo-nile-cruise-6-day-egypt-highlights-abu-simbel-hot-air-balloon`,
 *   `egypt-in-9-days-cairo-alexandria-nile-cruise-luxor-abu-simbel`): each runs for days across Alexandria,
 *   Aswan, Luxor and Abu Simbel with hotels, a Nile cruise and internal flights. No batch on the network sells
 *   one, and none of these sites can describe such a day without naming places it does not serve. Batches B10
 *   and B11 held them back for the same reason, and they are the only other records that reach Saqqara.
 * - `cairo-private-guided-tour-to-your-choice-of-top-attractions` (its Saqqara option): the record excludes
 *   hotel transfers and sells them as an add-on bound to no booking option, so it does not include the hotel
 *   pickup every network trip promises. Each of the seven necropolis sites would have had one more trip.
 *   Batches B10 and B11 held the same record back for the same reason.
 * - `sharm-el-sheikh-2-day-cairo-pyramids-gem-luxury-stay`, its second option ("Day 1 Pyramids & GEM + Day 2
 *   Memphis, Saqqara & Old Cairo"): the option's name says Memphis and Saqqara, while its own description
 *   says the second day is three sites chosen from Saqqara, the Citadel, the Hanging Church, the Amr Ibn
 *   Al-As Mosque and the Museum of Civilization, and that its entrance fees are not included. Batches B10 and
 *   B11 held it back for the same reason, and its first option never leaves Giza.
 * - The other mangrove coasts: Nabq, Marsa Alam and Hamata. Egypt's mangroves grow there too, but no record
 *   this site sells goes to any of them, so `foreignPlaces` keeps all three out of its copy.
 * - The four Ras Mohamed ATV options sold for two, three or four riders sharing one vehicle: the programme
 *   batch B03 wrote sells the two single-rider options only, and says so in its own "Need to know".
 *
 * Photos are the ones each record publishes, already on the network's Cloudinary. Copying them into a
 * network-b12 folder, each site's own photos and the ten logos are open questions: `--apply` refuses to run
 * without `--logos=<file>` naming every site's approved logo, logoDark and favicon.
 */
import type { NetworkBatch, PriceSpec } from '../seed-network-sites';
import { PROGRAMMES as B03 } from './b03';
import { PROGRAMMES as B03R } from './b03-rest';
import { NEW_PROGRAMMES as B10N } from './b10';

/** Every programme this batch sells. All seven were written by the batch that first sold the record. */
const P = {
  SOUTH_SHARED: B03.MAS_SHARED,
  SOUTH_PRIVATE: B03.MAS_PRIVATE,
  GIZA_SOUTH: B03.MAS_WITH_GIZA,
  GIZA_SOUTH_VIP: B03.MAS_NILE_SAIL,
  TWO_DAY_PRIVATE: B10N.TWO_DAY_PRIVATE,
  RAS_MOHAMED_BUS: B03R.STG_RAS_MOHAMED_BUS,
  RAS_MOHAMED_ATV: B03R.SSS_RAS_MOHAMED_ATV,
} satisfies Record<string, PriceSpec>;

/**
 * Each record's own photo, as the client publishes it. The three Saqqara photographs are the ones batches B10
 * and B11 use for the same records; the two Sinai photographs are batch B03's rehosted copies for the same two
 * records, with that batch's own descriptions.
 */
const PHOTO = {
  stepPyramid: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788797085/tours/m87zl1cmmc4kcv2nrv4o.jpg',
  stepPyramidAtDusk: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781377/tours/wkmxhvoiwvc36jaxfrr6.jpg',
  feluccasAtCairo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788797148/tours/i7hlesmpg9oel1enka8o.jpg',
  allahGate: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936164/attractions-network/network-b03/sharm-tour-guide/da2t24xuvbcuj3fe7bsy.jpg',
  quadAboveTheSea: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936197/attractions-network/network-b03/safari-sharm-el-sheikh/ak9eg3ao5v9ixrzhovqa.jpg',
};

/** Each photo described as it is, not as the trip it illustrates. */
const ALT: Record<keyof typeof PHOTO, string> = {
  stepPyramid: 'The stepped pyramid at Sakkara rising behind the restored stone walls and doorways of its funerary enclosure, across open sand',
  stepPyramidAtDusk: 'The stepped pyramid of Djoser rising in six tiers of worn stone above flat open sand, under a hazy sky at the end of the day',
  feluccasAtCairo: 'Two feluccas under white sails on the river, with the Cairo waterfront, a tall latticed tower and palms behind',
  allahGate: 'Tall sculpted sandstone slabs leaning together to form an open gateway in the desert, against a pale sunset sky',
  quadAboveTheSea: 'A rider driving a quad bike hard up a sand slope above the sea, sand flying from the wheels, with the coast below',
};

const CAIRO = { lat: 30.0444, lng: 31.2357 };
const SHARM = { lat: 27.7369, lng: 34.3394 };

/**
 * Places the nine monument sites never name. Their days run between Cairo, Giza, Sakkara, Memphis and
 * Dahshur, so those names are theirs to use; the rest of Egypt is not. The same fence batch B11A used.
 */
const NOT_SOUTH_OF_GIZA = /Hurghada|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum/i;
/**
 * The mangrove site stays on the Ras Mohamed shore it sells, the way the Sharm sites of batch B03 stay on
 * theirs. Egypt's other mangrove coasts are named here so no page can drift onto one: not a record this site
 * sells goes to Nabq, to Marsa Alam or to Hamata.
 */
const NOT_RAS_MOHAMED = /Hurghada|Giftun|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Nabq|Hamata|Dahab|Tiran|Cairo|Giza|pyramid|Luxor|Aswan|Fayoum|Alexandria|Siwa|Bahariya|Taba|Nuweiba/i;

/** The closing line every B11 site ends on, and every site here: what is included, and how to hold a place. */
const CLOSING = 'Every trip collects you from your hotel and brings you back, and each page says what its own price covers. Hold a place online and pay later, or ask the team first about the pickup time.';
/** Where the five necropolis days go, in the words batch B11 used for the same five. */
const WHERE_THEY_GO = 'Some of them go on to Memphis and to Dahshur, some begin on the Giza plateau, and one runs over two days and ends in the museums of Cairo.';

/** B12A: the nine monuments of the necropolis south of Giza and its neighbours. */
export const B12A: NetworkBatch = {
  id: 'b12a',
  sites: [
    {
      slug: 'imhotep-museum',
      name: 'Imhotep Museum',
      listingPath: '/trips',
      domain: 'imhotepmuseum.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'imm-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      tagline: 'Guided days across the necropolis at Saqqara',
      description: `The Imhotep Museum stands at the entrance to the archaeological site of Saqqara, and shows objects found in the necropolis. It is named after Imhotep, the architect credited with the Step Pyramid of the pharaoh Djoser.\n\nEvery day sold here stops at Saqqara, and their published programmes name the Step Pyramid and the necropolis rather than the museum, which is not a stop on any of them. ${WHERE_THEY_GO} ${CLOSING}`,
      seo: {
        metaTitle: 'Imhotep Museum: Saqqara Day Trips from Cairo',
        metaDescription: 'Guided days that stop at the Saqqara necropolis and its Step Pyramid, with Memphis, Dahshur or the Giza plateau, and hotel pickup in Cairo or Giza.',
        keywords: ['imhotep museum saqqara day trip', 'saqqara day trip from cairo', 'step pyramid and memphis tour', 'saqqara and dahshur guided day', 'saqqara day trip with hotel pickup'],
      },
      theme: { primaryColor: '#1E1B18', secondaryColor: '#F2E8D2', accentColor: '#B23A2A' },
      heroImages: [PHOTO.stepPyramid, PHOTO.feluccasAtCairo, PHOTO.stepPyramidAtDusk],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/imhotep-museum/monogram.png',
      trips: [
        {
          path: 'sakkara-memphis-and-dahshur-shared',
          price: P.SOUTH_SHARED,
          title: 'Saqqara, Memphis and Dahshur: the Shared Day from Cairo',
          short: 'A shared day south of Giza with a guide and the entry tickets: the necropolis at Saqqara, the ruins of Memphis and the pyramids of Dahshur.',
          description: 'The day runs out to Dahshur for the Bent and the Red Pyramids, back up to Saqqara for the Step Pyramid and the tombs around it, and finishes at Memphis among the ruins of the old capital with its fallen colossus of Ramses II. The programme names the Step Pyramid and the necropolis, not the Imhotep Museum; this day makes no stop there.\n\nThe vehicle is air-conditioned and shared with other guests, the guide speaks English, and the entry tickets for the sites the day visits are in the price. Pickup from your hotel in Cairo or Giza is included, and the day leaves at eleven.',
          highlights: [
            'The Step Pyramid and the tombs of the necropolis',
            'The ruins of Memphis and its fallen colossus',
            'The Bent and Red Pyramids at Dahshur',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Saqqara, Memphis and Dahshur: Shared Day from Cairo',
            metaDescription: 'A shared guided day at the Saqqara necropolis, Memphis and Dahshur, with the entry tickets and hotel pickup in Cairo or Giza.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-sakkara-memphis-and-dahshur',
          price: P.SOUTH_PRIVATE,
          title: 'Saqqara, Memphis and Dahshur with Your Own Guide',
          short: 'The same three places with your own guide and vehicle, an eight o’clock start and the entry tickets.',
          description: 'An eight o’clock start and a vehicle of your own put you in the necropolis before the shared groups reach it, with time for the Step Pyramid enclosure and the mastaba tombs laid out around it. The day carries on to Memphis and out to Dahshur. The programme names the Step Pyramid and the necropolis, not the Imhotep Museum; this day makes no stop there.\n\nThe guide can be asked for in another language, the entry tickets for the sites the day visits are in the price, and the vehicle collects you from your hotel in Cairo or Giza and brings you back.',
          highlights: [
            'Your own guide and vehicle for the day',
            'The Step Pyramid enclosure and the tombs around it',
            'Memphis and the pyramids of Dahshur',
            'An early start and the entry tickets included',
          ],
          seo: {
            metaTitle: 'Private Saqqara, Memphis and Dahshur Day with a Guide',
            metaDescription: 'A private early day at the Saqqara necropolis, Memphis and Dahshur with your own vehicle, the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'giza-pyramids-sakkara-and-memphis',
          price: P.GIZA_SOUTH,
          title: 'From the Giza Plateau to Saqqara and Memphis',
          short: 'One day from the plateau down to the necropolis and the old capital, shared or private, with the entry tickets.',
          description: 'The day opens on the Giza plateau among the pyramids and the Great Sphinx, then takes the desert road south to Saqqara for the Step Pyramid, and ends at Memphis among the ruins of the capital these tombs were built for. The programme names the Step Pyramid and the necropolis, not the Imhotep Museum; this day makes no stop there.\n\nYou choose how to travel: a shared group, or your own guide and vehicle, with the private day also offered in Italian or Spanish. The entry tickets for the sites the day visits are in the price either way, and the vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'The Giza plateau and the Great Sphinx',
            'The Step Pyramid at Saqqara',
            'The ruins of Memphis at the end of the day',
            'A shared group or your own guide and vehicle',
          ],
          seo: {
            metaTitle: 'Giza Plateau, Saqqara and Memphis in One Day',
            metaDescription: 'A guided day from the Giza plateau to the Saqqara necropolis and Memphis, shared or private, with the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'The Long Private Day, with Lunch and a Felucca Sail',
          short: 'A private day taking in the plateau, the necropolis, Memphis and Dahshur, with lunch and an hour under sail on the Nile.',
          description: 'The slowest way to cross the necropolis, and the longest. Your own guide and vehicle take you from the Giza plateau to Memphis, up to Saqqara for the Step Pyramid and the tombs around it, and out to the Bent and Red Pyramids at Dahshur, with lunch along the way. The programme names the Step Pyramid and the necropolis, not the Imhotep Museum; this day makes no stop there.\n\nThe day closes on the river, an hour under the white sail of a felucca. The entry tickets for the sites the day visits are in the price, and the vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'The necropolis, Memphis and Dahshur with your own guide',
            'The Giza plateau at the start of the day',
            'Lunch at a local restaurant',
            'An hour on the Nile under sail',
          ],
          seo: {
            metaTitle: 'Private Day: Giza, Saqqara, Dahshur and a Nile Sail',
            metaDescription: 'A private day at the Giza plateau, Saqqara, Memphis and Dahshur with lunch, an hour under sail on the Nile and hotel pickup.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'Two Private Days: Saqqara and Memphis, then the Museums',
          short: 'Day one at the Giza plateau, Saqqara and Memphis; day two at the Egyptian Museum and the Museum of Egyptian Civilization.',
          description: 'Saqqara comes in the middle of the first day, after the plateau and the Valley Temple: your own guide walks you to the Step Pyramid of Djoser, then on to Memphis, its colossal statue of Ramses II and the alabaster sphinx beside it. The programme names the Step Pyramid and the necropolis, not the Imhotep Museum; this day makes no stop there.\n\nThe second day is spent in the museums, first the Egyptian Museum on Tahrir Square and then the Museum of Egyptian Civilization with its hall of royal mummies. Your own guide and vehicle for both days, the entry fees, and lunch on each. The vehicle collects you from your hotel on both mornings.',
          highlights: [
            'The Step Pyramid of Djoser on day one',
            'The Giza plateau, the Valley Temple and the Great Sphinx',
            'Memphis, its colossus and the alabaster sphinx',
            'The Egyptian Museum and the royal mummies on day two',
          ],
          seo: {
            metaTitle: 'Two Private Days: Saqqara, Memphis and the Museums',
            metaDescription: 'Two private days: the Giza plateau, Saqqara and Memphis, then the Egyptian Museum and the Museum of Egyptian Civilization, with hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
      ],
    },
    {
      slug: 'serapeum-of-saqqara',
      name: 'Serapeum of Saqqara',
      listingPath: '/trips',
      domain: 'serapeumofsaqqara.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'sos-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      tagline: 'Guided days in the necropolis above the galleries',
      description: `The Serapeum of Saqqara is the burial place of the Apis bulls, the sacred animals of Memphis: long galleries cut into the rock, with large stone boxes set in vaults on either side. It lies north-west of the Step Pyramid, inside the Saqqara necropolis.\n\nEvery day sold here stops at Saqqara, and their published programmes name the Step Pyramid and the necropolis rather than the Serapeum, which is not a stop on any of them. ${WHERE_THEY_GO} ${CLOSING}`,
      seo: {
        metaTitle: 'Serapeum of Saqqara: Days in the Necropolis',
        metaDescription: 'Guided days at the Saqqara necropolis and the Step Pyramid, with Memphis, Dahshur or the Giza plateau, and hotel pickup in Cairo or Giza.',
        keywords: ['serapeum of saqqara day trip', 'saqqara necropolis day trip from cairo', 'apis bulls saqqara', 'step pyramid and dahshur day tour', 'saqqara guided day with pickup'],
      },
      theme: { primaryColor: '#1A1714', secondaryColor: '#E8E0D0', accentColor: '#D4A24C' },
      heroImages: [PHOTO.stepPyramidAtDusk, PHOTO.stepPyramid, PHOTO.feluccasAtCairo],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/serapeum-of-saqqara/monogram.png',
      trips: [
        {
          path: 'sakkara-memphis-and-dahshur-shared',
          price: P.SOUTH_SHARED,
          title: 'The Shared Day Across Saqqara, Memphis and Dahshur',
          short: 'A shared day with a guide and the entry tickets: the pyramids of Dahshur, the necropolis at Saqqara and the ruins of Memphis.',
          description: 'Three stops in one shared day: Dahshur first, for the Bent and the Red Pyramids; then Saqqara, where the guide walks you through the Step Pyramid enclosure and the tombs cut around it; then Memphis, a field of ruins with the fallen colossus of Ramses II at its centre. The programme names the Step Pyramid and the necropolis, not the Serapeum; this day makes no stop there.\n\nThe vehicle is air-conditioned and shared with other guests, the guide speaks English, and the entry tickets for the sites the day visits are in the price. Pickup from your hotel in Cairo or Giza is included, and the day leaves at eleven.',
          highlights: [
            'The Bent and Red Pyramids at Dahshur',
            'The Step Pyramid enclosure at Saqqara',
            'The ruins of Memphis and its fallen colossus',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Shared Day: Dahshur, the Saqqara Necropolis, Memphis',
            metaDescription: 'A shared guided day at the Dahshur pyramids, the Saqqara necropolis and Memphis, with the entry tickets and hotel pickup in Cairo or Giza.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-sakkara-memphis-and-dahshur',
          price: P.SOUTH_PRIVATE,
          title: 'The Private Eight O’Clock Day: Saqqara, Memphis, Dahshur',
          short: 'The same three places with your own guide and vehicle, an early start and the entry tickets.',
          description: 'The private day leaves at eight, which puts you in the necropolis while it is still quiet, and gives your own guide the time to take the Step Pyramid enclosure and the tombs around it slowly. Memphis and Dahshur follow. The programme names the Step Pyramid and the necropolis, not the Serapeum; this day makes no stop there.\n\nThe guide can be asked for in another language, the entry tickets for the sites the day visits are in the price, and your own air-conditioned vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'An eight o’clock start, ahead of the shared groups',
            'Your own guide and air-conditioned vehicle',
            'The Step Pyramid enclosure and the tombs around it',
            'Memphis, Dahshur and the entry tickets included',
          ],
          seo: {
            metaTitle: 'Private Early Day: Saqqara, Memphis and Dahshur',
            metaDescription: 'A private day leaving at eight for the Saqqara necropolis, Memphis and Dahshur, with your own guide, the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'giza-pyramids-sakkara-and-memphis',
          price: P.GIZA_SOUTH,
          title: 'The Plateau, Saqqara and Memphis in a Single Day',
          short: 'One day from the Giza plateau to the necropolis and the old capital, shared or private, with the entry tickets.',
          description: 'The day begins on the Giza plateau among the pyramids and the Great Sphinx, drives south to the Step Pyramid at Saqqara, and ends at Memphis among the ruins of the capital the necropolis served. The programme names the Step Pyramid and the necropolis, not the Serapeum; this day makes no stop there.\n\nThere are three ways to take it: a shared group in English, your own guide and vehicle in English, or your own guide in Italian or Spanish. The entry tickets for the sites the day visits are in the price in each case, and the vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'The pyramids and the Great Sphinx at Giza',
            'The Step Pyramid at Saqqara',
            'Memphis, the capital the necropolis served',
            'Shared, private, or private in Italian or Spanish',
          ],
          seo: {
            metaTitle: 'Giza, Saqqara and Memphis: One Day, Three Ways',
            metaDescription: 'A guided day from the Giza plateau to the Saqqara necropolis and Memphis, shared or private, with the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'Giza to Dahshur Privately, with Lunch and a Nile Sail',
          short: 'A private day across the plateau, Memphis, the necropolis and Dahshur, with lunch and an hour under sail.',
          description: 'This is the day that reaches all four places. Your own guide and vehicle start on the Giza plateau, stop at Memphis for the ruins and the colossus, climb to Saqqara for the Step Pyramid and the tombs around it, and finish at the Bent and Red Pyramids of Dahshur, with lunch in between. The programme names the Step Pyramid and the necropolis, not the Serapeum; this day makes no stop there.\n\nThe last hour is spent on the river under the white sail of a felucca. The entry tickets for the sites the day visits are in the price, and the vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'Four sites in one private day',
            'The Step Pyramid and the tombs of the necropolis',
            'Lunch at a local restaurant',
            'An hour on the Nile under sail',
          ],
          seo: {
            metaTitle: 'Private Day from Giza to Dahshur with a Nile Sail',
            metaDescription: 'A private day across the Giza plateau, Memphis, the Saqqara necropolis and Dahshur, with lunch, a felucca sail and hotel pickup.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'Two Private Days: the Saqqara Plateau and Cairo’s Museums',
          short: 'Day one at the Giza plateau, Saqqara and Memphis; day two in the two great museums of Cairo.',
          description: 'The first day works south: the pyramids of Giza, the Valley Temple and the Great Sphinx, then the Step Pyramid of Djoser at Saqqara, then Memphis with its colossal statue of Ramses II and the alabaster sphinx. The programme names the Step Pyramid and the necropolis, not the Serapeum; this day makes no stop there.\n\nThe second day is indoors: the Egyptian Museum on Tahrir Square, then the Museum of Egyptian Civilization and its hall of royal mummies. Your own guide and vehicle on both days, the entry fees, and lunch on each. The vehicle collects you from your hotel on both mornings.',
          highlights: [
            'The Step Pyramid of Djoser on day one',
            'The Giza plateau, the Valley Temple and the Sphinx',
            'Memphis and the alabaster sphinx',
            'Two museums and the royal mummies on day two',
          ],
          seo: {
            metaTitle: 'Two Private Days: Saqqara and the Cairo Museums',
            metaDescription: 'Two private days: the Giza plateau, the Saqqara necropolis and Memphis, then the Egyptian Museum and the Museum of Egyptian Civilization.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
      ],
    },
    {
      slug: 'pyramid-of-teti',
      name: 'Pyramid of Teti',
      listingPath: '/trips',
      domain: 'pyramidofteti.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'pte-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      tagline: 'Guided days where the Sixth Dynasty begins',
      description: `Teti was the first king of the Sixth Dynasty, and his pyramid stands at North Saqqara, north-east of the Step Pyramid. Its burial chamber carries Pyramid Texts and its ceiling is carved with stars, and the tombs of his officials, among them Mereruka and Kagemni, stand beside it.\n\nEvery day sold here stops at Saqqara, and their published programmes name the Step Pyramid and the necropolis rather than the Pyramid of Teti, which is not a stop on any of them. ${WHERE_THEY_GO} ${CLOSING}`,
      seo: {
        metaTitle: 'Pyramid of Teti: Saqqara Day Trips with Pickup',
        metaDescription: 'Guided days at the Saqqara necropolis and its Step Pyramid, with Memphis, Dahshur or the Giza plateau, and hotel pickup in Cairo or Giza.',
        keywords: ['pyramid of teti saqqara day trip', 'north saqqara pyramid texts', 'saqqara day trip from cairo', 'step pyramid and memphis guided day', 'saqqara tour with hotel pickup'],
      },
      theme: { primaryColor: '#14203F', secondaryColor: '#F2EDE1', accentColor: '#E2B84B' },
      heroImages: [PHOTO.feluccasAtCairo, PHOTO.stepPyramidAtDusk, PHOTO.stepPyramid],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/pyramid-of-teti/monogram.png',
      trips: [
        {
          path: 'sakkara-memphis-and-dahshur-shared',
          price: P.SOUTH_SHARED,
          title: 'The Eleven O’Clock Shared Day: Saqqara, Memphis, Dahshur',
          short: 'A shared day leaving at eleven, with a guide and the entry tickets: Dahshur, the Saqqara necropolis and Memphis.',
          description: 'A late-morning start and a shared air-conditioned vehicle, out first to Dahshur for the Bent and the Red Pyramids, then up to Saqqara for the Step Pyramid and the tombs cut around it, and last to Memphis and its fallen colossus of Ramses II. The programme names the Step Pyramid and the necropolis, not the Pyramid of Teti; this day makes no stop there.\n\nThe guide speaks English, and the entry tickets for the sites the day visits are in the price. Pickup from your hotel in Cairo or Giza is included, and lunch is not part of this price.',
          highlights: [
            'A late-morning start in a shared group',
            'The Bent and Red Pyramids at Dahshur',
            'The Step Pyramid and the tombs of the necropolis',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Late-Morning Shared Day: Dahshur, Saqqara, Memphis',
            metaDescription: 'A shared guided day leaving at eleven for Dahshur, the Saqqara necropolis and Memphis, with the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-sakkara-memphis-and-dahshur',
          price: P.SOUTH_PRIVATE,
          title: 'A Private Vehicle to Saqqara, Memphis and Dahshur',
          short: 'Your own guide and air-conditioned vehicle for the three places south of Giza, from eight in the morning.',
          description: 'A vehicle of your own and a guide of your own, from eight in the morning until the end of the afternoon: the Step Pyramid enclosure at Saqqara and the mastaba tombs around it, the ruins of Memphis, and the Bent and Red Pyramids out at Dahshur. The programme names the Step Pyramid and the necropolis, not the Pyramid of Teti; this day makes no stop there.\n\nThe guide can be asked for in another language, the entry tickets for the sites the day visits are in the price, and lunch is not part of this one. The vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'Your own guide and vehicle from eight in the morning',
            'The Step Pyramid enclosure and the mastaba tombs',
            'The ruins of Memphis',
            'The Bent and Red Pyramids at Dahshur',
          ],
          seo: {
            metaTitle: 'Private Vehicle Day: Saqqara, Memphis and Dahshur',
            metaDescription: 'A private day with your own guide and vehicle at the Saqqara necropolis, Memphis and Dahshur, with the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'giza-pyramids-sakkara-and-memphis',
          price: P.GIZA_SOUTH,
          title: 'Giza, Saqqara and Memphis: Shared or Private',
          short: 'The plateau, the Step Pyramid and the old capital in one day, in a shared group or with your own guide.',
          description: 'One day and three places: the Giza plateau with its pyramids and the Great Sphinx, the Step Pyramid at Saqqara, and the ruins of Memphis with the colossus of Ramses II lying among them. The programme names the Step Pyramid and the necropolis, not the Pyramid of Teti; this day makes no stop there.\n\nTake it in a shared group with an English-speaking guide, or privately with your own guide and vehicle, which can also be asked for in Italian or Spanish. The entry tickets for the sites the day visits are in the price, and pickup from your hotel in Cairo or Giza is included.',
          highlights: [
            'The Giza plateau and the Great Sphinx',
            'The Step Pyramid at Saqqara',
            'Memphis and the colossus of Ramses II',
            'Shared or private, with the entry tickets',
          ],
          seo: {
            metaTitle: 'Giza, Saqqara and Memphis: Shared or Private Day',
            metaDescription: 'The Giza plateau, the Step Pyramid at Saqqara and Memphis in one guided day, shared or private, with the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'A Private Day Ending Under a White Sail on the Nile',
          short: 'The plateau, Memphis, the necropolis and Dahshur with your own guide, lunch, and an hour on the river.',
          description: 'The fullest of these days, and the one with room in it: your own guide and vehicle take the Giza plateau, then Memphis, then Saqqara for the Step Pyramid and the tombs around it, then Dahshur for the Bent and the Red Pyramids, with lunch at a local restaurant on the way. The programme names the Step Pyramid and the necropolis, not the Pyramid of Teti; this day makes no stop there.\n\nIt finishes with an hour on the Nile under the white sail of a felucca. The entry tickets for the sites the day visits are in the price, and the vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'The plateau, Memphis, Saqqara and Dahshur',
            'Your own guide and vehicle all day',
            'Lunch at a local restaurant',
            'An hour on the river under sail',
          ],
          seo: {
            metaTitle: 'Private Day with Lunch and an Hour Under Sail',
            metaDescription: 'A private day at the Giza plateau, Memphis, the Saqqara necropolis and Dahshur, with lunch, a felucca sail and hotel pickup.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'Two Private Days: Giza and Saqqara, then the Royal Mummies',
          short: 'Day one on the plateau, at Saqqara and at Memphis; day two in the Egyptian Museum and the Museum of Egyptian Civilization.',
          description: 'Day one is the desert: the pyramids of Giza, the Valley Temple, the Great Sphinx, then the Step Pyramid of Djoser at Saqqara, and Memphis with its colossal statue of Ramses II and the alabaster sphinx beside it. The programme names the Step Pyramid and the necropolis, not the Pyramid of Teti; this day makes no stop there.\n\nDay two is the museums: the Egyptian Museum on Tahrir Square, then the Museum of Egyptian Civilization, where the royal mummies lie in a hall of their own. Your own guide and vehicle on both days, the entry fees, and lunch on each.',
          highlights: [
            'The plateau, the Valley Temple and the Great Sphinx',
            'The Step Pyramid of Djoser at Saqqara',
            'Memphis, its colossus and the alabaster sphinx',
            'The royal mummies hall on day two',
          ],
          seo: {
            metaTitle: 'Two Private Days: Giza, Saqqara and Royal Mummies',
            metaDescription: 'Two private days: the Giza plateau, Saqqara and Memphis, then the Egyptian Museum and the royal mummies at the Museum of Egyptian Civilization.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
      ],
    },
    {
      slug: 'pyramid-of-unas',
      name: 'Pyramid of Unas',
      listingPath: '/trips',
      domain: 'pyramidofunas.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'pun-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      tagline: 'Guided days beside the oldest written walls',
      description: `Unas was the last king of the Fifth Dynasty, and his pyramid stands at Saqqara, south-west of the Step Pyramid’s enclosure. The walls of its burial chamber carry the oldest known Pyramid Texts, and a long causeway runs from the pyramid towards the valley.\n\nEvery day sold here stops at Saqqara, and their published programmes name the Step Pyramid and the necropolis rather than the Pyramid of Unas, which is not a stop on any of them. ${WHERE_THEY_GO} ${CLOSING}`,
      seo: {
        metaTitle: 'Pyramid of Unas: Guided Saqqara Days from Cairo',
        metaDescription: 'Guided days at the Saqqara necropolis and the Step Pyramid, with Memphis, Dahshur or the Giza plateau, and hotel pickup in Cairo or Giza.',
        keywords: ['pyramid of unas saqqara day trip', 'oldest pyramid texts saqqara', 'saqqara day trip from cairo', 'saqqara memphis and dahshur day', 'saqqara guided day with hotel pickup'],
      },
      theme: { primaryColor: '#1C1C1A', secondaryColor: '#F1ECE0', accentColor: '#2F7F7A' },
      heroImages: [PHOTO.stepPyramid, PHOTO.stepPyramidAtDusk, PHOTO.feluccasAtCairo],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/pyramid-of-unas/monogram.png',
      trips: [
        {
          path: 'sakkara-memphis-and-dahshur-shared',
          price: P.SOUTH_SHARED,
          title: 'A Shared Group to Saqqara, Memphis and the Dahshur Field',
          short: 'A shared day with a guide and the entry tickets: Dahshur, the necropolis at Saqqara and the ruins of Memphis.',
          description: 'The shared day takes the three places in turn: the open field at Dahshur, where the Bent and the Red Pyramids stand a few hundred metres apart; Saqqara, with the Step Pyramid and the tombs cut around it; and Memphis, where the colossus of Ramses II lies among the ruins of the capital. The programme names the Step Pyramid and the necropolis, not the Pyramid of Unas; this day makes no stop there.\n\nThe vehicle is air-conditioned and shared with other guests, the guide speaks English, and the entry tickets for the sites the day visits are in the price. Pickup from your hotel in Cairo or Giza is included, and the day leaves at eleven.',
          highlights: [
            'The Bent and Red Pyramids in one field at Dahshur',
            'The Step Pyramid and the tombs around it',
            'Memphis and the colossus of Ramses II',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Shared Group Day: Dahshur, Saqqara and Memphis',
            metaDescription: 'A shared guided day at the Dahshur field, the Saqqara necropolis and the ruins of Memphis, with the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-sakkara-memphis-and-dahshur',
          price: P.SOUTH_PRIVATE,
          title: 'Saqqara, Memphis and Dahshur, Privately and Early',
          short: 'The three places south of Giza with your own guide and vehicle, from eight in the morning, with the entry tickets.',
          description: 'Privately and early, which on this road matters: at eight the necropolis is quiet, and your own guide has the whole morning for the Step Pyramid enclosure and the mastaba tombs around it before the day moves on to Memphis and out to Dahshur. The programme names the Step Pyramid and the necropolis, not the Pyramid of Unas; this day makes no stop there.\n\nThe guide can be asked for in another language, the entry tickets for the sites the day visits are in the price, and lunch is not part of it. Your own vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'The necropolis while it is still quiet',
            'Your own guide, in another language if you ask',
            'The ruins of Memphis and the Dahshur pyramids',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Private Early Saqqara, Memphis and Dahshur Day',
            metaDescription: 'A private day from eight in the morning at the Saqqara necropolis, Memphis and Dahshur, with the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'giza-pyramids-sakkara-and-memphis',
          price: P.GIZA_SOUTH,
          title: 'One Day Down the Desert Road: Giza, Saqqara, Memphis',
          short: 'From the plateau to the necropolis and the old capital in a single day, shared or private, with the entry tickets.',
          description: 'The day follows the desert road south. It starts on the Giza plateau among the pyramids and the Great Sphinx, stops at Saqqara for the Step Pyramid, and ends at Memphis, the capital whose dead were buried in the necropolis above it. The programme names the Step Pyramid and the necropolis, not the Pyramid of Unas; this day makes no stop there.\n\nThere is a shared group in English, a private day with your own guide and vehicle, and a private day in Italian or Spanish. The entry tickets for the sites the day visits are in the price, and pickup from your hotel in Cairo or Giza is included.',
          highlights: [
            'The desert road from Giza down to Saqqara',
            'The pyramids and the Great Sphinx at Giza',
            'The Step Pyramid at Saqqara',
            'Memphis, and the entry tickets included',
          ],
          seo: {
            metaTitle: 'The Desert Road: Giza, Saqqara and Memphis in a Day',
            metaDescription: 'A guided day down the desert road from the Giza plateau to the Saqqara necropolis and Memphis, shared or private, with hotel pickup.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'Four Sites Privately, with Lunch and an Hour Under Sail',
          short: 'The plateau, Memphis, the necropolis and Dahshur with your own guide, lunch included and a felucca at the end.',
          description: 'Four sites, one private vehicle and no hurry. The guide takes the Giza plateau first, then Memphis and its colossus, then Saqqara for the Step Pyramid and the tombs around it, then the Bent and Red Pyramids at Dahshur, with lunch at a local restaurant along the way. The programme names the Step Pyramid and the necropolis, not the Pyramid of Unas; this day makes no stop there.\n\nThe day ends with an hour on the Nile under the white sail of a felucca. The entry tickets for the sites the day visits are in the price, and the vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'Four sites in one private day',
            'The Step Pyramid and the tombs of the necropolis',
            'Lunch included at a local restaurant',
            'An hour on the Nile under sail',
          ],
          seo: {
            metaTitle: 'Four Sites Privately, with Lunch and a Felucca Hour',
            metaDescription: 'A private day at the Giza plateau, Memphis, the Saqqara necropolis and Dahshur, with lunch, an hour under sail and hotel pickup.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'Two Private Days: the Plateau, Saqqara and Two Museums',
          short: 'Day one at Giza, Saqqara and Memphis; day two in the Egyptian Museum and the Museum of Egyptian Civilization.',
          description: 'The first day runs from the plateau to the old capital: the pyramids of Giza, the Valley Temple and the Great Sphinx, then the Step Pyramid of Djoser at Saqqara, then Memphis, its colossal statue of Ramses II and the alabaster sphinx beside it. The programme names the Step Pyramid and the necropolis, not the Pyramid of Unas; this day makes no stop there.\n\nThe second day is given to two museums: the Egyptian Museum on Tahrir Square, then the Museum of Egyptian Civilization with its hall of royal mummies. Your own guide and vehicle on both days, the entry fees, and lunch on each.',
          highlights: [
            'The plateau, the Valley Temple and the Sphinx',
            'The Step Pyramid of Djoser at Saqqara',
            'Memphis and the alabaster sphinx',
            'Two museums and the royal mummies on day two',
          ],
          seo: {
            metaTitle: 'Two Private Days: the Plateau, Saqqara, Two Museums',
            metaDescription: 'Two private days: the Giza plateau, Saqqara and Memphis, then the Egyptian Museum and the Museum of Egyptian Civilization, with hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
      ],
    },
    {
      slug: 'pyramid-of-userkaf',
      name: 'Pyramid of Userkaf',
      listingPath: '/trips',
      domain: 'pyramidofuserkaf.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'puk-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      tagline: 'Guided days at the corner of the enclosure',
      description: `Userkaf was the first king of the Fifth Dynasty, and his pyramid stands at North Saqqara, at the north-east corner of the Step Pyramid’s enclosure. Much of its outer stone has gone and it stands as a rough mound, and he also built the first sun temple, at Abusir.\n\nEvery day sold here stops at Saqqara, and their published programmes name the Step Pyramid and the necropolis rather than the Pyramid of Userkaf, which is not a stop on any of them. ${WHERE_THEY_GO} ${CLOSING}`,
      seo: {
        metaTitle: 'Pyramid of Userkaf: Saqqara and Memphis Day Trips',
        metaDescription: 'Guided days at the Saqqara necropolis and the Step Pyramid, with Memphis, Dahshur or the Giza plateau, and hotel pickup in Cairo or Giza.',
        keywords: ['pyramid of userkaf saqqara day trip', 'first king fifth dynasty saqqara', 'saqqara and memphis day trip', 'step pyramid enclosure guided day', 'saqqara day trip with pickup'],
      },
      theme: { primaryColor: '#232323', secondaryColor: '#F4ECDB', accentColor: '#C88A3A' },
      heroImages: [PHOTO.stepPyramidAtDusk, PHOTO.feluccasAtCairo, PHOTO.stepPyramid],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/pyramid-of-userkaf/monogram.png',
      trips: [
        {
          path: 'sakkara-memphis-and-dahshur-shared',
          price: P.SOUTH_SHARED,
          title: 'Saqqara, Memphis and Dahshur, Shared and with Tickets',
          short: 'A shared day with an English-speaking guide and the entry tickets for Dahshur, Saqqara and Memphis.',
          description: 'Everything this day visits is in its price: the Bent and the Red Pyramids at Dahshur, the Step Pyramid and the tombs around it at Saqqara, and the ruins of Memphis with the fallen colossus of Ramses II. The programme names the Step Pyramid and the necropolis, not the Pyramid of Userkaf; this day makes no stop there.\n\nThe vehicle is air-conditioned and shared with other guests, and the guide speaks English. Pickup from your hotel in Cairo or Giza is included, the day leaves at eleven, and lunch is not part of this price.',
          highlights: [
            'The entry tickets for every site the day visits',
            'The Bent and Red Pyramids at Dahshur',
            'The Step Pyramid and the tombs around it',
            'Memphis and its fallen colossus',
          ],
          seo: {
            metaTitle: 'Shared Day with Tickets: Saqqara, Memphis, Dahshur',
            metaDescription: 'A shared guided day at Dahshur, the Saqqara necropolis and Memphis, with the entry tickets for every site and hotel pickup.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-sakkara-memphis-and-dahshur',
          price: P.SOUTH_PRIVATE,
          title: 'Your Own Guide at Saqqara, Memphis and Dahshur',
          short: 'A private guide and vehicle for the three places south of Giza, from eight in the morning, with the entry tickets.',
          description: 'A guide of your own makes a difference in the necropolis, where the interesting part is which tomb belongs to whom and why they stand where they do. The day starts at eight, takes the Step Pyramid enclosure and the tombs around it, then Memphis, then Dahshur. The programme names the Step Pyramid and the necropolis, not the Pyramid of Userkaf; this day makes no stop there.\n\nThe guide can be asked for in another language, the entry tickets for the sites the day visits are in the price, and your own air-conditioned vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'A guide of your own through the necropolis',
            'The Step Pyramid enclosure and the tombs around it',
            'Memphis and the Dahshur pyramids',
            'An eight o’clock start and the entry tickets',
          ],
          seo: {
            metaTitle: 'Private Guide at Saqqara, Memphis and Dahshur',
            metaDescription: 'A private guided day at the Saqqara necropolis, Memphis and Dahshur from eight in the morning, with the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'giza-pyramids-sakkara-and-memphis',
          price: P.GIZA_SOUTH,
          title: 'Giza, Saqqara and Memphis, in That Order',
          short: 'The plateau first, the Step Pyramid next and the old capital last, shared or private, with the entry tickets.',
          description: 'The order is the point of this one. The plateau comes first, while the morning light is still on the pyramids and the Great Sphinx; Saqqara and the Step Pyramid come next; and Memphis, the capital they were built for, comes last. The programme names the Step Pyramid and the necropolis, not the Pyramid of Userkaf; this day makes no stop there.\n\nYou can take it in a shared group, or privately with your own guide and vehicle, also offered in Italian or Spanish. The entry tickets for the sites the day visits are in the price, and pickup from your hotel in Cairo or Giza is included.',
          highlights: [
            'The plateau in the morning light',
            'The Step Pyramid at Saqqara',
            'Memphis last, the capital they were built for',
            'Shared or private, with the entry tickets',
          ],
          seo: {
            metaTitle: 'Giza First, Then Saqqara and Memphis, in One Day',
            metaDescription: 'A guided day taking the Giza plateau first, then the Saqqara necropolis and Memphis, shared or private, with the entry tickets and pickup.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'The Full Private Day: Giza, Saqqara, Memphis, Dahshur',
          short: 'Every site these days reach, in one private day, with lunch and an hour on the Nile under sail.',
          description: 'This is the one that leaves nothing out. Your own guide and vehicle take the Giza plateau, the ruins of Memphis, the Step Pyramid and the tombs of the necropolis at Saqqara, and the Bent and Red Pyramids at Dahshur, with lunch at a local restaurant in the middle of it. The programme names the Step Pyramid and the necropolis, not the Pyramid of Userkaf; this day makes no stop there.\n\nAn hour under the white sail of a felucca closes the day on the river. The entry tickets for the sites the day visits are in the price, and the vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'Every site these days reach, in one day',
            'Your own guide and vehicle throughout',
            'Lunch at a local restaurant',
            'An hour on the Nile under sail',
          ],
          seo: {
            metaTitle: 'The Full Private Day: Giza to Dahshur, with a Sail',
            metaDescription: 'A private day taking in the Giza plateau, Memphis, the Saqqara necropolis and Dahshur, with lunch, a felucca sail and hotel pickup.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'Two Private Days: Giza, Saqqara, Memphis and the Museums',
          short: 'Day one on the plateau, at Saqqara and at Memphis; day two in the two great museums of Cairo.',
          description: 'Two days, and the second explains the first. Day one is the plateau, the Valley Temple and the Great Sphinx, the Step Pyramid of Djoser at Saqqara, and Memphis with its colossal statue of Ramses II and the alabaster sphinx. The programme names the Step Pyramid and the necropolis, not the Pyramid of Userkaf; this day makes no stop there.\n\nDay two is the Egyptian Museum on Tahrir Square and then the Museum of Egyptian Civilization, where the royal mummies have a hall of their own. Your own guide and vehicle on both days, the entry fees, and lunch on each.',
          highlights: [
            'The plateau, the Valley Temple and the Great Sphinx',
            'The Step Pyramid of Djoser at Saqqara',
            'Memphis, its colossus and the alabaster sphinx',
            'Two museums and the royal mummies on day two',
          ],
          seo: {
            metaTitle: 'Two Private Days: Giza, Saqqara and Two Museums',
            metaDescription: 'Two private days: the Giza plateau, Saqqara and Memphis, then the Egyptian Museum and the Museum of Egyptian Civilization, with hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
      ],
    },
    {
      slug: 'tomb-of-nefer',
      name: 'Tomb of Nefer',
      listingPath: '/trips',
      domain: 'tombofnefer.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'ton-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      tagline: 'Guided days in the necropolis of the painted walls',
      description: `The Tomb of Nefer is a Fifth Dynasty tomb at Saqqara, near the causeway of Unas. Its walls keep their painted colour: scenes of daily life laid out in registers, one band above another.\n\nEvery day sold here stops at Saqqara, and their published programmes name the Step Pyramid and the necropolis rather than the Tomb of Nefer, which is not a stop on any of them. ${WHERE_THEY_GO} ${CLOSING}`,
      seo: {
        metaTitle: 'Tomb of Nefer: Days in the Saqqara Necropolis',
        metaDescription: 'Guided days at the Saqqara necropolis and its Step Pyramid, with Memphis, Dahshur or the Giza plateau, and hotel pickup in Cairo or Giza.',
        keywords: ['tomb of nefer saqqara day trip', 'painted tombs saqqara necropolis', 'saqqara day trip from cairo', 'saqqara memphis dahshur guided day', 'saqqara necropolis tour with pickup'],
      },
      theme: { primaryColor: '#A8452E', secondaryColor: '#F7F2E8', accentColor: '#3C8D5A' },
      heroImages: [PHOTO.feluccasAtCairo, PHOTO.stepPyramid, PHOTO.stepPyramidAtDusk],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/tomb-of-nefer/monogram.png',
      trips: [
        {
          path: 'sakkara-memphis-and-dahshur-shared',
          price: P.SOUTH_SHARED,
          title: 'The Shared Run South: Saqqara, Memphis and Dahshur',
          short: 'A shared day with a guide and the entry tickets, out to Dahshur and back through Saqqara and Memphis.',
          description: 'A straight run south and back: Dahshur for the Bent and the Red Pyramids, Saqqara for the Step Pyramid and the tombs cut around it, Memphis for the ruins of the capital and its fallen colossus of Ramses II. The programme names the Step Pyramid and the necropolis, not the Tomb of Nefer; this day makes no stop there.\n\nThe vehicle is air-conditioned and shared with other guests, the guide speaks English, and the entry tickets for the sites the day visits are in the price. Pickup from your hotel in Cairo or Giza is included, and the day leaves at eleven.',
          highlights: [
            'Dahshur, Saqqara and Memphis in one run',
            'The Bent and Red Pyramids',
            'The Step Pyramid and the tombs around it',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'The Shared Run South: Saqqara, Memphis, Dahshur',
            metaDescription: 'A shared guided day out to Dahshur and back through the Saqqara necropolis and Memphis, with the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-sakkara-memphis-and-dahshur',
          price: P.SOUTH_PRIVATE,
          title: 'The Private Day South: Saqqara, Memphis and Dahshur',
          short: 'Your own guide and vehicle for the three places south of Giza, leaving at eight, with the entry tickets.',
          description: 'The private version of the same road, with an eight o’clock start that reaches the necropolis before the groups do. Your own guide takes the Step Pyramid enclosure and the mastaba tombs around it, then the ruins of Memphis, then the Bent and the Red Pyramids at Dahshur. The programme names the Step Pyramid and the necropolis, not the Tomb of Nefer; this day makes no stop there.\n\nThe guide can be asked for in another language, the entry tickets for the sites the day visits are in the price, and your own vehicle collects you from your hotel in Cairo or Giza and brings you back.',
          highlights: [
            'An eight o’clock start, ahead of the groups',
            'Your own guide and vehicle',
            'The Step Pyramid enclosure and the mastaba tombs',
            'Memphis, Dahshur and the entry tickets',
          ],
          seo: {
            metaTitle: 'The Private Day South: Saqqara, Memphis, Dahshur',
            metaDescription: 'A private day leaving at eight for the Saqqara necropolis, Memphis and Dahshur, with your own guide, the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'giza-pyramids-sakkara-and-memphis',
          price: P.GIZA_SOUTH,
          title: 'The Pyramids of Giza, Saqqara and Memphis Together',
          short: 'The plateau, the necropolis and the old capital in one day, shared or private, with the entry tickets.',
          description: 'Three places that belong together, in the order the history runs: the pyramids of Giza and the Great Sphinx, the Step Pyramid at Saqqara that came before them, and Memphis, the capital both necropolises served. The programme names the Step Pyramid and the necropolis, not the Tomb of Nefer; this day makes no stop there.\n\nThe day is sold as a shared group in English, as a private day with your own guide and vehicle, and as a private day in Italian or Spanish. The entry tickets for the sites the day visits are in the price, and pickup from your hotel in Cairo or Giza is included.',
          highlights: [
            'The pyramids of Giza and the Great Sphinx',
            'The Step Pyramid that came before them',
            'Memphis, the capital they served',
            'Shared or private, with the entry tickets',
          ],
          seo: {
            metaTitle: 'Giza, Saqqara and Memphis Together in One Day',
            metaDescription: 'A guided day taking the pyramids of Giza, the Saqqara necropolis and Memphis together, shared or private, with the entry tickets and pickup.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'Lunch, Four Sites and a Felucca: the Private Day',
          short: 'Four sites with your own guide, lunch at a local restaurant, and an hour on the Nile to finish.',
          description: 'Four sites with lunch in the middle and the river at the end. Your own guide and vehicle take the Giza plateau, then Memphis and its colossus, then Saqqara for the Step Pyramid and the tombs around it, then the Bent and Red Pyramids at Dahshur. The programme names the Step Pyramid and the necropolis, not the Tomb of Nefer; this day makes no stop there.\n\nLunch at a local restaurant is in the price, and so is an hour on the Nile under the white sail of a felucca. The entry tickets for the sites the day visits are included, and the vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'Four sites in one private day',
            'Lunch at a local restaurant included',
            'The Step Pyramid and the tombs of the necropolis',
            'An hour on the Nile under sail',
          ],
          seo: {
            metaTitle: 'Private Day: Four Sites, Lunch and a Felucca Hour',
            metaDescription: 'A private day across the Giza plateau, Memphis, the Saqqara necropolis and Dahshur, with lunch, a felucca sail and hotel pickup.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'Two Private Days: Saqqara, Memphis and the Cairo Museums',
          short: 'Day one at the plateau, Saqqara and Memphis; day two at the Egyptian Museum and the Museum of Egyptian Civilization.',
          description: 'The first day goes out to the desert: the pyramids of Giza, the Valley Temple, the Great Sphinx, the Step Pyramid of Djoser at Saqqara, and Memphis with its colossal statue of Ramses II and the alabaster sphinx beside it. The programme names the Step Pyramid and the necropolis, not the Tomb of Nefer; this day makes no stop there.\n\nThe second day stays in the city, in the Egyptian Museum on Tahrir Square and then the Museum of Egyptian Civilization with its hall of royal mummies. Your own guide and vehicle on both days, the entry fees, and lunch on each.',
          highlights: [
            'The plateau, the Valley Temple and the Sphinx',
            'The Step Pyramid of Djoser at Saqqara',
            'Memphis, its colossus and the alabaster sphinx',
            'The Cairo museums and the royal mummies',
          ],
          seo: {
            metaTitle: 'Two Private Days: Saqqara, Memphis, Cairo Museums',
            metaDescription: 'Two private days: the Giza plateau, Saqqara and Memphis, then the Egyptian Museum and the Museum of Egyptian Civilization, with hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
      ],
    },
    {
      slug: 'buried-pyramid',
      name: 'Buried Pyramid',
      listingPath: '/trips',
      domain: 'buriedpyramid.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'bpy-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      tagline: 'Guided days over the sand at Saqqara',
      description: `The Buried Pyramid is the unfinished step pyramid of Sekhemkhet, the king who followed Djoser in the Third Dynasty. It lies south-west of the Step Pyramid’s enclosure at Saqqara and was covered by sand until it was excavated in the twentieth century, and an alabaster sarcophagus found sealed inside it was empty.\n\nEvery day sold here stops at Saqqara, and their published programmes name the Step Pyramid and the necropolis rather than the Buried Pyramid, which is not a stop on any of them. ${WHERE_THEY_GO} ${CLOSING}`,
      seo: {
        metaTitle: 'Buried Pyramid: Saqqara Day Trips from Cairo',
        metaDescription: 'Guided days at the Saqqara necropolis and its Step Pyramid, with Memphis, Dahshur or the Giza plateau, and hotel pickup in Cairo or Giza.',
        keywords: ['buried pyramid saqqara day trip', 'sekhemkhet unfinished step pyramid', 'saqqara day trip from cairo', 'saqqara and dahshur guided day', 'saqqara necropolis with hotel pickup'],
      },
      theme: { primaryColor: '#3A2E22', secondaryColor: '#FBF7EE', accentColor: '#C2412D' },
      heroImages: [PHOTO.stepPyramid, PHOTO.feluccasAtCairo, PHOTO.stepPyramidAtDusk],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/buried-pyramid/monogram.png',
      trips: [
        {
          path: 'sakkara-memphis-and-dahshur-shared',
          price: P.SOUTH_SHARED,
          title: 'Shared Day on the Saqqara Sand, with Memphis and Dahshur',
          short: 'A shared day with a guide and the entry tickets: Dahshur, the sand of the necropolis and the ruins of Memphis.',
          description: 'The necropolis is a field of sand with stone standing out of it, and this shared day crosses three parts of that country: Dahshur, with the Bent and the Red Pyramids; Saqqara, with the Step Pyramid and the tombs around it; and Memphis, where the colossus of Ramses II lies among the ruins. The programme names the Step Pyramid and the necropolis, not the Buried Pyramid; this day makes no stop there.\n\nThe vehicle is air-conditioned and shared with other guests, the guide speaks English, and the entry tickets for the sites the day visits are in the price. Pickup from your hotel in Cairo or Giza is included, and the day leaves at eleven.',
          highlights: [
            'Three parts of the necropolis in one day',
            'The Bent and Red Pyramids at Dahshur',
            'The Step Pyramid and the tombs around it',
            'Entry tickets and hotel pickup included',
          ],
          seo: {
            metaTitle: 'Shared Day on the Saqqara Sand, Memphis, Dahshur',
            metaDescription: 'A shared guided day across the Saqqara necropolis, Memphis and Dahshur, with the entry tickets and hotel pickup in Cairo or Giza.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-sakkara-memphis-and-dahshur',
          price: P.SOUTH_PRIVATE,
          title: 'Saqqara, Memphis and Dahshur on a Private Early Start',
          short: 'Your own guide and vehicle from eight in the morning, for the necropolis, Memphis and the Dahshur pyramids.',
          description: 'Eight in the morning is the quiet hour on this sand: the light is low, the groups have not arrived, and your own guide can take the Step Pyramid enclosure and the mastaba tombs around it at walking pace before the day moves on to Memphis and Dahshur. The programme names the Step Pyramid and the necropolis, not the Buried Pyramid; this day makes no stop there.\n\nThe guide can be asked for in another language, the entry tickets for the sites the day visits are in the price, and your own air-conditioned vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'Low morning light on the necropolis',
            'Your own guide and air-conditioned vehicle',
            'The Step Pyramid enclosure and the mastaba tombs',
            'Memphis, Dahshur and the entry tickets',
          ],
          seo: {
            metaTitle: 'Private Early Start: Saqqara, Memphis and Dahshur',
            metaDescription: 'A private day from eight in the morning across the Saqqara necropolis, Memphis and Dahshur, with the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'giza-pyramids-sakkara-and-memphis',
          price: P.GIZA_SOUTH,
          title: 'Giza, the Saqqara Sand and Memphis in One Day',
          short: 'The plateau, then the sand at Saqqara, then the old capital, shared or private, with the entry tickets.',
          description: 'The day starts on hard rock and ends on sand. First the Giza plateau with its pyramids and the Great Sphinx, then the drive south to Saqqara and the Step Pyramid, then Memphis and the ruins of the capital. The programme names the Step Pyramid and the necropolis, not the Buried Pyramid; this day makes no stop there.\n\nIt is sold as a shared group in English, as a private day with your own guide and vehicle, and as a private day in Italian or Spanish. The entry tickets for the sites the day visits are in the price, and pickup from your hotel in Cairo or Giza is included.',
          highlights: [
            'The Giza plateau and the Great Sphinx',
            'The drive south to Saqqara',
            'The Step Pyramid and the ruins of Memphis',
            'Shared or private, with the entry tickets',
          ],
          seo: {
            metaTitle: 'Giza, the Saqqara Sand and Memphis in a Single Day',
            metaDescription: 'A guided day from the Giza plateau to the Saqqara necropolis and Memphis, shared or private, with the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'The Whole Private Day, from Giza to Dahshur, with a Sail',
          short: 'The four sites in one private day, with lunch at a local restaurant and an hour under sail.',
          description: 'The whole of it, in one private day: the Giza plateau, the ruins of Memphis with its colossus, the Step Pyramid and the tombs of the necropolis at Saqqara, and the Bent and Red Pyramids out at Dahshur, with lunch at a local restaurant on the way. The programme names the Step Pyramid and the necropolis, not the Buried Pyramid; this day makes no stop there.\n\nThe river closes it: an hour under the white sail of a felucca. The entry tickets for the sites the day visits are in the price, and the vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'The plateau, Memphis, Saqqara and Dahshur',
            'Your own guide and vehicle all day',
            'Lunch at a local restaurant',
            'An hour on the river under sail',
          ],
          seo: {
            metaTitle: 'The Whole Private Day, Giza to Dahshur, with a Sail',
            metaDescription: 'A private day from the Giza plateau through Memphis and the Saqqara necropolis to Dahshur, with lunch, a felucca sail and hotel pickup.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'Two Private Days: the Sand at Saqqara, then the Museums',
          short: 'Day one out on the sand at Giza, Saqqara and Memphis; day two in the two museums of Cairo.',
          description: 'Day one is out on the sand: the pyramids of Giza, the Valley Temple and the Great Sphinx, then the Step Pyramid of Djoser at Saqqara, then Memphis, its colossal statue of Ramses II and the alabaster sphinx beside it. The programme names the Step Pyramid and the necropolis, not the Buried Pyramid; this day makes no stop there.\n\nDay two is where the finds ended up: the Egyptian Museum on Tahrir Square, and the Museum of Egyptian Civilization with its hall of royal mummies. Your own guide and vehicle on both days, the entry fees, and lunch on each.',
          highlights: [
            'The plateau, the Valley Temple and the Sphinx',
            'The Step Pyramid of Djoser at Saqqara',
            'Memphis, its colossus and the alabaster sphinx',
            'Where the finds ended up, on day two',
          ],
          seo: {
            metaTitle: 'Two Private Days: the Saqqara Sand and the Museums',
            metaDescription: 'Two private days: the Giza plateau, Saqqara and Memphis, then the Egyptian Museum and the Museum of Egyptian Civilization, with hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
      ],
    },
    {
      slug: 'pyramid-of-pepi-ii',
      name: 'Pyramid of Pepi II',
      listingPath: '/trips',
      domain: 'pyramidofpepii.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'pp2-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      tagline: 'Guided days that take in Saqqara and Dahshur',
      description: `Pepi II was a king of the Sixth Dynasty, and his reign is counted among the longest in Egyptian history. His pyramid stands at South Saqqara, and its burial chamber carries Pyramid Texts.\n\nEvery day sold here stops at both Saqqara and Dahshur, and the road between them passes South Saqqara. None of their published programmes names South Saqqara or this pyramid, which is not a stop on any of them. Two of the three are the shared and the private day to Dahshur, Saqqara and Memphis; the third is the long private day that adds the Giza plateau, lunch and a sail on the Nile. ${CLOSING}`,
      seo: {
        metaTitle: 'Pyramid of Pepi II: Saqqara and Dahshur Day Trips',
        metaDescription: 'Guided days that stop at both Saqqara and Dahshur, with Memphis and the Giza plateau, and hotel pickup in Cairo or Giza.',
        keywords: ['pyramid of pepi ii south saqqara', 'saqqara and dahshur day trip from cairo', 'sixth dynasty pyramid texts', 'memphis saqqara dahshur guided day', 'saqqara dahshur tour with pickup'],
      },
      theme: { primaryColor: '#23201C', secondaryColor: '#F3EAD3', accentColor: '#2B5F7C' },
      heroImages: [PHOTO.stepPyramidAtDusk, PHOTO.stepPyramid, PHOTO.feluccasAtCairo],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/pyramid-of-pepi-ii/monogram.png',
      trips: [
        {
          path: 'sakkara-memphis-and-dahshur-shared',
          price: P.SOUTH_SHARED,
          title: 'Saqqara and Dahshur with Memphis Between, in a Shared Group',
          short: 'A shared day with a guide and the entry tickets, reaching both Dahshur and Saqqara with Memphis on the way.',
          description: 'This is one of the days that reaches both ends of the burial ground. It opens at Dahshur with the Bent and the Red Pyramids, comes back up to Saqqara for the Step Pyramid and the tombs around it, and stops at Memphis and its fallen colossus of Ramses II in between. The programme names Saqqara, Memphis and Dahshur, not South Saqqara; this day makes no stop there.\n\nThe vehicle is air-conditioned and shared with other guests, the guide speaks English, and the entry tickets for the sites the day visits are in the price. Pickup from your hotel in Cairo or Giza is included, and the day leaves at eleven.',
          highlights: [
            'Both ends of the burial ground in one day',
            'The Bent and Red Pyramids at Dahshur',
            'The Step Pyramid and the tombs around it',
            'Memphis, the entry tickets and hotel pickup',
          ],
          seo: {
            metaTitle: 'Shared Day Reaching Both Saqqara and Dahshur',
            metaDescription: 'A shared guided day that reaches both the Saqqara necropolis and Dahshur, with Memphis between them, the entry tickets and hotel pickup.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-sakkara-memphis-and-dahshur',
          price: P.SOUTH_PRIVATE,
          title: 'A Private Day Between Saqqara and Dahshur, by way of Memphis',
          short: 'Your own guide and vehicle for both Saqqara and Dahshur, leaving at eight, with Memphis in between.',
          description: 'A private vehicle makes the road between the two ends of the necropolis your own, and an eight o’clock start leaves time at each. Dahshur for the Bent and the Red Pyramids, Saqqara for the Step Pyramid enclosure and the mastaba tombs around it, Memphis for the ruins of the capital. The programme names Saqqara, Memphis and Dahshur, not South Saqqara; this day makes no stop there.\n\nThe guide can be asked for in another language, the entry tickets for the sites the day visits are in the price, and your own vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'Both Saqqara and Dahshur, privately',
            'An eight o’clock start with time at each',
            'The Step Pyramid enclosure and the mastaba tombs',
            'Memphis, the entry tickets and hotel pickup',
          ],
          seo: {
            metaTitle: 'Private Day Between Saqqara and Dahshur, via Memphis',
            metaDescription: 'A private day reaching both the Saqqara necropolis and Dahshur, with Memphis between them, your own guide and hotel pickup.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'Saqqara and Dahshur Privately, with Lunch and a Nile Sail',
          short: 'The longest of the three: the Giza plateau, Memphis, Saqqara and Dahshur, with lunch and an hour under sail.',
          description: 'The longest of the three days sold here, and the only one that starts on the Giza plateau. Your own guide and vehicle take the pyramids and the Great Sphinx, then Memphis, then Saqqara for the Step Pyramid and the tombs around it, then the Bent and Red Pyramids at Dahshur, with lunch at a local restaurant. The programme names the Giza plateau, Saqqara, Memphis and Dahshur, not South Saqqara; this day makes no stop there.\n\nAn hour on the Nile under the white sail of a felucca closes it. The entry tickets for the sites the day visits are in the price, and the vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'The only one of the three that starts at Giza',
            'Both Saqqara and Dahshur with your own guide',
            'Lunch at a local restaurant',
            'An hour on the Nile under sail',
          ],
          seo: {
            metaTitle: 'Private Saqqara and Dahshur Day with a Nile Sail',
            metaDescription: 'A private day at the Giza plateau, Memphis, the Saqqara necropolis and Dahshur, with lunch, an hour under sail and hotel pickup.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
      ],
    },
    {
      slug: 'pyramid-of-sahure',
      name: 'Pyramid of Sahure',
      listingPath: '/trips',
      domain: 'pyramidofsahure.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'psa-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      tagline: 'Guided days down the road from Giza to Saqqara',
      description: `Sahure was the second king of the Fifth Dynasty, and his pyramid stands at Abusir, a few kilometres north of Saqqara. Reliefs from his temple show seagoing ships, and the temple itself had columns of red granite carved as palms and a court paved with black basalt.\n\nEvery day sold here drives from the Giza plateau down to Saqqara, and the road between them passes Abusir. None of their published programmes names Abusir or this pyramid, which is not a stop on any of them. Two of the three are single days and the third runs over two, ending in the museums of Cairo. ${CLOSING}`,
      seo: {
        metaTitle: 'Pyramid of Sahure: Giza to Saqqara Day Trips',
        metaDescription: 'Guided days that drive from the Giza plateau down to the Saqqara necropolis and Memphis, with hotel pickup in Cairo or Giza.',
        keywords: ['pyramid of sahure abusir', 'giza to saqqara day trip from cairo', 'fifth dynasty abusir pyramids', 'giza saqqara and memphis guided day', 'saqqara day trip with hotel pickup'],
      },
      theme: { primaryColor: '#1F2226', secondaryColor: '#EEE7DA', accentColor: '#9C4532' },
      heroImages: [PHOTO.feluccasAtCairo, PHOTO.stepPyramidAtDusk, PHOTO.stepPyramid],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/pyramid-of-sahure/monogram.png',
      trips: [
        {
          path: 'giza-pyramids-sakkara-and-memphis',
          price: P.GIZA_SOUTH,
          title: 'The Road South: the Giza Pyramids, Saqqara and Memphis',
          short: 'The drive from the plateau down to the necropolis and the old capital, shared or private, with the entry tickets.',
          description: 'The day is built around the drive. It starts on the Giza plateau with the pyramids and the Great Sphinx, takes the road south along the edge of the cultivation to Saqqara and the Step Pyramid, and ends at Memphis among the ruins of the capital. The programme names the Giza plateau, Saqqara and Memphis, not Abusir; this day makes no stop there.\n\nThere is a shared group in English, a private day with your own guide and vehicle, and a private day in Italian or Spanish. The entry tickets for the sites the day visits are in the price, and pickup from your hotel in Cairo or Giza is included.',
          highlights: [
            'The drive from the plateau down to Saqqara',
            'The pyramids of Giza and the Great Sphinx',
            'The Step Pyramid at Saqqara',
            'Memphis, the entry tickets and hotel pickup',
          ],
          seo: {
            metaTitle: 'The Road South: Giza Pyramids, Saqqara, Memphis',
            metaDescription: 'A guided day down the road from the Giza plateau to the Saqqara necropolis and Memphis, shared or private, with the entry tickets.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'From the Plateau to Dahshur, with Lunch and a Nile Sail',
          short: 'A private day that follows the whole road: the plateau, Memphis, Saqqara and Dahshur, with lunch and a felucca.',
          description: 'This one follows the road to its far end. Your own guide and vehicle take the Giza plateau, then Memphis and its colossus, then Saqqara for the Step Pyramid and the tombs around it, then the Bent and Red Pyramids at Dahshur, with lunch at a local restaurant on the way. The programme names the Giza plateau, Saqqara, Memphis and Dahshur, not Abusir; this day makes no stop there.\n\nThe last hour is spent on the Nile under the white sail of a felucca. The entry tickets for the sites the day visits are in the price, and the vehicle collects you from your hotel in Cairo or Giza.',
          highlights: [
            'The whole road, from the plateau to Dahshur',
            'Your own guide and vehicle all day',
            'Lunch at a local restaurant',
            'An hour on the Nile under sail',
          ],
          seo: {
            metaTitle: 'Private Day from the Plateau to Dahshur, with a Sail',
            metaDescription: 'A private day following the road from the Giza plateau through Memphis and Saqqara to Dahshur, with lunch, a felucca sail and pickup.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'Two Private Days: the Giza Road to Saqqara, then the Museums',
          short: 'Day one takes the road from the plateau to Saqqara and Memphis; day two is spent in the museums of Cairo.',
          description: 'Day one is the road: the pyramids of Giza, the Valley Temple and the Great Sphinx, then south to the Step Pyramid of Djoser at Saqqara, then Memphis with its colossal statue of Ramses II and the alabaster sphinx beside it. The programme names the Giza plateau, Saqqara and Memphis, not Abusir; this day makes no stop there.\n\nDay two is spent in the museums, first the Egyptian Museum on Tahrir Square and then the Museum of Egyptian Civilization with its hall of royal mummies. Your own guide and vehicle on both days, the entry fees, and lunch on each.',
          highlights: [
            'The road from the plateau to Saqqara on day one',
            'The Step Pyramid of Djoser at Saqqara',
            'Memphis, its colossus and the alabaster sphinx',
            'Two museums and the royal mummies on day two',
          ],
          seo: {
            metaTitle: 'Two Private Days: the Giza Road, Saqqara, Museums',
            metaDescription: 'Two private days: the road from the Giza plateau to Saqqara and Memphis, then the Egyptian Museum and the Museum of Egyptian Civilization.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
      ],
    },
  ],
};

/** B12B: the mangrove shore inside Ras Mohamed National Park. */
export const B12B: NetworkBatch = {
  id: 'b12b',
  sites: [
    {
      slug: 'mangrove-forest-egypt',
      name: 'Mangrove Forest Egypt',
      listingPath: '/trips',
      domain: 'mangroveforestegypt.com',
      city: 'Sharm El Sheikh',
      area: 'Sharm el-Sheikh',
      pickupDestination: 'sharm-el-sheikh',
      coordinates: SHARM,
      currency: 'USD',
      slugPrefix: 'mfe-',
      foreignPlaces: NOT_RAS_MOHAMED,
      photoShortfall: 'The two trips this site sells publish two photos between them.',
      tagline: 'Two days that stop at the mangrove shore',
      description: `Mangroves grow on parts of Egypt’s Red Sea and Sinai coasts, and the main species is the grey mangrove, Avicennia marina, whose upright breathing roots rise out of the mud. The stand this site is named for lies inside Ras Mohamed National Park, at the southern tip of Sinai, south of Sharm el-Sheikh.\n\nBoth days sold here stop at that shore: their own published schedules name the mangroves, along with the Earthquake Crack, the Magic Lake and Allah’s Gate. One is half a day by shared bus; the other starts before dawn with a quad or buggy ride and goes on to the park by bus. ${CLOSING}`,
      seo: {
        metaTitle: 'Mangrove Forest Egypt: Ras Mohamed Day Trips',
        metaDescription: 'Two guided days from Sharm el-Sheikh that stop at the mangrove shore in Ras Mohamed National Park, with the Magic Lake, the Earthquake Crack and Allah’s Gate.',
        keywords: ['mangrove forest egypt', 'ras mohamed mangrove day trip', 'ras mohamed national park from sharm el-sheikh', 'magic lake and allah gate trip', 'ras mohamed half day bus trip'],
      },
      theme: { primaryColor: '#2F5E3A', secondaryColor: '#F5F3EC', accentColor: '#2C9C9A' },
      heroImages: [PHOTO.allahGate, PHOTO.quadAboveTheSea],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/mangrove-forest-egypt/monogram.png',
      trips: [
        {
          path: 'ras-mohamed-half-day-by-bus',
          price: P.RAS_MOHAMED_BUS,
          title: 'Half a Day to the Mangrove Shore and Allah’s Gate',
          short: 'Four hours by road into the national park: the mangroves, the Earthquake Crack, a swim in the Magic Lake and the stone arch of Allah’s Gate.',
          description: 'A shared bus collects you from your hotel reception at half past nine and drives into Ras Mohamed National Park. A certified snorkelling guide is with the group, and there is a stop where masks and fins can be hired if you want them.\n\nThe mangrove shore is one of the stops the programme names, and the fiddler crabs work the mud between the breathing roots while you walk it. The rest of the park follows: a snorkelling stop over the reefs, the Earthquake Crack, the saltwater lagoon of the Magic Lake for a swim, and Allah’s Gate, the arch of standing stones. You are back at your hotel by the early afternoon. The national park entry fee of ten euros a person is not in the price and is paid on arrival, and snorkelling gear is not included. Children have their own price.',
          highlights: [
            'The mangrove shore and its fiddler crabs',
            'The Earthquake Crack beside the Magic Lake',
            'A swim in the saltwater lagoon',
            'The stone arch of Allah’s Gate',
          ],
          seo: {
            metaTitle: 'Half-Day Bus Trip to the Mangroves and Allah’s Gate',
            metaDescription: 'A four-hour bus trip into Ras Mohamed National Park: the mangrove shore, the Earthquake Crack, a swim in the Magic Lake and Allah’s Gate.',
          },
          images: [PHOTO.allahGate],
          imageAlts: [ALT.allahGate],
        },
        {
          path: 'dawn-quad-ride-and-ras-mohamed',
          price: P.RAS_MOHAMED_ATV,
          title: 'Dawn Ride, then the Mangroves of Ras Mohamed',
          short: 'An eight-hour day that starts in the dark: the desert as the sun comes up, breakfast at your hotel, then the park, the mangroves and Allah Gate.',
          description: 'The first part is the desert. The pickup is at half past four and the ride goes out as the light comes over the mountains, with the quiet of the early morning and a sandboarding stop along the way. You are brought back to your hotel for breakfast and time to freshen up.\n\nAround half past eight a bus takes the group on to Ras Mohamed National Park, and the mangroves are among the stops the programme names, with Allah Gate, the Earthquake Crack and the Magic Lake, panoramic stops along the way, and a swim and a snorkel over the reefs to finish. You can take a quad or a buggy of your own, and the entry to Allah Gate is in both. Lunch and snorkelling gear are not included, so bring your own gear if you want to snorkel. Children have their own price.',
          highlights: [
            'A quad or buggy of your own as the sun comes up',
            'Breakfast at your hotel in between',
            'The mangroves, the Earthquake Crack and the Magic Lake',
            'A swim and a snorkel over the reefs',
          ],
          seo: {
            metaTitle: 'Dawn Ride and the Mangroves of Ras Mohamed',
            metaDescription: 'An eight-hour day: a quad or buggy ride at dawn, breakfast at your hotel, then Ras Mohamed National Park, the mangroves and Allah Gate.',
          },
          images: [PHOTO.quadAboveTheSea],
          imageAlts: [ALT.quadAboveTheSea],
        },
      ],
    },
  ],
};
