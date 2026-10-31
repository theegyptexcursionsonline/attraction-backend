/**
 * Batch B13 (31 October 2026), the seven sites that take the network to 100: four pyramids the client's Cairo
 * days come closest to, and three places on the Red Sea its sea days come closest to. Two groups:
 *
 * - B13A: Pyramid of Neferirkare, Pyramid of Neferefre (both at Abusir), Pyramid of Djedefre (Abu Rawash) and
 *   the Meidum Pyramid.
 * - B13B: Shaab Sabina (the reef in the strait between the two Giftun islands), Ras Disha (the fringing reef
 *   at the northern end of Makadi Bay) and Erg Somaya (the coral tower off Small Giftun).
 *
 * Every trip is built on the record the client publishes on its own main site, read into the dated snapshot
 * (`network-sites/eeo-snapshot.json`); prices, child rates, departures and inclusions are copied from that
 * record at apply time and never typed here.
 *
 * THE "NEAREST DAYS" RULE, as batch B12 set it (coordinator, 31 October). No client day names any of the
 * domains still without a site as a stop, so a site takes the days the client's own records come closest to,
 * and every page says plainly what its programme names and that the programme does not name the site's own
 * place. No page implies a stop the record does not publish. When the client publishes a day that does stop at
 * one of these places, it replaces the trips sold here.
 *
 * What each site may sell, and why:
 * - Abusir lies between the Giza plateau and Saqqara, about three kilometres north of Saqqara, so the Pyramid
 *   of Neferirkare and the Pyramid of Neferefre each sell the three days that drive from the plateau down to
 *   Saqqara — the same three the Pyramid of Sahure sells in batch B12, for the same reason. The two days that
 *   start at Dahshur rather than Giza are held back from both.
 * - Abu Rawash stands about eight kilometres north-west of the plateau, and the client's nearest days are the
 *   ones that stop at the plateau itself, where Djedefre's father Khufu built the Great Pyramid. The Pyramid of
 *   Djedefre sells five of them, chosen cheapest-and-most-distinct-first from the eleven plateau days the Giza
 *   sites of batches B03 and B10 already sell: the half day with an hour on the Nile, the shared morning in the
 *   saddle with breakfast, the private half day on the plateau alone, the private full day that carries on to
 *   the Egyptian Museum and the Khan el-Khalili bazaar, and the private day with a camel ride and lunch.
 *   Why those five and not the others, recorded so a later batch does not re-open it:
 *   · The five are the cheapest distinct shapes the client publishes for a day that stops at the plateau: a
 *     half day with the river, a shared dawn ride, the plateau on its own, the plateau with a Cairo museum and
 *     the bazaar, and the plateau with a camel ride and lunch. Each is a different day, not a different price
 *     for the same day.
 *   · `giza-pyramids-sphinx-egyptian-museum-khan-el-khalili-bazaar-tour` is the one record skipped on price
 *     order: its stops are the plateau, the Egyptian Museum and Khan el-Khalili, which is the day already sold
 *     here from `private-pyramids-egyptian-museum-khan-el-khalili-tour` at a lower published price, so the
 *     cheaper of the two is sold and the dearer left out rather than the same day sold twice.
 *   · The days that go on to the Grand Egyptian Museum, the Museum of Egyptian Civilization, Old Cairo or the
 *     Citadel, and the full day with the Egyptian Museum, are all dearer than the five and are the plateau plus
 *     one more Cairo stop; the two days that reach Saqqara, Memphis or Dahshur belong to the sites of batches
 *     B10 to B12 that stand there; and the three days that start in Sharm el-Sheikh name a town this site does
 *     not serve. All are a question for the client in the build report rather than a trip here.
 * - Meidum lies about forty-five kilometres south of Dahshur, so the Meidum Pyramid sells the three days whose
 *   own programmes stop at Dahshur, where Sneferu built the other two of his three great pyramids: the shared
 *   day, the private day, and the long private day that begins on the Giza plateau and ends with a sail. They
 *   are the three the Pyramid of Pepi II sells in batch B12 and the three the Pyramids of Dahshur site sells,
 *   and the client publishes no fourth day that reaches Dahshur.
 *
 * - The three reefs lie off days the client sells from Hurghada and Makadi Bay, so each takes the sea days its
 *   own water is nearest to: Shaab Sabina the days that sail to Orange Bay on Big Giftun, Erg Somaya the days
 *   that sail to the Giftun islands, and Ras Disha the diving day that works Makadi Bay. The two Giftun reefs
 *   share not one day between them, and no reef site sells a desert day: a reef sells sea days.
 *
 * Every programme this batch sells was already written by an earlier batch (`b03`, `b03-rest`, `b09`, `b10`), so
 * this batch imports them rather than restating them: the same options, departures, renames and schedules, so
 * the network says the same thing about the same trip wherever it is sold. No programme is new here.
 *
 * What the coordinator settled on 31 October, kept here so a later batch does not re-open it:
 * - These four sites sell records that batches B03, B10, B11 and B12 already sell, because the client's days
 *   visit these places' neighbours together. Same-subject sites sharing a record was decided for B10; these
 *   domains are monument names rather than new subjects. The sites differ in their words, their photos and
 *   their design, not in their catalogue. No two sites on the network share a trip title.
 * - The client publishes three distinct photos across the records the two Abusir sites and the Meidum Pyramid
 *   sell, and five across the Djedefre days; every one already opens a site that is live or was written in an
 *   earlier batch. No photo is invented and none is mislabelled, so these sites open on a photo another site
 *   opens on, and the three Saqqara photographs are spread across the three sites that share them rather than
 *   repeated. Accepted for now: every photo here is replaceable the moment the client supplies each site's own,
 *   and nothing but the photo lists and their descriptions change.
 * - The three reefs follow the Hurghada boat site of batch B09 for their town, pickup area and coordinates, and
 *   two of them for its fence as well. Ras Disha keeps the same fence with Makadi Bay and Sahl Hasheesh let
 *   through: its own reef lies at the northern end of that bay below Sahl Hasheesh, and the day it sells
 *   collects in Makadi Bay, where that record collects, so its one trip says so.
 * - Ras Disha sells one day, so its page says "the day sold here" where the other six say "the days": the two
 *   other Makadi Bay days the coordinator listed are held back (below), and nothing else in its sentence moved.
 * - The Pyramid of Djedefre keeps the tighter fence of batch B10's single-pyramid sites rather than B12A's:
 *   not one of its five days goes south of Giza, so Saqqara, Memphis and Dahshur are names this site never
 *   uses either. The two Abusir sites and the Meidum Pyramid keep B12A's fence, because their days do run
 *   between Cairo, Giza, Saqqara, Memphis and Dahshur.
 * - Meidum's vetted facts include the painted geese from the chapel of Itet, whose original hangs in the
 *   Egyptian Museum in Cairo. That is a museum two of this site's three days do not reach, so the fact is left
 *   out of its copy rather than named beside a day that does not go there.
 *
 * Held back, and why (each is a question for the client in the build report):
 * - A day that stops at Abusir, at Abu Rawash or at Meidum. None exists in the client's published list, which
 *   is the whole reason for the "nearest days" rule above. The list of days to ask the client for is in the
 *   build report: an Abusir day, an Abu Rawash day and a Meidum day.
 * - The long packages (`cairo-3-day-tour-pyramids-museums-islamic-cairo-nile-cruise`,
 *   `cairo-4-day-highlights-pyramids-ancient-sites-old-cairo`,
 *   `cairo-nile-cruise-6-day-egypt-highlights-abu-simbel-hot-air-balloon`,
 *   `egypt-in-9-days-cairo-alexandria-nile-cruise-luxor-abu-simbel`): each runs for days across Alexandria,
 *   Aswan, Luxor and Abu Simbel with hotels, a Nile cruise and internal flights. No batch on the network sells
 *   one, and none of these sites can describe such a day without naming places it does not serve. Batches B10,
 *   B11 and B12 held them back for the same reason, and they are the only other records that reach Saqqara and
 *   Dahshur.
 * - `cairo-private-guided-tour-to-your-choice-of-top-attractions` (its Saqqara option) and
 *   `cairo-museum-tour-choose-your-museum-explore-egypt-s-history` (its Memphis Museum option): each record
 *   excludes hotel transfers and sells them as an add-on bound to no booking option, so neither includes the
 *   hotel pickup every network trip promises. Batches B10 to B12 held both back for the same reason.
 * - `sharm-el-sheikh-2-day-cairo-pyramids-gem-luxury-stay`, its second option ("Day 1 Pyramids & GEM + Day 2
 *   Memphis, Saqqara & Old Cairo"): the option's name says Memphis and Saqqara, while its own description says
 *   the second day is three sites chosen from Saqqara, the Citadel, the Hanging Church, the Amr Ibn Al-As
 *   Mosque and the Museum of Civilization, and that its entrance fees are not included. Batches B10 to B12
 *   held it back for the same reason, and its first option never leaves Giza.
 * - `giza-pyramids-sunrise-morning-guided-tour-with-camel-ride-breakfast`, its private option: it leaves at
 *   other times than the shared one, so batch B03 wrote the two as separate programmes, and the Djedefre site
 *   sells the cheaper of them. The private ride is the same day at more than twice the published price.
 * - `safaga-makadi-bay-semi-submarine-snorkeling-adventure` and
 *   `safaga-makadi-bay-royal-seascope-submarine-cruise-with-hotel-pickup`: both are on the client's published
 *   list, read 31 October, but neither is in the dated snapshot this batch builds from, so neither has a record
 *   to copy prices, options and departures from. Ras Disha would have sold three days rather than one. Reading
 *   the two records into the shared snapshot is a question for the coordinator; nothing here types a price.
 *   Both also pair Safaga with Makadi Bay, which a reef at the northern end of that bay does not serve.
 * - `hurghada-orange-bay-snorkeling-diving-cruise-with-massage`: the client publishes a price where the day's
 *   length should be, so the record carries no duration to copy and nothing here invents one. Shaab Sabina
 *   would have sold four days rather than three. The record is otherwise complete, so this is one field for
 *   the client to correct.
 * - `orange-island-premium-cruise-from-hurghada-with-lunch-transfer`: its own record names Orange Bay and the
 *   Orange Island entry fee, and no Giftun island, so it does not carry the Giftun tower's page. It is not
 *   moved to Shaab Sabina either, because the two Giftun reefs share no day. Erg Somaya would have sold four.
 *
 * Photos are the ones each record publishes, already on the network's Cloudinary; the seven sea photographs are
 * the ones batch B09 chose for the same records, with that batch's own descriptions. Ras Disha sells one day,
 * which publishes one photo, so it says why it opens on one rather than three. Copying them into a network-b13
 * folder, each site's own photos and the seven logos are open questions: `--apply` refuses to run without
 * `--logos=<file>` naming every site's approved logo, logoDark and favicon, for all seven sites.
 */
