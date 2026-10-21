/**
 * Trips for the three sites added on 22 October 2026 (Fox Safari Hurghada, Fox Safari Makadi Bay,
 * Power Safari Marsa Alam). Each trip names the Desert Fox Safari programme it is built on
 * (`source`): the seed copies that programme's structured facts (options, prices, departures,
 * extras, inclusions, schedule) at apply time. The words below are written per site, from those
 * facts only: no ratings, review counts, rankings or group-size claims, and no place a trip does
 * not go. Photos on the two Fox sites are the Fox family's own trip photos; Power Safari shows the
 * Desert Fox programme images until it sends its own.
 */
export type FamilySiteSlug = 'fox-safari-hurghada' | 'fox-safari-makadi-bay' | 'power-safari-marsa-alam';

export interface FamilySiteTrip {
  /** Slug of the Desert Fox Safari programme whose facts the trip copies. */
  source: string;
  /** Public address on the site (flat URL). */
  path: string;
  title: string;
  short: string;
  description: string;
  highlights: string[];
  seo: { metaTitle: string; metaDescription: string };
  images: string[];
  imageAlts: string[];
}

export const FAMILY_SITE_TRIPS: Record<FamilySiteSlug, FamilySiteTrip[]> = {
  "fox-safari-hurghada": [
    {
      "source": "desert-fox-super-safari-combo",
      "path": "super-safari",
      "title": "Super Safari: Quad Bike, Camel Ride and Bedouin BBQ Dinner",
      "short": "An afternoon into evening in the desert: quad biking, a camel ride to a Bedouin camp and a BBQ dinner with music.",
      "description": "Your driver collects you from your hotel in Hurghada and takes you out to the desert. After the safety briefing you ride a quad bike across the dunes, then swap to a camel for the ride to the Bedouin camp.\n\nThe evening ends at the camp with tea, a BBQ dinner with soft drinks and Bedouin music and dancing, before the drive back to your hotel. Choose an afternoon or a later departure.",
      "highlights": [
        "Quad biking, a camel ride and dinner in one trip",
        "BBQ dinner with soft drinks at a Bedouin camp",
        "Bedouin music and dancing at the camp",
        "Hotel pickup and drop-off in Hurghada"
      ],
      "seo": {
        "metaTitle": "Hurghada Super Safari: Quad, Camel & BBQ Dinner",
        "metaDescription": "Quad biking, a camel ride and a Bedouin BBQ dinner with music, with hotel pickup in Hurghada."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605141/attractions-network/tours/fox-safari-marsa-alam/upscaled/pdp22ui72lwcff8jgpfa.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602729/attractions-network/tours/fox-safari-marsa-alam/super-safari/ethnyqjsnmvfvd2hgcgg.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602727/attractions-network/tours/fox-safari-marsa-alam/super-safari/ahufiqe64p7fsudsp7nd.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602726/attractions-network/tours/fox-safari-marsa-alam/super-safari/ma6qmuuupapok63s3p8x.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602729/attractions-network/tours/fox-safari-marsa-alam/super-safari/vp0qj8d98mxpvwlhkr7a.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602729/attractions-network/tours/fox-safari-marsa-alam/super-safari/x0uyiel0pojdvlzkvhe5.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602727/attractions-network/tours/fox-safari-marsa-alam/super-safari/doxcsioxtmbupmiihftf.jpg"
      ],
      "imageAlts": [
        "Guests riding red quad bikes across the desert",
        "Guests with Bedouin camels on a Super Safari",
        "Spider cars driving across the desert",
        "A white 4x4 jeep crossing the desert below the mountains",
        "Open-buffet BBQ dinner at the desert camp",
        "Guests at the BBQ dinner in the desert camp",
        "Fire show in the desert camp at night"
      ]
    },
    {
      "source": "wild-desert-quad-atv-camel-bbq",
      "path": "quad-camel",
      "title": "Quad Bike and Camel Ride, with an Optional BBQ Dinner",
      "short": "Ride a quad bike across the dunes, then a camel; add a Bedouin BBQ dinner if you want to stay for the evening.",
      "description": "A desert trip with a choice of length. You ride a quad bike across the dunes with your guide, then change to a camel for a slower ride through the desert, with tea and water along the way.\n\nPick the three-hour quad and camel ride, the five-hour version with a BBQ dinner and a show at the camp, or a private trip for your group. Hotel pickup and drop-off are included.",
      "highlights": [
        "Quad bike and camel ride in one trip",
        "Optional BBQ dinner with a show",
        "Morning or afternoon departure",
        "Hotel pickup and drop-off"
      ],
      "seo": {
        "metaTitle": "Hurghada Quad Bike & Camel Ride, Optional BBQ",
        "metaDescription": "Quad biking and a camel ride in the desert from Hurghada, with an optional Bedouin BBQ dinner and hotel pickup."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605150/attractions-network/tours/fox-safari-marsa-alam/upscaled/yksq961ychyzx1n2vtac.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602740/attractions-network/tours/fox-safari-marsa-alam/desert-atv-adventure/hallxdvgzkegxkzxywqr.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602739/attractions-network/tours/fox-safari-marsa-alam/desert-atv-adventure/i4bfyoroiotzy04ejroz.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602739/attractions-network/tours/fox-safari-marsa-alam/desert-atv-adventure/pwjhb1ssnp2sck30hmri.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602739/attractions-network/tours/fox-safari-marsa-alam/desert-atv-adventure/xl0zmgxzqwz3o9ytgh4w.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602742/attractions-network/tours/fox-safari-marsa-alam/desert-atv-adventure/dhdv4zg1qm9zmpaa8ty7.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602740/attractions-network/tours/fox-safari-marsa-alam/desert-atv-adventure/n3bws4kafje18brzpstv.jpg"
      ],
      "imageAlts": [
        "A rider on a red quad bike in the desert",
        "A line of quad bikes on a desert track",
        "A quad rider wearing a helmet on the sand",
        "Guests cheering on their quad bikes",
        "A quad rider",
        "Quad bikes riding past desert shrubs",
        "Guests with Bedouin women baking bread in the village"
      ]
    },
    {
      "source": "wild-desert-jeep-quad-buggy-camel-dinner-show",
      "path": "jeep-safari",
      "title": "Jeep Safari with Quad, Buggy, Camel Ride and Dinner Show",
      "short": "A 4x4 jeep ride into the desert, then a quad bike, a buggy and a camel ride, with dinner and a show at the camp.",
      "description": "The trip that tries everything. A 4x4 jeep takes you into the desert, where you ride a quad bike, drive a buggy and finish with a camel ride to the camp.\n\nAt the camp there is tea, dinner and a show with belly dancing and a fire show. Choose the standard trip, or the longer one that stays on for stargazing.",
      "highlights": [
        "Jeep, quad bike, buggy and camel in one trip",
        "Dinner with belly dancing and a fire show",
        "Longer option with stargazing",
        "Hotel pickup and drop-off"
      ],
      "seo": {
        "metaTitle": "Hurghada Jeep Safari: Quad, Buggy, Camel & Dinner Show",
        "metaDescription": "A 4x4 jeep safari from Hurghada with quad biking, a buggy, a camel ride, dinner and a show, with hotel pickup."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605143/attractions-network/tours/fox-safari-marsa-alam/upscaled/ldgctnmzmyaibkqaasna.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602732/attractions-network/tours/fox-safari-marsa-alam/jeep-safari/vxzeesanyunht7e2ebzs.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602732/attractions-network/tours/fox-safari-marsa-alam/jeep-safari/nvxt68awl78q1ubnytzj.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602731/attractions-network/tours/fox-safari-marsa-alam/jeep-safari/wsvsre6xg88vq6uupspm.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602731/attractions-network/tours/fox-safari-marsa-alam/jeep-safari/darkrmzd9mf936izaace.jpg"
      ],
      "imageAlts": [
        "A white 4x4 safari jeep on a desert track",
        "A 4x4 jeep parked in the desert",
        "Jeep safari guests under the acacia tree",
        "A guest standing on the roof of a safari jeep at dusk",
        "A camel by the sea at the edge of the desert"
      ]
    },
    {
      "source": "desert-fox-sunset-quad-safari",
      "path": "sunset-quad",
      "title": "Sunset Quad Bike Safari with Bedouin Tea",
      "short": "An afternoon quad ride across the desert, a tea stop at a Bedouin village and the ride back as the sun goes down.",
      "description": "Leave in the afternoon and ride a quad bike with your guide across the dunes and open desert. Stop at a Bedouin village for tea, watch the sunset, and ride back as the light fades.\n\nRide your own quad or share a double quad with a partner. Helmet and goggles are provided, and hotel pickup and drop-off are included.",
      "highlights": [
        "Quad ride across the desert in the afternoon",
        "Tea stop at a Bedouin village",
        "Sunset in the desert",
        "Single or double quad"
      ],
      "seo": {
        "metaTitle": "Hurghada Sunset Quad Bike Safari with Bedouin Tea",
        "metaDescription": "An afternoon quad bike ride from Hurghada with a Bedouin village tea stop and the sunset, hotel pickup included."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605148/attractions-network/tours/fox-safari-marsa-alam/upscaled/zl63fk4spcgldspyj0ou.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602736/attractions-network/tours/fox-safari-marsa-alam/quad-sunset-bbq/nemvbdqzeujann0x8hei.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602736/attractions-network/tours/fox-safari-marsa-alam/quad-sunset-bbq/rwseokmmbo6ca2skc0qc.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602736/attractions-network/tours/fox-safari-marsa-alam/quad-sunset-bbq/bd5oivs4bltvzvddyv5j.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602738/attractions-network/tours/fox-safari-marsa-alam/quad-sunset-bbq/m8yzcagqcbfcmbksj7pm.jpg"
      ],
      "imageAlts": [
        "A group of guests cheering on red quad bikes",
        "Quad riders following the guide across the desert",
        "A quad rider in the desert with the Red Sea behind",
        "A quad rider on a desert track",
        "Guests on a camel ride with a Bedouin guide"
      ]
    },
    {
      "source": "desert-fox-morning-buggy-adventure",
      "path": "morning-buggy",
      "title": "Morning Dune Buggy Ride",
      "short": "Drive a dune buggy through the desert in the cool of the early morning.",
      "description": "Start early, before the heat. After a safety briefing you drive a dune buggy over desert tracks and dunes with your guide, with water, a helmet, goggles and a dust mask provided.\n\nDrive yourself or ride in the passenger seat, and add a Bedouin breakfast if you like. Pickup and drop-off at your hotel are included.",
      "highlights": [
        "Drive a dune buggy yourself",
        "Early start in the cooler morning",
        "Safety briefing, helmet and goggles",
        "Optional Bedouin breakfast"
      ],
      "seo": {
        "metaTitle": "Hurghada Morning Dune Buggy Ride",
        "metaDescription": "Drive a dune buggy through the desert from Hurghada in the early morning, with hotel pickup and safety gear."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605146/attractions-network/tours/fox-safari-marsa-alam/upscaled/yoz5t0mgrmlczq7g6lsd.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602733/attractions-network/tours/fox-safari-marsa-alam/buggy-spider/hkfg6gsdkmaai0296kj9.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602733/attractions-network/tours/fox-safari-marsa-alam/buggy-spider/d4nkoflvtexsyeevcxrm.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602733/attractions-network/tours/fox-safari-marsa-alam/buggy-spider/agti2fmkz4b8ripo8vqe.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602734/attractions-network/tours/fox-safari-marsa-alam/buggy-spider/zejy0hkr75wv2gumvasl.jpg"
      ],
      "imageAlts": [
        "A family in a spider car buggy in the desert",
        "Two guests driving a buggy between desert hills",
        "A four-seat family buggy on the sand",
        "Two buggies driving towards the camera in the desert",
        "Buggies on a desert track lined with palms"
      ]
    },
    {
      "source": "wild-desert-dune-buggy-optional-bbq",
      "path": "buggy-bbq",
      "title": "Dune Buggy Safari with an Optional BBQ Dinner",
      "short": "Two hours behind the wheel of a dune buggy, or stay on for a Bedouin BBQ dinner.",
      "description": "Take the wheel of a dune buggy and drive through sand dunes, open plains and rocky valleys with a co-pilot beside you. Safety gear and instruction come first.\n\nChoose the two-hour buggy drive, or the five-hour version with a Bedouin BBQ dinner. Tea, water and hotel pickup are included.",
      "highlights": [
        "Drive the buggy yourself with a co-pilot",
        "Dunes, open plains and rocky valleys",
        "Optional Bedouin BBQ dinner",
        "Hotel pickup and drop-off"
      ],
      "seo": {
        "metaTitle": "Hurghada Dune Buggy Safari, Optional BBQ Dinner",
        "metaDescription": "Drive a dune buggy in the desert from Hurghada for two hours, or add a Bedouin BBQ dinner. Hotel pickup included."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602723/attractions-network/tenant-heroes/fox-safari-marsa-alam/2/s88plny2hgesttfmy9ow.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602733/attractions-network/tours/fox-safari-marsa-alam/buggy-spider/agti2fmkz4b8ripo8vqe.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602733/attractions-network/tours/fox-safari-marsa-alam/buggy-spider/hkfg6gsdkmaai0296kj9.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602734/attractions-network/tours/fox-safari-marsa-alam/buggy-spider/zejy0hkr75wv2gumvasl.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602733/attractions-network/tours/fox-safari-marsa-alam/buggy-spider/d4nkoflvtexsyeevcxrm.jpg"
      ],
      "imageAlts": [
        "A buggy raising dust on a desert track",
        "Two buggies driving towards the camera in the desert",
        "Two guests driving a buggy between desert hills",
        "Buggies on a desert track lined with palms",
        "A four-seat family buggy on the sand"
      ]
    },
    {
      "source": "desert-fox-private-jeep-safari",
      "path": "private-jeep",
      "title": "Private 4x4 Jeep Safari",
      "short": "A private jeep with your own driver-guide, through canyons, dry riverbeds and dune fields.",
      "description": "Only your group in the jeep. Your driver-guide takes you off-road through desert canyons, dry riverbeds (wadis) and dune fields, stopping where you want for photos.\n\nThere is a private tea stop in the desert, with water and snacks on board. Add a desert picnic lunch or an extra hour if you wish. The price is for the jeep, for up to four people.",
      "highlights": [
        "Private jeep for up to four people",
        "Canyons, wadis and dune fields",
        "Private tea stop in the desert",
        "Flexible route and pace"
      ],
      "seo": {
        "metaTitle": "Private 4x4 Jeep Safari from Hurghada",
        "metaDescription": "A private 4x4 jeep with your own driver-guide through desert canyons and dunes, for up to four people."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602732/attractions-network/tours/fox-safari-marsa-alam/jeep-safari/vxzeesanyunht7e2ebzs.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605143/attractions-network/tours/fox-safari-marsa-alam/upscaled/ldgctnmzmyaibkqaasna.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602731/attractions-network/tours/fox-safari-marsa-alam/jeep-safari/wsvsre6xg88vq6uupspm.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602732/attractions-network/tours/fox-safari-marsa-alam/jeep-safari/nvxt68awl78q1ubnytzj.jpg"
      ],
      "imageAlts": [
        "A 4x4 jeep parked in the desert",
        "A white 4x4 safari jeep on a desert track",
        "A guest standing on the roof of a safari jeep at dusk",
        "Jeep safari guests under the acacia tree"
      ]
    },
    {
      "source": "desert-fox-camel-trek-sunset",
      "path": "camel-sunset",
      "title": "Camel Ride at Sunset with Bedouin Tea",
      "short": "A gentle camel ride over the dunes to a Bedouin camp for tea and the sunset.",
      "description": "See the desert at walking pace. Your camel carries you over the dunes to a Bedouin camp, where you drink fresh tea and hear about desert life as the sun sets over the mountains.\n\nThere is a child price for ages 4 to 11, and henna painting at the camp if you like. Hotel pickup and drop-off are included.",
      "highlights": [
        "Camel ride over the dunes",
        "Tea at a Bedouin camp",
        "Sunset over the mountains",
        "Child price for ages 4 to 11"
      ],
      "seo": {
        "metaTitle": "Hurghada Sunset Camel Ride with Bedouin Tea",
        "metaDescription": "A camel ride over the dunes to a Bedouin camp for tea and the sunset, with hotel pickup in Hurghada."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605153/attractions-network/tours/fox-safari-marsa-alam/upscaled/rzrblblfdrzjazf7bv6p.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602743/attractions-network/tours/fox-safari-marsa-alam/camel-ride/zkwucv9crja746us65yr.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602744/attractions-network/tours/fox-safari-marsa-alam/camel-ride/viaxaskzcw7mggtexr7o.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602743/attractions-network/tours/fox-safari-marsa-alam/camel-ride/nmglcylzwvvnxkhkijgt.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602744/attractions-network/tours/fox-safari-marsa-alam/camel-ride/pyh9rfy2qkzcb5kn2tm5.jpg"
      ],
      "imageAlts": [
        "Guests on camels led by Bedouin guides below a desert hill",
        "Two young riders on camels in the desert",
        "Guests waving from their camels with a Bedouin guide",
        "Two riders on camels by the sea with their guides",
        "A camel with a colourful Bedouin saddle"
      ]
    },
    {
      "source": "desert-fox-full-day-sahara-expedition",
      "path": "full-day-desert",
      "title": "Full-Day Desert Trip: Jeep, Camel, Quad, Sandboarding and BBQ",
      "short": "A whole day in the desert by 4x4 with a camel ride, quad biking, sandboarding, a Bedouin village and a sunset BBQ.",
      "description": "A full day out. You drive deep into the desert by 4x4, ride a camel across the plains, ride a quad bike over the dunes and try sandboarding, with a visit to a Bedouin village along the way.\n\nLunch and a BBQ dinner at sunset are included, with drinks through the day. The trip starts in the morning, and there is a child price for ages 6 to 12.",
      "highlights": [
        "Jeep, camel, quad bike and sandboarding",
        "Bedouin village visit",
        "Lunch and a BBQ dinner at sunset",
        "Starts in the morning"
      ],
      "seo": {
        "metaTitle": "Full-Day Desert Trip from Hurghada: Jeep, Quad & BBQ",
        "metaDescription": "A full day in the desert from Hurghada: jeep, camel ride, quad biking, sandboarding, a Bedouin village and a BBQ dinner."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605143/attractions-network/tours/fox-safari-marsa-alam/upscaled/ldgctnmzmyaibkqaasna.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602731/attractions-network/tours/fox-safari-marsa-alam/jeep-safari/wsvsre6xg88vq6uupspm.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602732/attractions-network/tours/fox-safari-marsa-alam/jeep-safari/vxzeesanyunht7e2ebzs.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602729/attractions-network/tours/fox-safari-marsa-alam/super-safari/ethnyqjsnmvfvd2hgcgg.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602729/attractions-network/tours/fox-safari-marsa-alam/super-safari/vp0qj8d98mxpvwlhkr7a.jpg"
      ],
      "imageAlts": [
        "A white 4x4 safari jeep on a desert track",
        "A guest standing on the roof of a safari jeep at dusk",
        "A 4x4 jeep parked in the desert",
        "Guests with Bedouin camels on a Super Safari",
        "Open-buffet BBQ dinner at the desert camp"
      ]
    },
    {
      "source": "wild-desert-quad-atv-private-experience",
      "path": "private-quad",
      "title": "Private Quad Bike Ride with a Camel Ride (3 or 5 Hours)",
      "short": "A private quad ride with your own guide, who sets the route to your experience, plus a camel ride.",
      "description": "A private trip for your group with your own guide, who plans the route around your riding experience. Ride your quad over the dunes and finish with a camel ride.\n\nChoose three hours (quad and camel) or five hours, which adds more of the desert and dinner. Tea, safety gear and hotel pickup are included.",
      "highlights": [
        "Private guide and route",
        "Quad bike and camel ride",
        "3-hour or 5-hour option",
        "Hotel pickup and drop-off"
      ],
      "seo": {
        "metaTitle": "Private Quad Bike & Camel Ride from Hurghada",
        "metaDescription": "A private quad bike ride with your own guide and a camel ride, 3 or 5 hours, with hotel pickup in Hurghada."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602739/attractions-network/tours/fox-safari-marsa-alam/desert-atv-adventure/i4bfyoroiotzy04ejroz.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605150/attractions-network/tours/fox-safari-marsa-alam/upscaled/yksq961ychyzx1n2vtac.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602739/attractions-network/tours/fox-safari-marsa-alam/desert-atv-adventure/xl0zmgxzqwz3o9ytgh4w.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602742/attractions-network/tours/fox-safari-marsa-alam/desert-atv-adventure/dhdv4zg1qm9zmpaa8ty7.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602744/attractions-network/tours/fox-safari-marsa-alam/camel-ride/viaxaskzcw7mggtexr7o.jpg"
      ],
      "imageAlts": [
        "A quad rider wearing a helmet on the sand",
        "A rider on a red quad bike in the desert",
        "A quad rider",
        "Quad bikes riding past desert shrubs",
        "Guests waving from their camels with a Bedouin guide"
      ]
    }
  ],
  "fox-safari-makadi-bay": [
    {
      "source": "wild-desert-quad-atv-camel-bbq",
      "path": "quad-camel",
      "title": "Quad Bike and Camel Ride from Makadi Bay",
      "short": "Quad biking and a camel ride in the desert with pickup from your Makadi Bay hotel; stay on for a BBQ dinner if you like.",
      "description": "We collect you from your hotel in Makadi Bay and head into the desert. Ride a quad bike across the dunes with your guide, then a camel, with tea and water on the way.\n\nThree hours for the quad and camel ride, five hours if you add a BBQ dinner with a show, or book a private trip for your group.",
      "highlights": [
        "Pickup from your Makadi Bay hotel",
        "Quad bike and camel ride",
        "Optional BBQ dinner with a show",
        "Morning or afternoon departure"
      ],
      "seo": {
        "metaTitle": "Makadi Bay Quad Bike & Camel Ride, Optional BBQ",
        "metaDescription": "Quad biking and a camel ride in the desert with pickup from your Makadi Bay hotel, plus an optional BBQ dinner."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605148/attractions-network/tours/fox-safari-marsa-alam/upscaled/zl63fk4spcgldspyj0ou.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602736/attractions-network/tours/fox-safari-marsa-alam/quad-sunset-bbq/bd5oivs4bltvzvddyv5j.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602736/attractions-network/tours/fox-safari-marsa-alam/quad-sunset-bbq/nemvbdqzeujann0x8hei.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602738/attractions-network/tours/fox-safari-marsa-alam/quad-sunset-bbq/m8yzcagqcbfcmbksj7pm.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602737/attractions-network/tours/fox-safari-marsa-alam/quad-sunset-bbq/nx4basjxi7kuhhfvbiln.jpg"
      ],
      "imageAlts": [
        "A group of guests cheering on red quad bikes",
        "A quad rider on a desert track",
        "Quad riders following the guide across the desert",
        "Guests on a camel ride with a Bedouin guide",
        "Guests at the open-buffet dinner in the desert camp"
      ]
    },
    {
      "source": "desert-fox-super-safari-combo",
      "path": "super-safari",
      "title": "Super Safari from Makadi Bay: Quad, Camel and BBQ Dinner",
      "short": "Quad biking, a camel ride to a Bedouin camp and a BBQ dinner with music, with pickup from your hotel in Makadi Bay.",
      "description": "An afternoon and evening in the desert. Ride a quad bike over the dunes, then a camel to the Bedouin camp, where tea is waiting.\n\nDinner is a BBQ with soft drinks, with Bedouin music and dancing, and then we drive you back to your hotel in Makadi Bay. Children aged 6 to 12 have their own price and share a quad.",
      "highlights": [
        "Pickup from your Makadi Bay hotel",
        "Quad bike and camel ride",
        "BBQ dinner at a Bedouin camp",
        "Bedouin music and dancing"
      ],
      "seo": {
        "metaTitle": "Makadi Bay Super Safari: Quad, Camel & BBQ Dinner",
        "metaDescription": "Quad biking, a camel ride and a Bedouin BBQ dinner with music, with pickup from your Makadi Bay hotel."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602729/attractions-network/tours/fox-safari-marsa-alam/super-safari/ethnyqjsnmvfvd2hgcgg.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605141/attractions-network/tours/fox-safari-marsa-alam/upscaled/pdp22ui72lwcff8jgpfa.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602729/attractions-network/tours/fox-safari-marsa-alam/super-safari/x0uyiel0pojdvlzkvhe5.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602729/attractions-network/tours/fox-safari-marsa-alam/super-safari/vp0qj8d98mxpvwlhkr7a.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602727/attractions-network/tours/fox-safari-marsa-alam/super-safari/doxcsioxtmbupmiihftf.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602728/attractions-network/tours/fox-safari-marsa-alam/super-safari/db3vaxoqzbkcwgshpqgp.jpg"
      ],
      "imageAlts": [
        "Guests with Bedouin camels on a Super Safari",
        "Guests riding red quad bikes across the desert",
        "Guests at the BBQ dinner in the desert camp",
        "Open-buffet BBQ dinner at the desert camp",
        "Fire show in the desert camp at night",
        "A group of guests under an acacia tree in the Eastern Desert"
      ]
    },
    {
      "source": "desert-fox-camel-trek-sunset",
      "path": "camel-sunset",
      "title": "Sunset Camel Ride with Bedouin Tea",
      "short": "A calm afternoon for the whole family: a camel ride to a Bedouin camp for tea and the sunset.",
      "description": "A slower desert trip that suits children and grandparents alike. Ride a camel over the dunes to a Bedouin camp, drink fresh tea and watch the sun go down over the mountains.\n\nChildren aged 4 to 11 have their own price, and henna painting is offered at the camp. We collect you from your hotel in Makadi Bay.",
      "highlights": [
        "Camel ride over the dunes",
        "Tea at a Bedouin camp",
        "Child price for ages 4 to 11",
        "Pickup from your Makadi Bay hotel"
      ],
      "seo": {
        "metaTitle": "Makadi Bay Sunset Camel Ride with Bedouin Tea",
        "metaDescription": "A family camel ride to a Bedouin camp for tea and the sunset, with pickup from your Makadi Bay hotel."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602743/attractions-network/tours/fox-safari-marsa-alam/camel-ride/zkwucv9crja746us65yr.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605153/attractions-network/tours/fox-safari-marsa-alam/upscaled/rzrblblfdrzjazf7bv6p.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602744/attractions-network/tours/fox-safari-marsa-alam/camel-ride/viaxaskzcw7mggtexr7o.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602744/attractions-network/tours/fox-safari-marsa-alam/camel-ride/pyh9rfy2qkzcb5kn2tm5.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602743/attractions-network/tours/fox-safari-marsa-alam/camel-ride/nmglcylzwvvnxkhkijgt.jpg"
      ],
      "imageAlts": [
        "Two young riders on camels in the desert",
        "Guests on camels led by Bedouin guides below a desert hill",
        "Guests waving from their camels with a Bedouin guide",
        "A camel with a colourful Bedouin saddle",
        "Two riders on camels by the sea with their guides"
      ]
    },
    {
      "source": "desert-fox-morning-buggy-adventure",
      "path": "morning-buggy",
      "title": "Early Morning Dune Buggy Drive",
      "short": "Be out in the desert early and drive a dune buggy before the day warms up.",
      "description": "An early start from Makadi Bay for the coolest hours of the day. After a safety briefing you drive a dune buggy with your guide across desert tracks and dunes.\n\nHelmet, goggles, a dust mask and water are provided. Drive yourself or take the passenger seat, and add a Bedouin breakfast if you like.",
      "highlights": [
        "Drive a dune buggy yourself",
        "Early start in the cooler morning",
        "Helmet, goggles and dust mask provided",
        "Pickup from your Makadi Bay hotel"
      ],
      "seo": {
        "metaTitle": "Makadi Bay Morning Dune Buggy Drive",
        "metaDescription": "Drive a dune buggy in the desert in the early morning, with pickup from your Makadi Bay hotel and safety gear."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602734/attractions-network/tours/fox-safari-marsa-alam/buggy-spider/zejy0hkr75wv2gumvasl.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605146/attractions-network/tours/fox-safari-marsa-alam/upscaled/yoz5t0mgrmlczq7g6lsd.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602733/attractions-network/tours/fox-safari-marsa-alam/buggy-spider/hkfg6gsdkmaai0296kj9.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602733/attractions-network/tours/fox-safari-marsa-alam/buggy-spider/d4nkoflvtexsyeevcxrm.jpg"
      ],
      "imageAlts": [
        "Buggies on a desert track lined with palms",
        "A family in a spider car buggy in the desert",
        "Two guests driving a buggy between desert hills",
        "A four-seat family buggy on the sand"
      ]
    },
    {
      "source": "wild-desert-jeep-quad-buggy-camel-dinner-show",
      "path": "desert-combo",
      "title": "Desert Combo: Jeep, Quad, Buggy, Camel and Dinner Show",
      "short": "Jeep, quad bike, buggy and camel in one trip, with dinner and a fire show at the camp.",
      "description": "Four ways to cross the desert in one trip. A 4x4 jeep takes you out from Makadi Bay, then you ride a quad bike, drive a buggy and finish on a camel.\n\nAt the camp there is tea, dinner and a show with belly dancing and fire. A longer option stays on for stargazing.",
      "highlights": [
        "Jeep, quad bike, buggy and camel",
        "Dinner with belly dancing and a fire show",
        "Longer option with stargazing",
        "Pickup from your Makadi Bay hotel"
      ],
      "seo": {
        "metaTitle": "Makadi Bay Desert Combo: Jeep, Quad, Buggy & Camel",
        "metaDescription": "Jeep, quad bike, buggy and camel ride in one trip with dinner and a show, with pickup from your Makadi Bay hotel."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605143/attractions-network/tours/fox-safari-marsa-alam/upscaled/ldgctnmzmyaibkqaasna.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602732/attractions-network/tours/fox-safari-marsa-alam/jeep-safari/nvxt68awl78q1ubnytzj.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602732/attractions-network/tours/fox-safari-marsa-alam/jeep-safari/vxzeesanyunht7e2ebzs.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602727/attractions-network/tours/fox-safari-marsa-alam/super-safari/doxcsioxtmbupmiihftf.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602729/attractions-network/tours/fox-safari-marsa-alam/super-safari/vp0qj8d98mxpvwlhkr7a.jpg"
      ],
      "imageAlts": [
        "A white 4x4 safari jeep on a desert track",
        "Jeep safari guests under the acacia tree",
        "A 4x4 jeep parked in the desert",
        "Fire show in the desert camp at night",
        "Open-buffet BBQ dinner at the desert camp"
      ]
    },
    {
      "source": "desert-fox-sunset-quad-safari",
      "path": "sunset-quad",
      "title": "Afternoon Quad Ride to a Bedouin Village and the Sunset",
      "short": "Ride a quad bike to a Bedouin village for tea, then watch the sun set over the desert.",
      "description": "An afternoon on a quad bike with your guide, over dunes and open desert to a Bedouin village for tea. You watch the sunset there and ride back as the light goes.\n\nTake a single quad or share a double quad. Helmet and goggles are provided, and pickup from your Makadi Bay hotel is included.",
      "highlights": [
        "Quad ride to a Bedouin village",
        "Sunset in the desert",
        "Single or double quad",
        "Pickup from your Makadi Bay hotel"
      ],
      "seo": {
        "metaTitle": "Makadi Bay Sunset Quad Ride to a Bedouin Village",
        "metaDescription": "An afternoon quad bike ride to a Bedouin village for tea and the sunset, with pickup from your Makadi Bay hotel."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602736/attractions-network/tours/fox-safari-marsa-alam/quad-sunset-bbq/rwseokmmbo6ca2skc0qc.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602736/attractions-network/tours/fox-safari-marsa-alam/quad-sunset-bbq/nemvbdqzeujann0x8hei.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602736/attractions-network/tours/fox-safari-marsa-alam/quad-sunset-bbq/bd5oivs4bltvzvddyv5j.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605148/attractions-network/tours/fox-safari-marsa-alam/upscaled/zl63fk4spcgldspyj0ou.jpg"
      ],
      "imageAlts": [
        "A quad rider in the desert with the Red Sea behind",
        "Quad riders following the guide across the desert",
        "A quad rider on a desert track",
        "A group of guests cheering on red quad bikes"
      ]
    },
    {
      "source": "desert-fox-private-jeep-safari",
      "path": "private-jeep",
      "title": "Private Jeep Safari for Your Group",
      "short": "Your own jeep and driver-guide for canyons, dry riverbeds and dunes, at your pace.",
      "description": "A private trip for up to four people. Your driver-guide takes you off-road through desert canyons, wadis and dune fields and stops wherever you want photos.\n\nThere is a private tea stop in the desert, and you can add a picnic lunch or an extra hour. We pick you up from your hotel in Makadi Bay.",
      "highlights": [
        "Private jeep for up to four people",
        "Canyons, wadis and dunes",
        "Private tea stop",
        "Pickup from your Makadi Bay hotel"
      ],
      "seo": {
        "metaTitle": "Private Jeep Safari from Makadi Bay",
        "metaDescription": "A private 4x4 jeep and driver-guide for up to four people, through desert canyons and dunes from Makadi Bay."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602731/attractions-network/tours/fox-safari-marsa-alam/jeep-safari/wsvsre6xg88vq6uupspm.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602732/attractions-network/tours/fox-safari-marsa-alam/jeep-safari/vxzeesanyunht7e2ebzs.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605143/attractions-network/tours/fox-safari-marsa-alam/upscaled/ldgctnmzmyaibkqaasna.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602731/attractions-network/tours/fox-safari-marsa-alam/jeep-safari/darkrmzd9mf936izaace.jpg"
      ],
      "imageAlts": [
        "A guest standing on the roof of a safari jeep at dusk",
        "A 4x4 jeep parked in the desert",
        "A white 4x4 safari jeep on a desert track",
        "A camel by the sea at the edge of the desert"
      ]
    },
    {
      "source": "wild-desert-quad-atv-private-experience",
      "path": "private-quad",
      "title": "Private Quad Bike Trip with Camel Ride",
      "short": "A private quad trip with your own guide and a camel ride, three or five hours.",
      "description": "A private trip for your group, with a guide who sets the route to your riding experience. Ride your quad over the dunes, then take a camel ride.\n\nChoose three hours, or five hours with more desert and dinner. Tea, safety gear and pickup from your Makadi Bay hotel are included.",
      "highlights": [
        "Private guide and route",
        "Quad bike and camel ride",
        "3-hour or 5-hour option",
        "Pickup from your Makadi Bay hotel"
      ],
      "seo": {
        "metaTitle": "Private Quad Bike & Camel Ride from Makadi Bay",
        "metaDescription": "A private quad bike trip with your own guide and a camel ride, 3 or 5 hours, from your Makadi Bay hotel."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602739/attractions-network/tours/fox-safari-marsa-alam/desert-atv-adventure/xl0zmgxzqwz3o9ytgh4w.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602739/attractions-network/tours/fox-safari-marsa-alam/desert-atv-adventure/i4bfyoroiotzy04ejroz.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605150/attractions-network/tours/fox-safari-marsa-alam/upscaled/yksq961ychyzx1n2vtac.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602739/attractions-network/tours/fox-safari-marsa-alam/desert-atv-adventure/pwjhb1ssnp2sck30hmri.jpg",
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1792602743/attractions-network/tours/fox-safari-marsa-alam/camel-ride/nmglcylzwvvnxkhkijgt.jpg"
      ],
      "imageAlts": [
        "A quad rider",
        "A quad rider wearing a helmet on the sand",
        "A rider on a red quad bike in the desert",
        "Guests cheering on their quad bikes",
        "Two riders on camels by the sea with their guides"
      ]
    }
  ],
  "power-safari-marsa-alam": [
    {
      "source": "desert-fox-super-safari-combo",
      "path": "super-safari",
      "title": "Super Safari: Quad, Camel and Bedouin BBQ",
      "short": "Quad bikes, a camel ride to a Bedouin camp and a BBQ dinner with music, with pickup from your hotel in Marsa Alam.",
      "description": "Pickup from your hotel in Marsa Alam and out to the desert. Safety briefing, then quad bikes across the dunes before you switch to a camel for the ride into camp.\n\nTea, a BBQ dinner with soft drinks and Bedouin music and dancing, then back to your hotel. Ask us for dates and prices.",
      "highlights": [
        "Quad bike and camel ride",
        "BBQ dinner at a Bedouin camp",
        "Bedouin music and dancing",
        "Pickup from your Marsa Alam hotel"
      ],
      "seo": {
        "metaTitle": "Marsa Alam Super Safari: Quad, Camel & BBQ | Power Safari",
        "metaDescription": "Quad bikes, a camel ride and a Bedouin BBQ dinner with music, with pickup from your Marsa Alam hotel."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1784643098/attractions-network/attractions-network/tours/desert-fox-safari/kjzyw3xrzhryupn11rlg.jpg"
      ],
      "imageAlts": [
        "Quad bikes and a buggy at a desert camp at dusk"
      ]
    },
    {
      "source": "wild-desert-quad-atv-camel-bbq",
      "path": "quad-camel",
      "title": "Quad and Camel Ride, Optional BBQ",
      "short": "Ride a quad bike over the dunes and a camel through the desert; stay for a BBQ dinner if you like.",
      "description": "Quad first: ride across the dunes with your guide. Then a camel for the slower part of the desert, with tea and water.\n\nAsk for the short ride or the evening version with a BBQ dinner and a show. Pickup from your Marsa Alam hotel is included.",
      "highlights": [
        "Quad bike and camel ride",
        "Evening version with a BBQ dinner",
        "Tea and water on the way",
        "Pickup from your Marsa Alam hotel"
      ],
      "seo": {
        "metaTitle": "Marsa Alam Quad & Camel Ride, Optional BBQ | Power Safari",
        "metaDescription": "Quad biking and a camel ride in the Marsa Alam desert, with an optional BBQ dinner and hotel pickup."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1776012545/attractions-network/tours/wild-desert-quad-atv-camel-bbq/k9ogpfjsgpwsxj0uwa5k.jpg"
      ],
      "imageAlts": [
        "A quad rider in the desert with a camel caravan behind"
      ]
    },
    {
      "source": "wild-desert-jeep-quad-buggy-camel-dinner-show",
      "path": "jeep-combo",
      "title": "Jeep, Quad, Buggy and Camel with Dinner Show",
      "short": "Every way to cross the desert in one trip, then dinner and a fire show at camp.",
      "description": "A 4x4 jeep takes you in, then you ride a quad, drive a buggy and finish on a camel.\n\nAt camp: tea, dinner and a show with belly dancing and fire. Pickup from your Marsa Alam hotel is included; ask about staying on for stargazing.",
      "highlights": [
        "Jeep, quad, buggy and camel",
        "Dinner with a fire show",
        "Tea at the camp",
        "Pickup from your Marsa Alam hotel"
      ],
      "seo": {
        "metaTitle": "Marsa Alam Jeep, Quad, Buggy & Camel Trip | Power Safari",
        "metaDescription": "Jeep, quad bike, buggy and camel ride in one desert trip from Marsa Alam, with dinner and a fire show."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1776012607/attractions-network/tours/wild-desert-jeep-quad-buggy-camel-dinner-show/zfpvclnaga4bbbw0qkzv.jpg"
      ],
      "imageAlts": [
        "A jeep, a quad bike, a buggy and a camel in the desert"
      ]
    },
    {
      "source": "desert-fox-sunset-quad-safari",
      "path": "sunset-quad",
      "title": "Sunset Quad Ride with Bedouin Tea",
      "short": "An afternoon quad ride to a Bedouin village for tea and the sunset.",
      "description": "Afternoon departure. Ride your quad with the guide across dunes and open desert to a Bedouin village for tea, then watch the sunset and ride back.\n\nHelmet and goggles provided, pickup from your Marsa Alam hotel included.",
      "highlights": [
        "Quad ride across the desert",
        "Bedouin village tea stop",
        "Sunset in the desert",
        "Helmet and goggles provided"
      ],
      "seo": {
        "metaTitle": "Marsa Alam Sunset Quad Ride with Bedouin Tea | Power Safari",
        "metaDescription": "An afternoon quad bike ride to a Bedouin village for tea and the sunset, with pickup from your Marsa Alam hotel."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1784643124/attractions-network/attractions-network/tours/desert-fox-safari/o2le55k9hnuqlf9prtaa.jpg"
      ],
      "imageAlts": [
        "Quad riders crossing the desert at sunset"
      ]
    },
    {
      "source": "wild-desert-dune-buggy-optional-bbq",
      "path": "buggy-bbq",
      "title": "Dune Buggy Drive, Optional BBQ",
      "short": "Drive a dune buggy through dunes, plains and rocky valleys; add a BBQ dinner to stay for the evening.",
      "description": "You drive, your co-pilot rides beside you. Dunes, open plains and rocky valleys, after a safety briefing and with full safety gear.\n\nAsk for the short drive or the longer evening with a Bedouin BBQ dinner. Tea, water and pickup from your Marsa Alam hotel are included.",
      "highlights": [
        "Drive the buggy yourself",
        "Dunes, plains and rocky valleys",
        "Optional Bedouin BBQ dinner",
        "Pickup from your Marsa Alam hotel"
      ],
      "seo": {
        "metaTitle": "Marsa Alam Dune Buggy Drive, Optional BBQ | Power Safari",
        "metaDescription": "Drive a dune buggy through the Marsa Alam desert, with an optional Bedouin BBQ dinner and hotel pickup."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1784643065/attractions-network/attractions-network/tours/desert-fox-safari/jf4qfxcjwl8kndpwuzyc.jpg"
      ],
      "imageAlts": [
        "A dune buggy kicking up sand in the desert"
      ]
    },
    {
      "source": "desert-fox-morning-buggy-adventure",
      "path": "morning-buggy",
      "title": "Morning Buggy Run",
      "short": "An early buggy drive through the desert, before the heat.",
      "description": "Out early for the coolest hours. Safety briefing, then you drive a dune buggy with your guide over desert tracks and dunes.\n\nHelmet, goggles, a dust mask and water provided; drive or ride as passenger. Pickup from your Marsa Alam hotel is included.",
      "highlights": [
        "Drive a dune buggy",
        "Early, cooler start",
        "Helmet, goggles and dust mask",
        "Pickup from your Marsa Alam hotel"
      ],
      "seo": {
        "metaTitle": "Marsa Alam Morning Dune Buggy Run | Power Safari",
        "metaDescription": "An early dune buggy drive through the Marsa Alam desert, with safety gear and pickup from your hotel."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1776012607/attractions-network/tours/wild-desert-jeep-quad-buggy-camel-dinner-show/zfpvclnaga4bbbw0qkzv.jpg"
      ],
      "imageAlts": [
        "A jeep, a quad bike, a buggy and a camel in the desert"
      ]
    },
    {
      "source": "desert-fox-camel-trek-sunset",
      "path": "camel-sunset",
      "title": "Sunset Camel Ride",
      "short": "A slow camel ride over the dunes to a Bedouin camp for tea and the sunset.",
      "description": "Swap the engine for a camel. Ride over the dunes to a Bedouin camp for fresh tea and the sunset over the mountains.\n\nPickup from your Marsa Alam hotel is included. Ask us for dates and prices.",
      "highlights": [
        "Camel ride over the dunes",
        "Tea at a Bedouin camp",
        "Sunset over the mountains",
        "Pickup from your Marsa Alam hotel"
      ],
      "seo": {
        "metaTitle": "Marsa Alam Sunset Camel Ride | Power Safari",
        "metaDescription": "A camel ride over the dunes to a Bedouin camp for tea and the sunset, with pickup from your Marsa Alam hotel."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1784643035/attractions-network/attractions-network/tours/desert-fox-safari/vo7zvtyuinharwaw6ymg.jpg"
      ],
      "imageAlts": [
        "A camel caravan on a dune at sunset"
      ]
    },
    {
      "source": "desert-fox-private-jeep-safari",
      "path": "private-jeep",
      "title": "Private 4x4 Jeep Safari",
      "short": "Your own jeep and driver-guide through canyons, wadis and dunes.",
      "description": "Private jeep, up to four people. Your driver-guide goes off-road through desert canyons, dry riverbeds and dune fields and stops where you want.\n\nPrivate tea stop in the desert. Pickup from your Marsa Alam hotel is included.",
      "highlights": [
        "Private jeep for up to four",
        "Canyons, wadis and dunes",
        "Private tea stop",
        "Pickup from your Marsa Alam hotel"
      ],
      "seo": {
        "metaTitle": "Private 4x4 Jeep Safari in Marsa Alam | Power Safari",
        "metaDescription": "A private 4x4 jeep and driver-guide for up to four people through desert canyons and dunes from Marsa Alam."
      },
      "images": [
        "https://res.cloudinary.com/dm3sxllch/image/upload/v1784642982/attractions-network/attractions-network/tours/desert-fox-safari/zlriahsqmadekwi7mcsg.jpg"
      ],
      "imageAlts": [
        "A 4x4 jeep driving through a rocky desert valley"
      ]
    }
  ]
};

