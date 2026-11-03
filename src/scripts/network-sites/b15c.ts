/**
 * Batch B15C (2 November 2026), the four offshore places the owner added to batch B15. One group:
 *
 * - B15C: Daedalus Reef, the lighthouse reef standing alone in open sea east of Marsa Alam; El Ikhwa, the two
 *   islands off El Quseir that English reads as The Brothers; Zabargad Island, the mantle rock south-east of
 *   Ras Banas that carries the peridot's name; and the M/V Hebat Allah, the freighter put on the sea floor off
 *   Hurghada in 2004, whose position has never been published.
 *
 * All four were held back in batch B15's own group C for want of a liveaboard or an offshore day: the scan of the
 * client's 217 published days found none at all. They are built now on the nearest real client day, with the
 * distance said plainly on every page, which is what the owner approved for batch B15's three park sites at
 * thirty-seven to eighty kilometres. Each trip is built on the record the client publishes on its own main site,
 * read into the dated snapshot (`network-sites/eeo-snapshot.json`); prices, child rates, departures and
 * inclusions are copied from that record at apply time and never typed here. All four records this group sells
 * were already in the snapshot, the Shaab Samadai day among them, which was the one open question the
 * assignment left to this step.
 *
 * THE "NEAREST DAYS" RULE, as batches B12 to B15 set it. No client day names any of these four places as a stop,
 * so a site takes the day the client's own records come closest to, measured as a great-circle distance from the
 * place's own published position to the nearest point a programme actually names. Every page says plainly what
 * its programme names and that the programme does not name the site's own place. No page implies a stop, a
 * mooring or even a passing sight the record does not publish. When the client publishes a day that does reach
 * one of these places, it replaces the trip sold here.
 *
 * What each site sells, and why (the coordinator's assignment of 2 November, `b15c/days.json`):
 * - Daedalus Reef is 88.95 km from Shaab Samadai, the nearest point any client programme names, so it sells the
 *   Shaab Samadai boat day. Three network sites already sell that record; the words here are this site's own.
 *   The record's own page is titled for a Dolphin House, which is a reef off Hurghada and not this day's stop,
 *   so this site's fence bars that name outright, exactly as batch B09's Shaab Samadai sites bar it.
 * - El Ikhwa is 90.96 km from the bay of Marsa Mubarak and sells the turtle day that names that bay alone. The
 *   client's second Marsa Mubarak day names the same bay and measures the same distance; it is left alone, so
 *   that no two sites of this group carry the same one-day list and the sailing day stays free for Zabargad.
 * - Zabargad Island is 257.18 km from Marsa Shona, which is the furthest nearest-day the network has, and it
 *   sells the sailing day out of Port Ghalib that works Marsa Mubarak and Marsa Shona. Read strictly the rule
 *   would have given it the inland Wadi El Gemal jeep day at 182.46 km; that day is already sold by five
 *   network sites and an inland desert day beside an offshore island reads as a mistake, so the owner's
 *   instruction for this group — a Marsa Alam or Port Ghalib boat day for the three offshore places — stands.
 *   The decision and its cost are recorded in `b15c/days.json` so that one line reverses it.
 * - The Hebat Allah has no published position, so no distance from any named point exists for it at all. Three
 *   sources agree on the water it lies in, between Giftun island and Gota Abu Ramada off Hurghada, and the day
 *   it sells is the Orange Bay yacht, whose programme names a stop inside that water and whose every hour is
 *   snorkelling. Its pages say that the distance cannot be given and that no day sold there dives the wreck.
 *   The two Hurghada intro-dive days and the six-island speedboat, whose inclusions carry an unnamed "Wreck
 *   snorkeling stop", are all left alone: setting this wreck beside any of them would invite the one reading
 *   its pages must never allow.
 *
 * No programme is written here. Two are imported from batch B09, which first sold those records, and two from
 * batch B08, which first wrote the two Marsa Mubarak days, so the network says the same thing about the same
 * trip wherever it is sold.
 *
 * The four "nearest" sentences are the assignment's own, word for word. None of them is a run that another site
 * already publishes about the same day: the three sites that already sell the Shaab Samadai day and the two
 * that sell each Marsa Mubarak day say nothing about a place these four are named for, because none of them had
 * one to disclaim.
 *
 * Names: one spelling per name everywhere, and the variants only where the facts give them and only once. El
 * Ikhwa is spelled that way throughout, with Al Ikhwān and Akhaween named once in its tenant description and the
 * English reading The Brothers beside it; Zabargad carries Topazos and St John's Island once each; Daedalus Reef
 * carries Abu el-Kizan once; the ship is the Hebat Allah throughout.
 *
 * Each site's facts come only from this group's facts file (`b15c/places-facts.json`), in this file's own plainer
 * words, and a fact is left out rather than stretched. Nothing here names a nationality for the 1863 light
 * station on Daedalus, a year for the Aida at El Ikhwa, an origin for those islands, a height or an area for
 * Zabargad, a date for the start of its mining, anything at all about its present access, or a length for the
 * Hebat Allah: every one of those is a direct conflict between reputable sources, and the facts file lists them
 * as never to be written. The Hebat Allah's pages carry no coordinates, no map, no bearing and no distance, and
 * nothing on that site is set beside the underwater military museum the client sells separately, which is a
 * different thing with no source connecting the two.
 *
 * PICTURES: NO NEW ONES WERE MADE, by the coordinator's decision of 3 November. No site of this group has a
 * picture of its own place, and none is invented: each site shows only photographs the client already publishes
 * on the record of the day it sells, or on another record of the same water, as the sites already selling that
 * day carry them. Every one of them is described in the words the batch that first sold the record wrote for
 * it, so the network never describes one photograph two ways, and no page presents any of them as the reef, the
 * islands, the island or the wreck the site is named for. Each site therefore carries a `photoShortfall` note
 * saying in its own words what it shows and what it does not have. Daedalus Reef shows a single photograph: the
 * Shaab Samadai day publishes one, and no second photograph of that day exists anywhere on the network or on
 * the client's own page, which is why the two sites already selling it carry one apiece too.
 *
 * The logos are supplied at apply time: `--apply` refuses to run without `--logos=<file>` naming every site's
 * approved logo, logoDark and favicon, for every site of the group.
 */