import type { NetworkBatch, PriceSpec } from '../seed-network-sites';
import { PROGRAMMES as B03 } from './b03';
import { PROGRAMMES as B03R } from './b03-rest';
import { PROGRAMMES_A as B09A } from './b09';
import { NEW_PROGRAMMES as B10N } from './b10';

/** Every programme this batch sells. All ten were written by the batch that first sold the record. */
const P = {
  SOUTH_SHARED: B03.MAS_SHARED,
  SOUTH_PRIVATE: B03.MAS_PRIVATE,
  GIZA_SOUTH: B03.MAS_WITH_GIZA,
  GIZA_SOUTH_VIP: B03.MAS_NILE_SAIL,
  TWO_DAY_PRIVATE: B10N.TWO_DAY_PRIVATE,
  FELUCCA: B03.GPP_FELUCCA,
  SUNRISE_SHARED: B03R.PCT_SHARED_SUNRISE,
  HALF_DAY: B03.GPP_HALF_DAY,
  BAZAAR_PRIVATE: B03.PGE_BAZAAR,
  CAMEL_LUNCH: B03R.PCT_CAMEL_LUNCH,
  ORANGE_MASSAGE: B09A.HBT_ORANGE_MASSAGE,
  ORANGE_DIVE: B09A.HBT_ORANGE_DIVE,
  ORANGE_YACHT: B09A.HBT_ORANGE_YACHT,
  MAKADI_DIVES: B09A.D2E_MAKADI_DIVES,
  THREE_ISLANDS: B09A.HBT_THREE_ISLANDS,
  SIX_ISLANDS: B09A.HBT_SIX_ISLANDS,
  INTRO_DIVE_YACHT: B09A.HBT_INTRO_DIVE_YACHT,
} satisfies Record<string, PriceSpec>;

/**
 * Each record's own photo, as the client publishes it. The three Saqqara photographs are the ones batches B10
 * to B12 use for the same records, and the five plateau photographs the ones batch B10 uses for the five days
 * the Djedefre site sells.
 */
const PHOTO = {
  stepPyramid: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788797085/tours/m87zl1cmmc4kcv2nrv4o.jpg',
  stepPyramidAtDusk: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781377/tours/wkmxhvoiwvc36jaxfrr6.jpg',
  feluccasAtCairo: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788797148/tours/i7hlesmpg9oel1enka8o.jpg',
  plateauAtLowSun: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781847/tours/ira2tyqp7tp0acwe6ztd.jpg',
  camelAtSunrise: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788797185/tours/yoge0wgzwbrw8zhfeels.jpg',
  threePyramids: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787780674/tours/cyqhwwakyack600gfghk.jpg',
  felucca: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781643/tours/ppovupzztby04d2o9wqq.jpg',
  pyramidsOverDunes: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788891906/tours/idsqp9obgnragpxbmjpp.jpg',
  orangeBayBeach: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788289814/tours/mqucr1dumbvdnyqejzc6.jpg',
  diverDescending: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788292330/tours/qgmeqrxj4kngqfei9snq.jpg',
  bowOverLagoon: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787782233/tours/wirlheh3pj6ibboavetn.jpg',
  whiteDiveYacht: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788292140/tours/od1x6rhlyxx6fz6atv12.jpg',
  yachtAtSunset: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781893/tours/uaguqygoeo7djujix5fy.jpg',
  snorkellerSelfie: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788291087/tours/a5hjhquanje6nm8wbsbf.jpg',
  diverOnReef: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788795165/tours/qrhdatgwm8zww53clwpq.jpg',
};