export const FAMILY_SITE_HEROES: Record<FamilySiteSlug, string[]> = {
  "fox-safari-hurghada": [
    "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605143/attractions-network/tours/fox-safari-marsa-alam/upscaled/ldgctnmzmyaibkqaasna.jpg",
    "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605150/attractions-network/tours/fox-safari-marsa-alam/upscaled/yksq961ychyzx1n2vtac.jpg",
    "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605153/attractions-network/tours/fox-safari-marsa-alam/upscaled/rzrblblfdrzjazf7bv6p.jpg"
  ],
  "fox-safari-makadi-bay": [
    "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605148/attractions-network/tours/fox-safari-marsa-alam/upscaled/zl63fk4spcgldspyj0ou.jpg",
    "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605153/attractions-network/tours/fox-safari-marsa-alam/upscaled/rzrblblfdrzjazf7bv6p.jpg",
    "https://res.cloudinary.com/dm3sxllch/image/upload/v1792605146/attractions-network/tours/fox-safari-marsa-alam/upscaled/yoz5t0mgrmlczq7g6lsd.jpg"
  ],
  "power-safari-marsa-alam": [
    "https://res.cloudinary.com/dm3sxllch/image/upload/v1784643124/attractions-network/attractions-network/tours/desert-fox-safari/o2le55k9hnuqlf9prtaa.jpg",
    "https://res.cloudinary.com/dm3sxllch/image/upload/v1784643098/attractions-network/attractions-network/tours/desert-fox-safari/kjzyw3xrzhryupn11rlg.jpg",
    "https://res.cloudinary.com/dm3sxllch/image/upload/v1784643065/attractions-network/attractions-network/tours/desert-fox-safari/jf4qfxcjwl8kndpwuzyc.jpg"
  ]
};

/** Initials monograms in each site's colours, shown until the site sends its own logo. */
export const FAMILY_SITE_LOGOS: Record<FamilySiteSlug, string> = {
  'fox-safari-hurghada': 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792612252/attractions-network/tenant-logos/fox-safari-hurghada/monogram.png',
  'fox-safari-makadi-bay': 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792612253/attractions-network/tenant-logos/fox-safari-makadi-bay/monogram.png',
  'power-safari-marsa-alam': 'https://res.cloudinary.com/dm3sxllch/image/upload/v1792612254/attractions-network/tenant-logos/power-safari-marsa-alam/monogram.png',
};