import type { NetworkBatch, PriceSpec } from '../seed-network-sites';
import { PHOTO_C, PROGRAMMES_C as B08C } from './b08';
import { PROGRAMMES_A as B09A, PROGRAMMES_B as B09B } from './b09';

/** Every programme this group sells; each is the batch that first sold the record. */
const P = {
  SHAAB_SAMADAI: B09B.SHAAB_SAMADAI,
  MM_TURTLE: B08C.MM_TURTLE,
  MM_SAILING: B08C.MM_SAILING,
  ORANGE_YACHT: B09A.HBT_ORANGE_YACHT,
} satisfies Record<string, PriceSpec>;

/**
 * Each record's own photograph, as the client publishes it, and the address the batch that first sold the
 * record carries. Each of these records publishes exactly one photograph, and these are they.
 */
const PHOTO = {
  dolphinsAndSwimmer: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788795260/tours/fs65spccs0uncfww6z9k.jpg',
  turtleOverReef: PHOTO_C.turtleOverReef,
  snorkellerAndSails: PHOTO_C.snorkellerAndSails,
  bowOverLagoon: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1787782233/tours/wirlheh3pj6ibboavetn.jpg',
  // Two more the client publishes on records of the same water, carried here so that three of the four sites
  // have a second photograph: the second Marsa Mubarak record's turtle, and the Orange Bay day's own shore.
  turtleInBlue: PHOTO_C.turtleInBlue,
  orangeBayBeach: 'https://res.cloudinary.com/dm3sxllch/image/upload/v1788289814/tours/mqucr1dumbvdnyqejzc6.jpg',
};