/** Each photo described as it is, not as the trip it illustrates, in the words the earlier batches used. */
const ALT: Record<keyof typeof PHOTO, string> = {
  stepPyramid: 'The stepped pyramid at Sakkara rising behind the restored stone walls and doorways of its funerary enclosure, across open sand',
  stepPyramidAtDusk: 'The stepped pyramid of Djoser rising in six tiers of worn stone above flat open sand, under a hazy sky at the end of the day',
  feluccasAtCairo: 'Two feluccas under white sails on the river, with the Cairo waterfront, a tall latticed tower and palms behind',
  plateauAtLowSun: 'The Giza plateau at low sun, with the pyramids of Khafre and Menkaure above the temple ruins and the Sphinx between them',
  camelAtSunrise: 'A saddled camel standing between two pyramids, with the sun low in a yellow sky behind it',
  threePyramids: 'The three Giza pyramids under a blue sky with white cloud, the smaller queens’ pyramids and loose blocks in front and rippled sand in the foreground',
  felucca: 'A felucca under a tall white sail carrying passengers on the river, with more feluccas and a moored river boat along the far bank',
  pyramidsOverDunes: 'Three pyramids on the horizon at sunset, seen across rippled sand dunes under a pink and orange sky',
  orangeBayBeach: 'A beach club of wooden decks and terraces on a sandy shore, with shallow turquoise water in front',
  diverDescending: 'A scuba diver descending through blue water above a reef, with other divers below',
  bowOverLagoon: 'The white bow of a boat heading across a turquoise lagoon towards a low sandy shore',
  whiteDiveYacht: 'A large white diving yacht moored in clear shallow water',
  yachtAtSunset: 'A motor yacht in silhouette on the sea under an orange sunset, with hills on the horizon',
  snorkellerSelfie: 'A snorkeller in a mask taking a photo of himself underwater above a coral reef',
  diverOnReef: 'A scuba diver with arms spread over a coral reef, with striped fish nearby',
};

const CAIRO = { lat: 30.0444, lng: 31.2357 };
const HURGHADA = { lat: 27.2579, lng: 33.8116 };
const MAKADI = { lat: 26.9806, lng: 33.9056 };

/** The Makadi Bay diving day collects where its own record collects, as batch B09's diving site sells it. */
const FROM_MAKADI = { city: 'Makadi Bay', area: 'Makadi Bay', coordinates: MAKADI };

/**
 * Places the two Abusir sites and the Meidum Pyramid never name. Their days run between Cairo, Giza, Sakkara,
 * Memphis and Dahshur, so those names are theirs to use; the rest of Egypt is not. The fence batch B12A used.
 */
const NOT_SOUTH_OF_GIZA = /Hurghada|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum/i;
/**
 * The Djedefre site keeps the tighter fence of batch B10's single-pyramid sites: every one of its five days
 * stays on the plateau and in Cairo, so the necropolis south of Giza is a name it never uses either.
 */
const NOT_OFF_THE_PLATEAU = /Hurghada|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Makadi|Gouna|Sahl|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur/i;
/**
 * Places the two Giftun reef sites never name: their boats leave Hurghada for the islands off it, exactly as
 * the Hurghada boat site of batch B09 does, so that batch's fence is the fence here.
 */
const NOT_HURGHADA_BOATS = /Cairo|Giza|Luxor|Aswan|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Gouna|Sahl|Makadi|Alexandria|Siwa|Bahariya|Fayoum|Sataya|Samadai/i;
/**
 * The Makadi Bay reef keeps the same fence with Makadi Bay and Sahl Hasheesh let through: its own reef lies at
 * the northern end of that bay below Sahl Hasheesh, and the day it sells collects in Makadi Bay, so both names
 * are its own to use. Every other town on the coast is still kept out.
 */
const NOT_MAKADI_REEF = /Cairo|Giza|Luxor|Aswan|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Gouna|Alexandria|Siwa|Bahariya|Fayoum|Sataya|Samadai/i;

/** The closing line every B11 and B12 site ends on, and every site here: what is included, and how to book. */
const CLOSING = 'Every trip collects you from your hotel and brings you back, and each page says what its own price covers. Hold a place online and pay later, or ask the team first about the pickup time.';