/** Each photograph described as it is, not as the trip it illustrates: the words batches B08 and B09 wrote for it. */
const ALT: Record<keyof typeof PHOTO, string> = {
  dolphinsAndSwimmer: 'Three dolphins swimming above a coral reef, with a snorkeller in a yellow top swimming nearby',
  turtleOverReef: 'A sea turtle swimming just under the surface above a shallow coral reef',
  snorkellerAndSails: 'A snorkeller in a mask at the surface of clear green water, with a tall sailing boat under sail behind',
  bowOverLagoon: 'The white bow of a boat heading across a turquoise lagoon towards a low sandy shore',
  turtleInBlue: 'A large sea turtle in deep blue water, with small fish and a reef behind it',
  orangeBayBeach: 'A beach club of wooden decks and terraces on a sandy shore, with shallow turquoise water in front',
};

/**
 * The marker standing where a picture address belongs. It is deliberately not a Cloudinary address, so the
 * batch check refuses this group until the uploads are written in, and no site is ever created on a stand-in.
 */
/**
 * What each site shows, in the order the creation run writes it: the home page's opening photograph first, then
 * the one the inner pages carry, the trip page among them. Not one of them is a picture of the site's own place,
 * because none exists and none was made for this group; each is a photograph the client publishes on the record
 * of the day the site sells, or on another record of the same water, and each is described above exactly as the
 * batch that first sold that record describes it. What each one actually shows is kept beside it here, because
 * the tenant record has nowhere to store a description of a hero image (its `heroImages` is a list of
 * addresses). The one thing every site's note tells a reader is that these are the day's photographs.
 */
const SITE_PICTURES: Record<string, string[]> = {
  'daedalus-reef': [
    // Three dolphins over a reef with a snorkeller beside them: the one photograph the Shaab Samadai day
    // publishes, and the only one of that day there is, which is why this site shows a single picture.
    PHOTO.dolphinsAndSwimmer,
  ],
  'el-ikhwa-islands': [
    // A large sea turtle in deep blue water with small fish and a reef behind it, from the client's second
    // Marsa Mubarak record: the same bay this site's day snorkels.
    PHOTO.turtleInBlue,
    // A sea turtle just under the surface over a shallow reef: the photograph this site's own day publishes.
    PHOTO.turtleOverReef,
  ],
  'zabargad-island': [
    // A snorkeller at the surface of clear green water with a sailing boat behind: the photograph the Port
    // Ghalib sailing day publishes.
    PHOTO.snorkellerAndSails,
    // The turtle over the shallow reef again, from the turtle record of Marsa Mubarak, which is the first of
    // the two bays this day stops in. It is the only picture this group shares between two of its sites.
    PHOTO.turtleOverReef,
  ],
  'hebat-allah-wreck': [
    // A beach club of wooden decks on a sandy shore with shallow turquoise water in front: Orange Bay itself,
    // where this day spends its hours ashore. Nothing in it is under water, and nothing in it is a ship.
    PHOTO.orangeBayBeach,
    // The white bow of a boat crossing a turquoise lagoon towards a low sandy shore: the photograph this
    // site's own day publishes.
    PHOTO.bowOverLagoon,
  ],
};

/**
 * Why each site shows fewer than three photographs of its own place: it has none at all. The note is written
 * for a reader of the tenant record, in each site's own words, and it never claims that a photograph shows the
 * place the site is named for.
 */
const SHORTFALL: Record<string, string> = {
  'daedalus-reef': 'No photograph of this reef could be made for the site, and the day it sells publishes a single one, so that one photograph is everything the site shows; it is a photograph of that day, not of the reef.',
  'el-ikhwa-islands': 'No photograph of these islands could be made for the site, so it shows two the client publishes of the bay its day works, and neither of them is a photograph of the islands.',
  'zabargad-island': 'No photograph of this island could be made for the site, so it shows two the client publishes of the bays its day stops in, and neither of them is a photograph of the island.',
  'hebat-allah-wreck': 'No photograph of this wreck exists to show, and none was made: the site shows two the client publishes of the day it sells, both taken at the surface, and neither is a photograph of the wreck or of any ship.',
};

const HURGHADA = { lat: 27.2579, lng: 33.8116 };
const MARSA_ALAM = { lat: 25.0676, lng: 34.879 };

/**
 * Places the two Marsa Alam sites never name: the fence batch B14 gave its own Marsa Alam coast sites, which
 * bars El Quseir along with the towns further off.
 */
const NOT_MARSA = /Gouna|Hurghada|Makadi|Sahl|Safaga|Soma Bay|Quseir|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Catherine|Cairo|Giza|Luxor|Aswan|Alexandria|Siwa|Bahariya|Fayoum|Saqqara|Sakkara|Memphis|Dahshur|Pyramid|Sphinx/i;
/**
 * Daedalus Reef's fence: the Marsa Alam fence with "Dolphin House" barred as well. The record this site sells
 * is published under a Dolphin House title, and that reef lies off Hurghada and is not this day's stop, so the
 * name may not reach any page here. It is the fence batch B09 gave its own Shaab Samadai sites, with El Quseir
 * added, because nothing on this site names that town.
 */
const NOT_SAMADAI = new RegExp(`${NOT_MARSA.source}|Dolphin House`, 'i');
/**
 * El Ikhwa's fence: the Marsa Alam fence with El Quseir allowed through, and nothing else changed. The islands
 * lie off that town and the facts give no other way to say where they are, so the site must be able to name it.
 */
const NOT_MARSA_OFFSHORE = new RegExp(NOT_MARSA.source.split('|').filter((place) => place !== 'Quseir').join('|'), 'i');
/**
 * The Hebat Allah's fence: the boats leave Hurghada for the water off it, exactly as the Hurghada boat site of
 * batch B09 and the reef sites of batches B13 to B15 do, so that fence is the fence here.
 */
const NOT_HURGHADA_BOATS = /Cairo|Giza|Luxor|Aswan|Sharm|Dahab|Nabq|Tiran|Ras Mohamed|Marsa Alam|Quseir|Ghalib|Safaga|Soma Bay|Gouna|Sahl|Makadi|Alexandria|Siwa|Bahariya|Fayoum|Sataya|Samadai/i;

/** The closing line every B11 to B15 site ends on, and every site here. */
const CLOSING = 'Every trip collects you from your hotel and brings you back, and each page says what its own price covers. Hold a place online and pay later, or ask the team first about the pickup time.';