/** B13A: the two pyramids of Abusir, the pyramid on the hill at Abu Rawash and the tower at Meidum. */
export const B13A: NetworkBatch = {
  id: 'b13a',
  sites: [
    {
      slug: 'pyramid-of-neferirkare',
      name: 'Pyramid of Neferirkare',
      listingPath: '/trips',
      domain: 'pyramidofneferirkare.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'pnk-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      tagline: 'Days on the road that links Giza to Saqqara',
      description: `The Pyramid of Neferirkare was raised at Abusir, the ground between Giza and Saqqara chosen by three kings of the Fifth Dynasty for their pyramids. Neferirkare Kakai was the third of those kings, and his monument was probably left unfinished: no valley temple was ever built, and the causeway begun for it was taken over later for the pyramid of Nyuserre. Priests of his cult were housed inside a mortuary temple largely of mud brick, and the papyrus archives kept there set out how an Old Kingdom funerary endowment was run, item by item.\n\nEach day on sale here leaves the Giza plateau and runs down to the necropolis at Saqqara. Abusir sits roughly three kilometres to the north of that necropolis, and no published programme among them names either Abusir or the Pyramid of Neferirkare: neither is entered on any of their lists of stops. Two of them are single days; the third is spread across two and finishes among the museums of the city. ${CLOSING}`,
      seo: {
        metaTitle: 'Pyramid of Neferirkare: Giza to Saqqara Days',
        metaDescription: 'Three guided days that leave the Giza plateau for the necropolis at Saqqara and the ruins at Memphis, starting from a Cairo or Giza hotel.',
        keywords: ['pyramid of neferirkare abusir', 'abusir royal pyramids fifth dynasty', 'giza to saqqara guided day', 'memphis and necropolis day from cairo', 'cairo hotel pickup day trips'],
      },
      theme: { primaryColor: '#3A2618', secondaryColor: '#EADFCB', accentColor: '#B4552D' },
      heroImages: [PHOTO.stepPyramid, PHOTO.feluccasAtCairo, PHOTO.stepPyramidAtDusk],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/pyramid-of-neferirkare/monogram.png',
      trips: [
        {
          path: 'giza-pyramids-sakkara-and-memphis',
          price: P.GIZA_SOUTH,
          title: 'Three Stops, Taken in Their Published Order',
          short: 'The Giza plateau first, the necropolis at Saqqara second, the ruined capital at Memphis third, with admission counted in.',
          description: 'The order is set and the day keeps to it. First the plateau, among the pyramids with the Great Sphinx below them; second the desert road down to Saqqara and its Step Pyramid; third Memphis, a field of ruin with a toppled Ramses II lying across it. The programme names a plateau, a necropolis and a ruined capital, not Abusir or the Pyramid of Neferirkare; neither is a stop on this day.\n\nThree ways to take it are published: a shared group guided in English, a car and guide kept for your party, or a guide of your own speaking Italian or Spanish. Admission to each place on the list is counted into the price, and a car calls for you at both ends of the day, at a Cairo or Giza hotel.',
          highlights: [
            'The plateau, its pyramids and the Sphinx',
            'The Step Pyramid down at Saqqara',
            'Memphis and a toppled Ramses II',
            'Shared, or private in three languages',
          ],
          seo: {
            metaTitle: 'Giza, Saqqara and Memphis in Published Order',
            metaDescription: 'A guided day in order: the Giza plateau, the Step Pyramid down at Saqqara, then the ruins at Memphis, with admission and a hotel car.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'A Private Day of Four Places, Closing on the River',
          short: 'A car and guide of your own for the plateau, Memphis, Saqqara and Dahshur, with a meal on the way and an hour afloat.',
          description: 'The longest of the three, and the only one that reaches Dahshur. Your own car and guide begin on the plateau, pull in at Memphis for the ruin and its fallen king, climb to Saqqara, where the Step Pyramid stands with mastabas laid out beside it, and finish among the two great pyramids of Dahshur. The programme names four places and no fifth, not Abusir or the Pyramid of Neferirkare; neither is a stop on this day.\n\nA meal at a local restaurant is written into it, and the last hour is given to the river aboard a felucca. Admission to each place on the list is counted into the price, and the car calls at your Cairo or Giza hotel.',
          highlights: [
            'Four places in one private day',
            'Dahshur, at the far end of it',
            'A meal written into the price',
            'An hour afloat to finish',
          ],
          seo: {
            metaTitle: 'Private Four-Place Day, Ending Afloat on the River',
            metaDescription: 'A private day over the plateau, Memphis, Saqqara and Dahshur, with a meal, an hour afloat on the river and a car from your hotel.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'Two Private Days: the Road South, then the Collections',
          short: 'The first day is spent on the road south; the second is given to two collections, on Tahrir Square and at the civilisation museum.',
          description: 'Day one goes south: the Giza pyramids, the Valley Temple, the Great Sphinx, then Djoser’s Step Pyramid at Saqqara, then Memphis with a colossal Ramses II on the ground and an alabaster sphinx standing near. The programme names the road south and the two collections, not Abusir or the Pyramid of Neferirkare; neither is a stop on this day.\n\nDay two stays with what was dug up: the museum on Tahrir Square first, then the hall of royal mummies at the civilisation museum. A car and an English-speaking guide are yours on both mornings, the gate fees are included, and a meal comes with each day.',
          highlights: [
            'Djoser’s Step Pyramid on day one',
            'The Valley Temple, then the Sphinx',
            'A colossal Ramses II lying at Memphis',
            'Royal mummies on the second day',
          ],
          seo: {
            metaTitle: 'Two Private Days: the Road South, then Collections',
            metaDescription: 'Two private days: the Giza pyramids, Saqqara and Memphis, then the Tahrir Square museum and the hall of royal mummies.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
      ],
    },
    {
      slug: 'pyramid-of-neferefre',
      name: 'Pyramid of Neferefre',
      listingPath: '/trips',
      domain: 'pyramidofneferefre.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'pnf-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      tagline: 'Three days from the plateau down to the necropolis',
      description: `The Pyramid of Neferefre never rose past its first stage. Its king reigned in the Fifth Dynasty directly after Neferirkare Kakai and died early, before the complex could be completed as planned, so what he had begun was squared off as a low mastaba and his temple went up in mud brick, with only its western end in limestone. What was found in that temple put his burial beyond doubt, and the papyrus archive recovered inside is among the oldest temple archives in Egypt.\n\nAll three days on sale here take the desert road from Giza down to the necropolis at Sakkara. Abusir stands a short way north of it, and neither Abusir nor the Pyramid of Neferefre is named by any of their published programmes, or visited by any of them. Two are single days; the third is a pair of days that ends in the city’s collections. ${CLOSING}`,
      seo: {
        metaTitle: 'Pyramid of Neferefre: the Abusir Pyramid Days',
        metaDescription: 'Guided days that run south from Giza to the Sakkara necropolis and the old capital at Memphis, with a car from your Cairo or Giza hotel.',
        keywords: ['pyramid of neferefre abusir', 'unfinished abusir pyramid', 'giza and sakkara day trip', 'old capital memphis guided day', 'guided day trips from giza'],
      },
      theme: { primaryColor: '#2A2826', secondaryColor: '#F1EEE6', accentColor: '#4A5A8C' },
      heroImages: [PHOTO.stepPyramidAtDusk, PHOTO.stepPyramid, PHOTO.feluccasAtCairo],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/pyramid-of-neferefre/monogram.png',
      trips: [
        {
          path: 'giza-pyramids-sakkara-and-memphis',
          price: P.GIZA_SOUTH,
          title: 'One Flat Day: Giza, Sakkara, Memphis',
          short: 'A single day laid out level: pyramids and Sphinx on the plateau, the Step Pyramid at Sakkara, the fallen king at Memphis.',
          description: 'One day, laid out level. The pyramids and the Sphinx stand on the plateau; the Step Pyramid waits at the end of the desert road; a toppled Ramses II lies in the ruin at Memphis. The programme names Giza, Sakkara and Memphis in that order, not Abusir or the Pyramid of Neferefre; neither is on the day it sells.\n\nIt comes three ways: a group that shares the vehicle and an English-speaking guide, a car and guide for your party alone, or a private guide who works in Spanish or in Italian. Entry to every place it names is already paid for, and it begins and ends at your own hotel, in Cairo or in Giza.',
          highlights: [
            'Pyramids and Sphinx up on the plateau',
            'The Step Pyramid at Sakkara',
            'A toppled Ramses II at Memphis',
            'Three ways to take one day',
          ],
          seo: {
            metaTitle: 'Giza, Sakkara and Memphis: One Level Day',
            metaDescription: 'One guided day: pyramids and Sphinx up on the plateau, Sakkara’s Step Pyramid, then the fallen king at Memphis, entry paid.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'The Whole Road, Privately, from Giza to Dahshur',
          short: 'A private car and guide along the whole road, from the plateau through Memphis and Sakkara to Dahshur, with a meal and a sail.',
          description: 'This one runs the road out to its far end. Your car and guide start on the plateau, stop at Memphis, carry on up to Sakkara for the Step Pyramid, and halt at last where two great pyramids stand in the sand at Dahshur, a meal taken somewhere along the way. The programme names the whole road and its four halts, not Abusir or the Pyramid of Neferefre; neither is on the day it sells.\n\nA felucca takes the final hour on the river. Entry to every place it names is already paid for, and the car comes to your own hotel, in Cairo or in Giza.',
          highlights: [
            'The whole road, to its far end',
            'Two great pyramids out at Dahshur',
            'A meal somewhere along the way',
            'A felucca for the final hour',
          ],
          seo: {
            metaTitle: 'The Whole Road: Giza to Dahshur, Privately',
            metaDescription: 'A private day along the whole road from the plateau through Memphis and Sakkara to the two great pyramids at Dahshur, with a meal and a sail.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
        {
          path: 'two-private-days-in-cairo',
          price: P.TWO_DAY_PRIVATE,
          title: 'A Pair of Private Days: Sand, then Glass Cases',
          short: 'Day one is sand, at Giza, Sakkara and Memphis; day two is glass cases, in two collections of the city.',
          description: 'Day one is sand: Giza’s pyramids, the Valley Temple, the Sphinx, Djoser’s Step Pyramid up at Sakkara, and Memphis with its huge recumbent Ramses II and the alabaster sphinx near it. The programme names a day on the sand and a day among the collections, not Abusir or the Pyramid of Neferefre; neither is on the day it sells.\n\nDay two is glass cases: the Tahrir Square museum, then the civilisation museum where the royal mummies lie apart. Both days bring a car and an English-speaking guide, the gate fees, and a meal.',
          highlights: [
            'Giza’s pyramids and the Valley Temple',
            'Djoser’s Step Pyramid up at Sakkara',
            'A huge recumbent Ramses II',
            'Two city collections on day two',
          ],
          seo: {
            metaTitle: 'Two Private Days: Sand First, then Glass Cases',
            metaDescription: 'Two private days: Giza, Sakkara and Memphis on the sand, then the Tahrir Square museum and the civilisation museum’s royal mummies.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
      ],
    },
    {
      slug: 'pyramid-of-djedefre',
      name: 'Pyramid of Djedefre',
      listingPath: '/trips',
      domain: 'pyramidofdjedefre.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'djf-',
      foreignPlaces: NOT_OFF_THE_PLATEAU,
      tagline: 'Days on the plateau his father built on',
      description: `The Pyramid of Djedefre sits on a hill at Abu Rawash, some eight kilometres north-west of the Giza pyramids. Djedefre was a son of Khufu, who built the Great Pyramid; he took the throne when his father died, held it about eight years and was followed by his brother, and he went north to raise a pyramid of his own on the scale of Menkaure’s. Granite casing blocks, a funerary temple that had granite columns, and a causeway still traceable up the slope are most of what is left.\n\nEvery day on sale here halts on the Giza plateau, where Khufu’s Great Pyramid stands. Abu Rawash is named in none of their published programmes, nor is the pyramid on its hill, and no day turns north towards it. Five are on offer: a half day that ends afloat, a shared morning in the saddle, four private hours on the plateau alone, a long private day with a museum and a bazaar, and a private day that adds a camel and a meal. ${CLOSING}`,
      seo: {
        metaTitle: 'Pyramid of Djedefre: Days on the Giza Plateau',
        metaDescription: 'Guided days on the Giza plateau and in the city, from four private hours at the pyramids to a full day with a museum and a bazaar.',
        keywords: ['pyramid of djedefre abu rawash', 'abu rawash fourth dynasty pyramid', 'giza plateau half day', 'camel ride and breakfast at giza', 'cairo museum and bazaar private day'],
      },
      theme: { primaryColor: '#22303A', secondaryColor: '#EEF2F4', accentColor: '#D9773A' },
      heroImages: [PHOTO.pyramidsOverDunes, PHOTO.plateauAtLowSun, PHOTO.camelAtSunrise],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/pyramid-of-djedefre/monogram.png',
      trips: [
        {
          path: 'pyramids-and-an-hour-on-the-nile',
          price: P.FELUCCA,
          title: 'Half a Day on the Plateau, an Hour Afloat',
          short: 'Roughly thirty minutes at each of the three pyramids, then the Sphinx, gate fees settled, and an hour on the water under sail.',
          description: 'The plateau takes the first part of the day, roughly half an hour each at Khufu’s pyramid, at Khafre’s, at Menkaure’s and at the Sphinx, with the guide beside you and the gate fees settled before you arrive. The programme names the plateau and the river, not Abu Rawash; the pyramid on the hill is no stop on it.\n\nThe second part is water: sixty minutes aboard a felucca, which is a wooden boat under one tall sail. A private air-conditioned car fetches you from a Cairo or Giza hotel and returns you to it, and children are priced separately.',
          highlights: [
            'Half an hour at each pyramid',
            'The Sphinx below the three of them',
            'Sixty minutes aboard a felucca',
            'Gate fees, and a private car',
          ],
          seo: {
            metaTitle: 'Giza Half Day, then an Hour Afloat Under Sail',
            metaDescription: 'A private half day at the three Giza pyramids and the Sphinx, gate fees settled, then sixty minutes aboard a felucca under sail.',
          },
          images: [PHOTO.felucca],
          imageAlts: [ALT.felucca],
        },
        {
          path: 'sunrise-camel-ride-and-breakfast',
          price: P.SUNRISE_SHARED,
          title: 'A Shared Morning in the Saddle, Breakfast After',
          short: 'Sixty minutes in the saddle on the sand beside the plateau, breakfast after it, then the guided walk with the ticket included.',
          description: 'The saddle comes first: sixty minutes on a camel, or on a horse if you would rather, across the sand beside the plateau with the pyramids in sight, either at sunrise or later in the morning. Breakfast follows, Egyptian and traditional, and then the walk through the complex and past the Sphinx with the ticket included. The programme names the plateau at dawn, not Abu Rawash; the pyramid on the hill is no stop on it.\n\nOther guests share the air-conditioned vehicle and the guide, who works in English. The vehicle fetches you from a Cairo or Giza hotel and returns you to it, and a child pays what an adult pays.',
          highlights: [
            'Sixty minutes in the saddle',
            'Sunrise, or a later morning start',
            'An Egyptian breakfast after the ride',
            'The complex ticket included',
          ],
          seo: {
            metaTitle: 'Shared Saddle Morning at Giza, Breakfast After',
            metaDescription: 'A shared morning: sixty minutes in the saddle beside the plateau, an Egyptian breakfast, then the guided walk with the ticket included.',
          },
          images: [PHOTO.camelAtSunrise],
          imageAlts: [ALT.camelAtSunrise],
        },
        {
          path: 'private-half-day-pyramids-and-sphinx',
          price: P.HALF_DAY,
          title: 'Four Private Hours and Nothing Else',
          short: 'A guide and car of your own for four hours: Khufu, Khafre and Menkaure, the Valley Temple below them and the Sphinx, gate fees paid.',
          description: 'Four hours, and no second stop in them. Your own guide walks you between the pyramids of Khufu, Khafre and Menkaure, then down to Khafre’s Valley Temple and the Sphinx that sits beside it, with the gate fees paid. The programme names the plateau and nothing further, not Abu Rawash; the pyramid on the hill is no stop on it.\n\nThe car is private and air-conditioned, the guide works in English, and children are priced separately. It leaves at eight or at nine, and it comes to your hotel in Cairo or in Giza.',
          highlights: [
            'Four hours, and no second stop',
            'Khufu, Khafre and Menkaure',
            'Khafre’s Valley Temple and the Sphinx',
            'An eight or nine o’clock start',
          ],
          seo: {
            metaTitle: 'Four Private Hours at Giza and Nothing Else',
            metaDescription: 'A private four hours between the pyramids of Khufu, Khafre and Menkaure, down to the Valley Temple and the Sphinx, gate fees paid.',
          },
          images: [PHOTO.plateauAtLowSun],
          imageAlts: [ALT.plateauAtLowSun],
        },
        {
          path: 'pyramids-egyptian-museum-and-khan-el-khalili',
          price: P.BAZAAR_PRIVATE,
          title: 'A Long Private Day: Plateau, Museum, Bazaar',
          short: 'Eight private hours with a meal: the walk among the pyramids, the museum of antiquities, then the covered lanes of Khan el-Khalili.',
          description: 'Eight hours, a car and a guide of your own. It opens with the drive out and the walk among the pyramids and the Sphinx, moves on to the Egyptian Museum of Antiquities, and ends in the covered lanes of Khan el-Khalili. The programme names the plateau, a museum and a bazaar, not Abu Rawash; the pyramid on the hill is no stop on it.\n\nA meal is part of the price and children are priced separately. The car fetches you from a Cairo or Giza hotel in the morning and brings you back when the day is done.',
          highlights: [
            'Eight private hours, with a meal',
            'The walk among pyramids and Sphinx',
            'The museum of antiquities next',
            'The covered lanes of Khan el-Khalili',
          ],
          seo: {
            metaTitle: 'Private Day: Plateau, Antiquities Museum, Bazaar',
            metaDescription: 'Eight private hours with a meal: the pyramids and the Sphinx, a museum of antiquities, then the covered lanes of Khan el-Khalili.',
          },
          images: [PHOTO.pyramidsOverDunes],
          imageAlts: [ALT.pyramidsOverDunes],
        },
        {
          path: 'private-day-with-a-camel-ride-and-lunch',
          price: P.CAMEL_LUNCH,
          title: 'Four Private Hours, a Camel and a Meal',
          short: 'A guide and car kept for you: the walk with gate fees covered, a camel round the plateau and a meal at a local restaurant.',
          description: 'Four hours with a guide and car kept for your party. The walk goes among the pyramids and the Sphinx with the gate fees covered, a camel then carries you round the plateau, and a meal at a local restaurant closes it. The programme names the plateau, a camel and a meal, not Abu Rawash; the pyramid on the hill is no stop on it.\n\nStart times run through the morning and into the early afternoon, and the car comes to your hotel in Cairo or in Giza. Children are priced separately. Being fetched from further out than the city centre costs more and cannot be booked here, so ask the team first.',
          highlights: [
            'Four hours with a guide and car',
            'Gate fees covered on the walk',
            'A camel round the plateau',
            'A meal at a local restaurant',
          ],
          seo: {
            metaTitle: 'Private Giza Hours with a Camel and a Meal',
            metaDescription: 'Four private hours at Giza: the guided walk with gate fees covered, a camel round the plateau and a meal at a local restaurant.',
          },
          images: [PHOTO.threePyramids],
          imageAlts: [ALT.threePyramids],
        },
      ],
    },
    {
      slug: 'meidum-pyramid',
      name: 'Meidum Pyramid',
      listingPath: '/trips',
      domain: 'meidumpyramid.com',
      city: 'Cairo',
      area: 'Cairo or Giza',
      pickupDestination: 'cairo',
      coordinates: CAIRO,
      currency: 'USD',
      slugPrefix: 'mdp-',
      foreignPlaces: NOT_SOUTH_OF_GIZA,
      tagline: 'Days out at Sneferu’s Dahshur pyramids',
      description: `The Meidum pyramid stands at Meidum in Beni Suef, south of the capital. What is left of it looks like a three-tier tower rising from a wide mound of debris, and that tower is most of the core. Sneferu, who opened the Fourth Dynasty, picked the place for his tomb; its old name was Djed Sneferu, which means Sneferu Endures. It began as a step pyramid and was later reworked at his order into a smooth-sided true pyramid, the shape he then built in twice over at Dahshur.\n\nEach day on sale here halts at Dahshur, where two of the three great pyramids credited to Sneferu stand: the Bent Pyramid and the Red Pyramid. Meidum lies about forty-five kilometres further south, is named by none of their published programmes, and is reached by none of them. Two are single days out; the third is a long private day that opens on the Giza plateau and shuts with a meal and a sail. ${CLOSING}`,
      seo: {
        metaTitle: 'Meidum Pyramid: Days Out to Sneferu’s Dahshur',
        metaDescription: 'Guided days that halt at Dahshur for the Bent Pyramid and the Red Pyramid, with the Sakkara necropolis and Memphis, from a Cairo hotel.',
        keywords: ['meidum pyramid sneferu', 'bent pyramid and red pyramid day', 'dahshur guided day out', 'sneferu three great pyramids', 'necropolis and dahshur from cairo'],
      },
      theme: { primaryColor: '#4B3F5C', secondaryColor: '#F0E8D8', accentColor: '#C9A227' },
      heroImages: [PHOTO.feluccasAtCairo, PHOTO.stepPyramid, PHOTO.stepPyramidAtDusk],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/meidum-pyramid/monogram.png',
      trips: [
        {
          path: 'sakkara-memphis-and-dahshur-shared',
          price: P.SOUTH_SHARED,
          title: 'A Shared Day Out: Dahshur First, Then North',
          short: 'A shared day that halts first at the Bent Pyramid and the Red Pyramid, then works north to Sakkara and Memphis, admission paid.',
          description: 'Dahshur is the first halt, where the Bent Pyramid and the Red Pyramid stand a few hundred metres apart. The day then works north to Sakkara for the Step Pyramid and the rock-cut tombs by it, and finishes at Memphis, where a colossal Ramses II lies among the remains of the old capital. The programme names Dahshur, Sakkara and Memphis, not Meidum, and no stop on the day is made there.\n\nAn air-conditioned vehicle is shared with other guests, the guide works in English, and every gate the day passes through is paid for. It leaves at eleven, there is no meal in the price, and it opens at your hotel in Cairo or in Giza and closes there.',
          highlights: [
            'The Bent Pyramid, then the Red',
            'The Step Pyramid and rock-cut tombs',
            'A colossal Ramses II at Memphis',
            'An eleven o’clock departure',
          ],
          seo: {
            metaTitle: 'Shared Day Out: Dahshur First, then Sakkara',
            metaDescription: 'A shared day that halts first at the Bent and Red Pyramids, then works north to Sakkara and Memphis, with every gate paid for.',
          },
          images: [PHOTO.stepPyramid],
          imageAlts: [ALT.stepPyramid],
        },
        {
          path: 'private-sakkara-memphis-and-dahshur',
          price: P.SOUTH_PRIVATE,
          title: 'Dahshur at Eight, Privately, Then the Necropolis',
          short: 'A car and guide of your own from eight: Sneferu’s two pyramids while it is quiet, then Sakkara and the old capital.',
          description: 'An eight o’clock start with a car of your own puts you at Dahshur before the crowds, with time for both of Sneferu’s pyramids there before the day turns back north to the Step Pyramid enclosure and the mastabas at Sakkara, and on to Memphis. The programme names Dahshur, Sakkara and Memphis, not Meidum, and no stop on the day is made there.\n\nA guide in another language can be requested, every gate the day passes through is paid for, and no meal is included. The car opens the day at your hotel in Cairo or in Giza and closes it there.',
          highlights: [
            'Dahshur before the crowds arrive',
            'Both of Sneferu’s pyramids there',
            'The Step Pyramid enclosure and mastabas',
            'Another language, if you ask',
          ],
          seo: {
            metaTitle: 'Private Dahshur at Eight, then Sakkara and Memphis',
            metaDescription: 'A private day from eight: Sneferu’s two pyramids at Dahshur while it is quiet, then the Sakkara necropolis and the old capital.',
          },
          images: [PHOTO.stepPyramidAtDusk],
          imageAlts: [ALT.stepPyramidAtDusk],
        },
        {
          path: 'private-day-with-lunch-and-a-nile-sail',
          price: P.GIZA_SOUTH_VIP,
          title: 'The Long Private Day that Finishes at Dahshur',
          short: 'The only one here that starts on the Giza plateau and runs through Memphis and Sakkara to Sneferu’s two pyramids, with a meal and a sail.',
          description: 'This is the only one here that opens on the Giza plateau. A car and guide of your own take the pyramids and the Sphinx, then Memphis and its fallen king, then Sakkara for the Step Pyramid, and come at last out to Dahshur, where the Bent Pyramid stands a short way from the Red, a meal taken on the way. The programme names the plateau, Memphis, Sakkara and Dahshur, not Meidum, and no stop on the day is made there.\n\nAn hour on the river aboard a felucca shuts the day. Every gate the day passes through is paid for, and the car collects from a Cairo or Giza hotel at the start.',
          highlights: [
            'The only one starting at Giza',
            'Memphis and its fallen king',
            'Sneferu’s pair at the far end',
            'An hour on the river to finish',
          ],
          seo: {
            metaTitle: 'Long Private Day: Giza Through to Dahshur',
            metaDescription: 'A private day that leaves the Giza plateau, crosses Memphis and Sakkara, and halts at Sneferu’s two pyramids, with a meal and an hour afloat.',
          },
          images: [PHOTO.feluccasAtCairo],
          imageAlts: [ALT.feluccasAtCairo],
        },
      ],
    },
  ],
};

/** B13B: the reef in the Giftun strait, the fringing reef off Makadi Bay and the coral tower off Small Giftun. */
export const B13B: NetworkBatch = {
  id: 'b13b',
  sites: [
    {
      slug: 'shaab-sabina',
      name: 'Shaab Sabina',
      listingPath: '/trips',
      domain: 'shaabsabinahurghada.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'ssb-',
      foreignPlaces: NOT_HURGHADA_BOATS,
      tagline: 'Orange Bay days across the Giftun strait',
      description: `Shaab Sabina is a shallow reef that juts east off Big Giftun as a tongue of coral, out in the strait between Big Giftun and Small Giftun. Twelve to fourteen metres is as deep as it goes, and the draw is a coral garden that spills from the crest down a drop-off to a seabed about fourteen metres below, hard corals piled one on another. North of the main reef the ground breaks into a maze of coral ergs and ridges with sand between them; boats tie up along the southern side, and the site is built for drift dives, with turtles, large pufferfish and parrotfish recorded on it.\n\nAll three days sold here sail to Orange Bay on Big Giftun. None of their programmes names Shaab Sabina, the reef in the strait between the two islands and under three kilometres from the bay, and none stops there. One is a cruise boat with a massage and a buffet, one adds a scuba dive, and one goes by yacht with breakfast. ${CLOSING}`,
      seo: {
        metaTitle: 'Shaab Sabina: Orange Bay Days from Hurghada',
        metaDescription: 'Boat days out of Hurghada to Orange Bay on Big Giftun, with a snorkelling stop, a scuba dive or a yacht breakfast, and a car from your hotel.',
        keywords: ['shaab sabina reef hurghada', 'orange bay day trip from hurghada', 'giftun strait coral garden', 'orange bay snorkelling and diving', 'hurghada boat day with hotel pickup'],
      },
      theme: { primaryColor: '#0E5A63', secondaryColor: '#EEF6F4', accentColor: '#D9654B' },
      heroImages: [PHOTO.orangeBayBeach, PHOTO.bowOverLagoon, PHOTO.diverDescending],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/shaab-sabina/monogram.png',
      trips: [
        {
          path: 'orange-bay-cruise-with-massage',
          price: P.ORANGE_MASSAGE,
          title: 'Eight and a Half Hours Out to Orange Bay',
          short: 'A whole day on a cruise boat: a snorkelling stop with the gear handed out, time on the white beach, a massage each and an open buffet.',
          description: 'The boat has the whole day for it, out across the water and back. A snorkelling stop comes with the gear and the life jackets handed out, then seventy-five minutes ashore on the white beach of Orange Bay Island, and one massage for every guest. The programme names the open water, Orange Bay and the Giftun islands, not Shaab Sabina out in the strait; no boat stops there.\n\nAn open buffet is laid out with salads and fruit, and soft drinks, hot drinks and snacks are unlimited; the marine fee and the life jackets are in the price. What you buy on the island is not. Children have their own price, and a car calls at your Hurghada hotel at half past seven.',
          highlights: [
            'A snorkelling stop, gear handed out',
            'Seventy-five minutes on the white beach',
            'One massage for every guest',
            'An open buffet, drinks unlimited',
          ],
          seo: {
            metaTitle: 'Eight and a Half Hours Out to Orange Bay',
            metaDescription: 'A whole cruise-boat day to Orange Bay: a snorkelling stop with the gear, time on the beach, a massage each and an open buffet.',
          },
          images: [PHOTO.orangeBayBeach],
          imageAlts: [ALT.orangeBayBeach],
        },
        {
          path: 'orange-bay-snorkelling-and-diving-day',
          price: P.ORANGE_DIVE,
          title: 'Two Ways Into the Water, and Orange Bay Between',
          short: 'One boat day with both: snorkelling with the gear provided and a scuba dive with the equipment, plus a stop at Orange Bay and lunch aboard.',
          description: 'Snorkel and dive on the same ticket. The boat sails out towards Giftun, puts in at Orange Bay Island for seventy-five minutes, and gives the rest of the day to a snorkel with the gear and a scuba dive with the full equipment. The programme names Giftun Island and Orange Bay, not Shaab Sabina out in the strait; no boat stops there.\n\nLunch is an open buffet on board with soft and hot drinks, and the guide, the life vest and the marine fee are all counted in. Children have their own price, and the transfer runs both ways from your hotel in Hurghada.',
          highlights: [
            'Snorkelling with the gear provided',
            'A scuba dive, equipment included',
            'Seventy-five minutes at Orange Bay',
            'An open buffet lunch aboard',
          ],
          seo: {
            metaTitle: 'Snorkel and Dive in One Day, with Orange Bay',
            metaDescription: 'A boat day with snorkelling gear, the diving equipment, a stop at Orange Bay Island, and a buffet served aboard, from your Hurghada hotel.',
          },
          images: [PHOTO.diverDescending],
          imageAlts: [ALT.diverDescending],
        },
        {
          path: 'orange-bay-yacht-with-breakfast',
          price: P.ORANGE_YACHT,
          title: 'By Yacht to Orange Bay: Five Hours or Eight',
          short: 'The same yacht day at two lengths: breakfast and one stop in five hours, or breakfast, lunch and two stops in eight.',
          description: 'Two lengths of one yacht day, and you pick when you book. Five hours brings a breakfast buffet, a single snorkelling stop and an hour on the island; eight hours adds lunch, a second stop and a second hour ashore. The programme names Giftun Island and Orange Bay, not Shaab Sabina out in the strait; no boat stops there.\n\nThe snorkelling equipment, the island entry fees and the marine tax come with either length, and a guide is on each boat with another for anyone who does not swim. Children are priced separately, and the yacht casts off at half past eight, once the car has been round the Hurghada hotels.',
          highlights: [
            'Five hours, or eight with lunch',
            'A breakfast buffet as you sail',
            'One snorkelling stop, or two',
            'A guide for anyone not swimming',
          ],
          seo: {
            metaTitle: 'Orange Bay by Yacht: Five Hours, or Eight',
            metaDescription: 'A yacht to Orange Bay at two lengths: breakfast and one snorkelling stop in five hours, or breakfast, lunch and two stops in eight.',
          },
          images: [PHOTO.bowOverLagoon],
          imageAlts: [ALT.bowOverLagoon],
        },
      ],
    },
    {
      slug: 'ras-disha',
      name: 'Ras Disha',
      listingPath: '/trips',
      domain: 'rasdishahurghada.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'rdh-',
      foreignPlaces: NOT_MAKADI_REEF,
      photoShortfall: 'The one day this site sells publishes one photo.',
      tagline: 'A diving day on the Makadi Bay wall',
      description: `Ras Disha is a fringing reef on the coast at the northern end of Makadi Bay. A shallow plateau on sandy ground carries pinnacles split by cracks, with an oval coral erg at its southern end, and the pinnacles hold caverns packed with glassfish. To the north-west that plateau narrows into a slim shelf which opens onto a steep wall, and a beacon on the main reef marks where the drift dives begin, running north along it. Butterflyfish, bannerfish and parrotfish work the wall, blue-spotted stingrays and gobies the sand, scorpionfish and groupers hunt the glassfish, and crocodilefish and roaming turtles keep to the main reef.\n\nThe day sold here dives and cruises in Makadi Bay. Its programme does not name Ras Disha, the fringing reef at the bay’s northern end below Sahl Hasheesh, and it makes no stop there. It is a full day aboard a diving boat: two guided dives with the kit, a buffet lunch between them, and a car to the marina and back. ${CLOSING}`,
      seo: {
        metaTitle: 'Ras Disha: a Makadi Bay Diving Boat Day',
        metaDescription: 'A full day aboard a diving boat in Makadi Bay, with two guided dives, the whole kit and a buffet lunch, collected from your hotel in the bay.',
        keywords: ['ras disha reef makadi bay', 'makadi bay diving boat day', 'drift dive wall makadi bay', 'two guided dives red sea', 'makadi bay diving with hotel pickup'],
      },
      theme: { primaryColor: '#1B3A6B', secondaryColor: '#F2EBDD', accentColor: '#E2582B' },
      heroImages: [PHOTO.whiteDiveYacht],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/ras-disha/monogram.png',
      trips: [
        {
          path: 'makadi-bay-two-guided-dives',
          price: P.MAKADI_DIVES,
          title: 'A Diving Boat, Two Reefs, One Long Day',
          short: 'Out of the marina at a quarter to eight for two guided dives on two reefs, with the whole kit, an instructor and a buffet lunch aboard.',
          description: 'The boat casts off at a quarter to eight and the day is built around two dives, one on each of two reefs, with the briefing and the kit set up as it leaves. An instructor and crew are aboard and the full equipment comes with the price. The programme names Makadi Bay and its reefs, not Ras Disha at the bay’s northern end; the boat makes no stop there.\n\nA buffet lunch falls between the two dives, with soft drinks and bottled water. A car runs you from your Makadi Bay hotel to the marina and home again; being fetched from outside the bay is not part of this price. Children pay their own rate, and the team will say whether these dives suit your level before you book.',
          highlights: [
            'Two guided dives on two reefs',
            'The full equipment, kit set up aboard',
            'A buffet lunch between the dives',
            'An instructor and crew on the boat',
          ],
          seo: {
            metaTitle: 'A Diving Boat, Two Reefs, One Long Day',
            metaDescription: 'Out of Makadi Bay at a quarter to eight: two guided dives on two reefs, the whole kit, an instructor aboard and a buffet lunch between them.',
          },
          images: [PHOTO.whiteDiveYacht],
          imageAlts: [ALT.whiteDiveYacht],
          where: FROM_MAKADI,
        },
      ],
    },
    {
      slug: 'erg-somaya',
      name: 'Erg Somaya',
      listingPath: '/trips',
      domain: 'ergsomayahurghada.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'esy-',
      foreignPlaces: NOT_HURGHADA_BOATS,
      tagline: 'Island days off the smaller Giftun',
      description: `Erg Somaya is a coral tower rising from a shelf off the east side of Small Giftun, the smaller of the two Giftun islands, a little north of the Gorgonia Garden site. It opens as a vertical wall that runs onto the shelf the tower stands on, then turns into a second wall of coral formations, one of them shaped like a pyramid. Tall towers jut from the steep wall at the northern end, thick with gorgonians and soft coral above a drop-off that falls away into the depths, and there are caves grown over with both and a chimney packed with glassfish. Barracuda, snapper, jackfish and tuna pass in the blue, silversides and anthias shoal around the towers, and butterflyfish turn up in many species.\n\nAll three days sold here sail to the Giftun islands. None of their programmes names Erg Somaya, the coral tower about a kilometre off the east side of Small Giftun, and none stops there. One is a yacht working three islands, one a speedboat working six, and one a yacht day built around a first dive. ${CLOSING}`,
      seo: {
        metaTitle: 'Erg Somaya: Giftun Island Days by Boat',
        metaDescription: 'Yacht and speedboat days from Hurghada to the Giftun islands, with snorkelling stops, time ashore and a first dive, and a car from your hotel.',
        keywords: ['erg somaya small giftun', 'giftun islands boat day hurghada', 'coral tower dive site hurghada', 'six island speedboat day', 'giftun yacht day with pickup'],
      },
      theme: { primaryColor: '#12343B', secondaryColor: '#F3F1EC', accentColor: '#6B3FA0' },
      heroImages: [PHOTO.yachtAtSunset, PHOTO.snorkellerSelfie, PHOTO.diverOnReef],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/erg-somaya/monogram.png',
      trips: [
        {
          path: 'three-islands-by-yacht',
          price: P.THREE_ISLANDS,
          title: 'A Yacht Working Three Islands in a Day',
          short: 'Sixty minutes ashore at Orange Bay, forty inside the Giftun reserve, sixty more at Magawish, two snorkelling stops and seafood aboard.',
          description: 'Three islands, eight hours and one yacht. Sixty minutes at Orange Bay, forty of snorkelling inside the Giftun Island nature reserve, sixty at Magawish, and two snorkelling stops at different sites on the way. The programme names those three islands, not Erg Somaya off Small Giftun; nothing stops at the tower.\n\nBreakfast is served as the yacht sails and the midday meal is seafood, with unlimited soft drinks, hot drinks, water and seasonal fruit, and the entrance fee for each island is counted in. The crew watch for dolphins on the way out, which are wild and cannot be promised. Children have their own price, and the pickup from your Hurghada hotel is at half past eight.',
          highlights: [
            'An hour ashore at Orange Bay',
            'Inside the Giftun nature reserve',
            'An hour at Magawish Island',
            'Breakfast aboard, seafood at midday',
          ],
          seo: {
            metaTitle: 'A Yacht Working Three Islands in a Day',
            metaDescription: 'Eight hours by yacht: an hour at Orange Bay, the Giftun nature reserve, an hour at Magawish, two snorkelling stops and seafood aboard.',
          },
          images: [PHOTO.yachtAtSunset],
          imageAlts: [ALT.yachtAtSunset],
        },
        {
          path: 'six-islands-by-speedboat',
          price: P.SIX_ISLANDS,
          title: 'Six Islands, Three Snorkelling Stops, One Hull',
          short: 'A speedboat covers Giftun, Nemo Bay, Orange Bay, Magawish, a wreck and Abu Minqar, with the island fees and a shaded deck.',
          description: 'A small fast hull reaches in a day what a day boat cannot: two hours around Giftun, then Nemo Bay, Orange Bay, Magawish, a snorkelling stop over a wreck and a last call at Abu Minqar. Three of those stops are for snorkelling. The programme names the Giftun National Park area and those islands, not Erg Somaya off Small Giftun; nothing stops at the tower.\n\nThe entrance fees are counted in, with the snorkelling gear, a guide, a life jacket, soft drinks, water, fruit in season and shade on deck. The crew watch for dolphins, which are wild and cannot be promised. Lunch on the island is not in this price; children are priced separately, and a car comes for you in Hurghada.',
          highlights: [
            'Two hours around Giftun first',
            'Nemo Bay, Magawish and Abu Minqar',
            'A snorkelling stop over a wreck',
            'Island fees and a shaded deck',
          ],
          seo: {
            metaTitle: 'Six Islands and Three Snorkelling Stops',
            metaDescription: 'A speedboat day around Giftun, Nemo Bay, Orange Bay, Magawish, a wreck and Abu Minqar, with the island fees and a shaded deck.',
          },
          images: [PHOTO.snorkellerSelfie],
          imageAlts: [ALT.snorkellerSelfie],
        },
        {
          path: 'yacht-day-with-an-introductory-dive',
          price: P.INTRO_DIVE_YACHT,
          title: 'A First Dive, Ten Minutes Under, No Certificate',
          short: 'A yacht day built around a short first dive with an instructor, plus snorkelling, time on the island, a buffet and a massage each.',
          description: 'The dive is the point of this one, and it asks nothing of you beforehand: ten to fifteen minutes under water for each guest, with an instructor alongside and the equipment and suit provided, and no certificate needed. Snorkelling, seventy-five minutes on the island and a massage each fill the rest. The programme names Orange Bay and the Small Giftun dive site, not Erg Somaya off Small Giftun; nothing stops at the tower.\n\nAn open buffet is served on board, with salads, fruit, snacks, soft drinks, hot drinks and unlimited water, and the nature reserve fee and marine fee are counted in. Diving is not for anyone under thirteen. Children have their own price, and the yacht sails at half past seven once the car has been round.',
          highlights: [
            'A first dive of ten to fifteen minutes',
            'An instructor alongside, suit provided',
            'Snorkelling and time on the island',
            'An open buffet and a massage each',
          ],
          seo: {
            metaTitle: 'A First Dive, No Certificate, Off Small Giftun',
            metaDescription: 'A yacht day around a short first dive with an instructor and the equipment, plus snorkelling, island time, a buffet and a massage each.',
          },
          images: [PHOTO.diverOnReef],
          imageAlts: [ALT.diverOnReef],
        },
      ],
    },
  ],
};