/** B15C: three places in open sea and one wreck whose place is not published. */
export const B15C: NetworkBatch = {
  id: 'b15c',
  sites: [
    {
      slug: 'daedalus-reef',
      name: 'Daedalus Reef',
      listingPath: '/trips',
      domain: 'daedalusreefredsea.com',
      city: 'Marsa Alam',
      area: 'Marsa Alam',
      pickupDestination: 'marsa-alam',
      coordinates: MARSA_ALAM,
      currency: 'USD',
      slugPrefix: 'drf-',
      foreignPlaces: NOT_SAMADAI,
      tagline: 'A boat day eighty-nine kilometres short of it',
      description: `Daedalus Reef, which the lighthouse registers enter as Abu el-Kizan, is an isolated reef standing alone in open sea about ninety kilometres east of Marsa Alam. It is small and steep-sided: under a kilometre long, barely breaking the surface, with the ground falling away all round it, and the one fixed structure on it is a lighthouse. A light station was established there in 1863 and the tower standing today was built in 1931; it was refurbished in 1993 and is staffed. That tower is round stone, thirty metres tall, painted in black and white horizontal bands, and it shows three white flashes every twelve seconds in a one-then-two pattern, with a nominal range of fifteen nautical miles. Two sources publish the tower’s own position eleven metres apart, at 24.93285 N, 35.87025 E, and two more publish the reef body thirty-six metres apart, about three hundred and ten metres north-west of the light. The reef lies inside Egypt’s Red Sea marine protected areas, and nothing comes to it but a boat on a voyage of several days out of Port Ghalib or Marsa Alam.\n\nThe reef this boat day snorkels is Shaab Samadai, off Marsa Alam; its programme does not name Daedalus Reef, the lighthouse reef that stands alone in open sea some ninety kilometres further out to the south-east. One trip is sold here, and every hour of it is spent inshore: seven hours by boat, two guided sessions in the water at that reef, and a buffet lunch laid out between them. ${CLOSING}`,
      seo: {
        metaTitle: 'Daedalus Reef: the Shaab Samadai Boat Day',
        metaDescription: 'Seven hours by boat out of Marsa Alam: two guided sessions in the water at the reef of Shaab Samadai, a buffet lunch aboard and a car from your hotel.',
        keywords: ['daedalus reef abu el-kizan', 'lighthouse reef alone in open sea', 'shaab samadai boat day marsa alam', 'banded stone light tower red sea', 'marsa alam snorkelling day with lunch'],
      },
      theme: { primaryColor: '#10212B', secondaryColor: '#F2F5F7', accentColor: '#8A2B1F' },
      heroImages: [...SITE_PICTURES['daedalus-reef']],
      photoShortfall: SHORTFALL['daedalus-reef'],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/daedalus-reef/monogram.png',
      trips: [
        {
          path: 'seven-hours-at-the-horseshoe-reef',
          price: P.SHAAB_SAMADAI,
          title: 'Seven Hours at the Horseshoe Reef of Shaab Samadai',
          short: 'Seven hours afloat: two guided sessions in the water at the horseshoe reef of Shaab Samadai, with a buffet lunch set out between them.',
          description: 'The car comes to your Marsa Alam hotel, and the boat works out to Shaab Samadai, a horseshoe of reef whose sheltered middle spinner dolphins use through the daylight hours to rest. Two guided sessions in the water are what the day is built on, the first inside the lagoon and the second over the coral outside it, with the equipment handed out and a life jacket for anyone who wants one. What the programme names is that one reef, not Daedalus Reef, the lighthouse reef lying about ninety kilometres further out to the south-east; nothing on this day sails anywhere near it.\n\nA buffet lunch comes with soft drinks, served on board between the two sessions. Dolphins are wild animals in open water, so the crew watch for them and no one aboard promises a sighting. The national park fee, a wetsuit and a pickup from north or south of the town are each settled apart from this price, and a child is priced apart from an adult.',
          highlights: [
            'The horseshoe reef of Shaab Samadai',
            'A session inside the lagoon',
            'A second session over the coral',
            'A buffet lunch between the two',
          ],
          seo: {
            metaTitle: 'Seven Hours at the Horseshoe Reef of Shaab Samadai',
            metaDescription: 'A boat day out of Marsa Alam: a guided session inside the lagoon of Shaab Samadai, a second over the coral outside it, and a buffet lunch between them.',
          },
          images: [PHOTO.dolphinsAndSwimmer],
          imageAlts: [ALT.dolphinsAndSwimmer],
        },
      ],
    },
    {
      slug: 'el-ikhwa-islands',
      name: 'El Ikhwa Islands',
      listingPath: '/trips',
      domain: 'elikhwaislands.com',
      city: 'Marsa Alam',
      area: 'Marsa Alam',
      pickupDestination: 'marsa-alam',
      coordinates: MARSA_ALAM,
      currency: 'USD',
      slugPrefix: 'eik-',
      foreignPlaces: NOT_MARSA_OFFSHORE,
      tagline: 'The coastal bay day, ninety-one kilometres off',
      description: `El Ikhwa, read in English as The Brothers, is a pair of islands in open sea: Big Brother to the north and Little Brother about a kilometre to its south, with Al Ikhwān and Akhaween among the published forms of the name. Big Brother is a narrow rocky island roughly four hundred metres long that rises to the surface out of deep water, and the pair lie about sixty-five to sixty-seven kilometres off El Quseir, within Egypt’s Red Sea marine protected areas, and only a vessel several days out from the coast reaches them. Two sources publish the group’s position twenty-six metres apart, at 26.30684 N, 34.85562 E; no coordinate is given here for the lighthouse itself, because the published figures for that tower differ by two hundred and forty-eight metres. The British built that lighthouse on Big Brother in 1883, to mark the islands for the ships passing to and from the Suez Canal: unpainted stone, thirty-one metres tall, its light thirty-six metres above the sea and showing a single white flash every five seconds. It was renovated in 1993, it is staffed, and visitors are usually allowed up the tower. Its lamp still turns on the original Chance Brothers lens and clockwork drive, which the keepers wind by hand every four hours. The British cargo steamer Numidia, carrying railway material, struck the island in 1901; the crew and most of the cargo were taken off, and the ship was lost on its north point.\n\nThis boat day stays in the coastal bay of Marsa Mubarak. The Brothers are not in its programme: the two islands lie roughly ninety kilometres out from that bay, in open sea off El Quseir. The one trip sold here runs eight hours out of Marsa Alam: a guided session in the water on each side of the meal, over the coral of that bay. ${CLOSING}`,
      seo: {
        metaTitle: 'El Ikhwa Islands: the Marsa Mubarak Bay Day',
        metaDescription: 'Eight hours out of Marsa Alam in the bay at Marsa Mubarak: a guided session in the water on either side of the meal, with the gear and the park fees.',
        keywords: ['el ikhwa islands the brothers', 'big brother island lighthouse 1883', 'hand-wound lighthouse lens red sea', 'marsa mubarak turtle snorkelling day', 'islands in open sea off el quseir'],
      },
      theme: { primaryColor: '#1F2A33', secondaryColor: '#F6F1E8', accentColor: '#7A3E12' },
      heroImages: [...SITE_PICTURES['el-ikhwa-islands']],
      photoShortfall: SHORTFALL['el-ikhwa-islands'],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/el-ikhwa-islands/monogram.png',
      trips: [
        {
          path: 'a-day-in-the-bay-either-side-of-the-meal',
          price: P.MM_TURTLE,
          title: 'A Day in the Bay, a Session Either Side of the Meal',
          short: 'Eight hours out of Marsa Alam: a guided session in the water before the meal and a second after it, the gear and the park fees covered.',
          description: 'The transfer comes round at nine and runs you down to the boat, which works into the bay at Marsa Mubarak. A guided session in the water falls on each side of the meal, every minute of it over the coral and the fish of that bay, where green turtles graze the seagrass and dugongs come in to feed; the animals are wild and no boat ever promises one. What the programme names is Marsa Alam and that bay, not El Ikhwa, the two islands in open sea roughly ninety kilometres out from it; no boat on this day leaves the coast.\n\nInstructors, the snorkelling equipment and the national park fees all sit inside the price; tips and your own spending do not. A hotel at the north end of the town carries a surcharge, which is arranged with the team rather than booked on this page. Children are priced on their own.',
          highlights: [
            'A session in the water, then another',
            'The meal on board between them',
            'Instructors over the coral of the bay',
            'The national park fees inside the price',
          ],
          seo: {
            metaTitle: 'A Day in the Bay, a Session Either Side of the Meal',
            metaDescription: 'Eight hours from Marsa Alam at Marsa Mubarak: a guided session in the water before the meal and another after it, with the gear and the park fees.',
          },
          images: [PHOTO.turtleOverReef],
          imageAlts: [ALT.turtleOverReef],
        },
      ],
    },
    {
      slug: 'zabargad-island',
      name: 'Zabargad Island',
      listingPath: '/trips',
      domain: 'zabargadisland.com',
      city: 'Marsa Alam',
      area: 'Marsa Alam',
      pickupDestination: 'marsa-alam',
      coordinates: MARSA_ALAM,
      currency: 'USD',
      slugPrefix: 'zbg-',
      foreignPlaces: NOT_MARSA,
      tagline: 'Two hundred and fifty-seven kilometres off',
      description: `Zabargad is the Arabic word for peridot, the olive-green gem, and the island carries the stone’s name; in antiquity it was called Topazos, and on later charts it appears as St John’s Island. It is one of the few places on earth where upper-mantle rock stands above the sea: its peridotite is exposed in three separate hills, and the published studies read the island as a piece of the mantle beneath the Red Sea lifted to the surface. Two sources publish its position a hundred and twenty metres apart, at 23.61025 N, 36.19597 E, and a third, the mapped outline of the island, falls within two hundred and forty metres of both, which is a difference between centre points on an island some kilometres across rather than a disagreement. It lies about sixty kilometres from the Ras Banas peninsula, at the edge of the Red Sea’s central trough, and and a boat several days under way out of Port Ghalib or Marsa Alam is the only means to it, with the permit arranged by the licensed operator. Peridot was worked here in classical antiquity and the island is regarded as the gem’s first known source; the workings were then lost for centuries before nineteenth-century geologists went over the old ground again. The island is part of Elba National Park, and it has been closed to visitors for about a year at a time, after damage to the reefs and disturbance to breeding birds.\n\nThis day sails out of Port Ghalib to snorkel the inshore bays of Marsa Mubarak and Marsa Shona. Zabargad is not among its stops, and could not be: the island lies about two hundred and sixty kilometres south-east of Marsa Shona, far beyond a day boat’s reach. One trip is sold here: that coastal sailing, four and a half hours of it, with two guided stops in the water and an open buffet on deck. ${CLOSING}`,
      seo: {
        metaTitle: 'Zabargad Island: the Port Ghalib Sailing Day',
        metaDescription: 'A sailing day out of Port Ghalib, four and a half hours: guided stops in the water at Marsa Mubarak and then at Marsa Shona, and a buffet on deck.',
        keywords: ['zabargad island peridot', 'upper mantle rock above the sea', 'st johns island topazos', 'port ghalib sailing boat snorkelling', 'elba national park red sea island'],
      },
      theme: { primaryColor: '#22281F', secondaryColor: '#F4F2EA', accentColor: '#1F4F2E' },
      heroImages: [...SITE_PICTURES['zabargad-island']],
      photoShortfall: SHORTFALL['zabargad-island'],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/zabargad-island/monogram.png',
      trips: [
        {
          path: 'four-and-a-half-hours-under-sail',
          price: P.MM_SAILING,
          title: 'Four and a Half Hours Under Sail, Two Bays',
          short: 'A half day under sail from the marina: three quarters of an hour in the water at one bay, as long again at the next, and an open buffet on deck.',
          description: 'The boat leaves the marina twice a day, and the sailing you want is chosen at booking; a shared bus runs down from your Marsa Alam hotel about an hour and a half beforehand. Half an hour or so of sailing brings the first of the two bays, where three quarters of an hour goes to a guided stop in the water, and as long again follows at the second. What the programme names is Port Ghalib and those two bays, not Zabargad, the island of the green stone lying about two hundred and sixty kilometres south-east of the further one; nothing of this day goes out to it.\n\nThe buffet is open and it is laid on deck, and fizzy drinks and tea go round all day long. Snorkelling gear sits outside this price and can be hired from the marina shops. Stand at the marina thirty minutes ahead of the sailing, with an ID card or a passport on you, and expect a child to carry a price of its own.',
          highlights: [
            'Three quarters of an hour in each bay',
            'A guide in the water at both stops',
            'An open buffet served on deck',
            'A boat each day and one after noon',
          ],
          seo: {
            metaTitle: 'Four and a Half Hours Under Sail, Two Bays',
            metaDescription: 'Under sail from the marina at Port Ghalib: three quarters of an hour in the water at each of two bays, and an open buffet laid out on deck.',
          },
          images: [PHOTO.snorkellerAndSails],
          imageAlts: [ALT.snorkellerAndSails],
        },
      ],
    },
    {
      slug: 'hebat-allah-wreck',
      name: 'M/V Hebat Allah',
      listingPath: '/trips',
      domain: 'hebatallahwreck.com',
      city: 'Hurghada',
      area: 'Hurghada',
      pickupDestination: 'hurghada',
      coordinates: HURGHADA,
      currency: 'USD',
      slugPrefix: 'hba-',
      foreignPlaces: NOT_HURGHADA_BOATS,
      tagline: 'A snorkelling yacht day, and no dive at all',
      description: `The Hebat Allah was a small coastal freighter of four hundred and ninety-four gross tons, built in France in 1985. It was sunk on purpose on 7 November 2004, in a joint undertaking of the Red Sea Diving Association, the Egyptian Navy and the Red Sea Governor, and opened to divers in December 2005; the organisations of record describe it as the first artificial reef made on purpose for diving in the Red Sea. The point of sinking it was to take pressure off the natural reefs by making a site away from established coral, and the ship was bought from its owner and cleaned of harmful substances before it went down. It was meant to settle at about thirty metres, a depth recreational divers can reach, and it came to rest upright on sand at about forty-six metres instead, its masts and superstructure reaching up to about twenty-five metres below the surface, so every dive on it is a decompression dive, made only by divers trained and equipped for that. In 2009 the Hurghada Environmental Protection and Conservation Association, Global Underwater Explorers Egypt and Colona Divers secured the wreck with mooring lines, earlier lines having been lost, and it serves as a research site for how reef life settles on a structure below thirty-five metres. It lies between Giftun island and Gota Abu Ramada, off Hurghada, but its position has never been published: no buoy marks it, it cannot be seen from the surface, and the published accounts say it can only be found by knowing coordinates that none of them gives.\n\nThis yacht day is spent snorkelling at Orange Bay, off Hurghada. The Hebat Allah is not in its programme, and no day sold here dives the wreck: it lies deeper than recreational diving allows, and because its position has never been published, how far the boat passes from it cannot be said. One trip is sold here, at two lengths: a breakfast buffet under way, time ashore on the island, and lunch on the longer of them. ${CLOSING}`,
      seo: {
        metaTitle: 'M/V Hebat Allah: an Orange Bay Yacht Day',
        metaDescription: 'A yacht day out of Hurghada at two lengths: a breakfast buffet under way, a stop or two in the water, time ashore at Orange Bay, and lunch on the longer.',
        keywords: ['hebat allah wreck hurghada', 'freighter sunk on purpose 2004', 'artificial reef made for diving', 'decompression dive at forty-six metres', 'orange bay yacht day from hurghada'],
      },
      theme: { primaryColor: '#1B2126', secondaryColor: '#EEF0F1', accentColor: '#6B2D5C' },
      heroImages: [...SITE_PICTURES['hebat-allah-wreck']],
      photoShortfall: SHORTFALL['hebat-allah-wreck'],
      logo: 'https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/hebat-allah-wreck/monogram.png',
      trips: [
        {
          path: 'a-short-day-ashore-or-a-long-one',
          price: P.ORANGE_YACHT,
          title: 'A Short Day Ashore at Orange Bay, or a Long One',
          short: 'One yacht at two lengths: breakfast and sixty minutes ashore on the island, or lunch too, a further stop in the water and a further hour there.',
          description: 'Which length you want is settled at booking. The shorter day brings a breakfast buffet, a single stop for snorkelling and sixty minutes ashore on the island; the longer puts lunch, one more stop and one more hour there on top of that. What the programme names is Orange Bay and the island it lies on, not the Hebat Allah, the freighter put on the sea floor off Hurghada in 2004, whose position has never been published; no day sold here dives it, and nothing on this one goes under the surface at all.\n\nBoth lengths carry the snorkelling equipment, the entry to the island and the marine tax, with a guide aboard and a second one for anyone who cannot swim. Towels, photographs taken under water and tips stay outside the price. Children carry a price of their own. The cars make their rounds of the hotels before the yacht goes at half past eight.',
          highlights: [
            'A shorter day or a longer one',
            'A breakfast buffet while under way',
            'Sixty minutes ashore, or twice that',
            'Lunch on the longer of the two',
          ],
          seo: {
            metaTitle: 'A Short Day Ashore at Orange Bay, or a Long One',
            metaDescription: 'One Hurghada yacht at two lengths: a breakfast buffet, time in the water and sixty minutes ashore, or lunch too and twice as long on the island.',
          },
          images: [PHOTO.bowOverLagoon],
          imageAlts: [ALT.bowOverLagoon],
        },
      ],
    },
  ],
};
