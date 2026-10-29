import { RATING_SITES, duplicateNames, planChildPrice, planRating, sameName } from '../scripts/fix-network-unbacked-ratings';

describe('the unbacked ratings of the two built sites the network queue moves', () => {
  it('names exactly the two sites, in the order the apply fence expects', () => {
    expect([...RATING_SITES]).toEqual(['safari-red-sea', 'pyramids-excursions']);
  });

  it('clears a rating and a count that no approved review backs, and keeps the figures it read for the journal', () => {
    expect(planRating('safari-red-sea', { slug: 'safari-red-sea-tour', title: 'Safari Red Sea', rating: 4.8, reviewCount: 98 }, 0)).toEqual({
      site: 'safari-red-sea', trip: 'safari-red-sea-tour', title: 'Safari Red Sea', before: { rating: 4.8, reviewCount: 98 },
    });
    // A count with no rating, or a rating with no count, is cleared the same way.
    expect(planRating('pyramids-excursions', { slug: 'a', rating: 0, reviewCount: 456 }, 0)?.before).toEqual({ rating: 0, reviewCount: 456 });
  });

  it('leaves a trip that approved reviews back, and a trip with nothing to clear', () => {
    expect(planRating('pyramids-excursions', { slug: 'b', rating: 4.8, reviewCount: 456 }, 3)).toBeNull();
    expect(planRating('pyramids-excursions', { slug: 'c', rating: 0, reviewCount: 0 }, 0)).toBeNull();
    expect(planRating('pyramids-excursions', { slug: 'd' }, 0)).toBeNull();
  });

  it('lists the trips sold twice under one name, and only those', () => {
    // The titles Pyramids Excursions published on 28 October 2026.
    const records = [
      ['private-half-day', 'Private Half Day Pyramids with Photographer'],
      ['giza-sakkara-memphis-full-day', 'Giza Pyramids Sakkara & Memphis Full Day'],
      ['pyramids-sakkara-dahshur-family', 'Pyramids Sakkara & Dahshur Family Trip'],
      ['half-day-giza-pyramid-5-hours', 'Half Day Giza Pyramid Tour 5 Hours'],
      ['pyramids-museum-tour-excursion', 'Pyramids and Museum Tour'],
      ['giza-sakkara-memphis-exc', 'Giza Pyramids Tour, Sakkara & Memphis Full Day'],
      ['pyramids-sakkara-dahshur-exc', 'Pyramids, Sakkara & Dahshur Family Trip'],
      ['half-day-giza-5hrs-exc', 'Half Day Giza Pyramid Tour (5 Hours)'],
      ['pyramids-museum-tour-exc', 'Pyramids and Museum Tour'],
      ['pyramids-of-giza-excursion', 'Pyramids of Giza Excursion'],
    ].map(([slug, title]) => ({ slug, title }));
    expect(duplicateNames(records)).toEqual([
      { name: 'giza pyramids sakkara memphis full day', trips: ['giza-sakkara-memphis-full-day', 'giza-sakkara-memphis-exc'] },
      { name: 'pyramids sakkara dahshur family trip', trips: ['pyramids-sakkara-dahshur-family', 'pyramids-sakkara-dahshur-exc'] },
      { name: 'half day giza pyramid 5 hours', trips: ['half-day-giza-pyramid-5-hours', 'half-day-giza-5hrs-exc'] },
      { name: 'pyramids museum', trips: ['pyramids-museum-tour-excursion', 'pyramids-museum-tour-exc'] },
    ]);
    expect(sameName('Pyramids of Giza Excursion')).not.toBe(sameName('Pyramids Excursions'));
  });

  it('proposes the record’s own child price for the adult option, and nothing where the record is not that shape', () => {
    const options = [{ id: 'adult', name: 'Adult', price: 75 }, { id: 'child', name: 'Child', price: 45 }];
    expect(planChildPrice('pyramids-excursions', { slug: 'private-pyramids-photographer-exc', pricingOptions: options })).toEqual({
      site: 'pyramids-excursions', trip: 'private-pyramids-photographer-exc', adultOption: 'adult', childOption: 'child', adultPrice: 75, childPrice: 45,
    });
    // Options that are not an adult and a child, a child option priced at or above the adult one, and an adult
    // option that already carries a child price are left alone.
    expect(planChildPrice('pyramids-excursions', { slug: 'a', pricingOptions: [{ id: 'pe1', name: 'Group Excursion', price: 25 }, { id: 'pe2', name: 'Private Excursion', price: 55 }] })).toBeNull();
    expect(planChildPrice('pyramids-excursions', { slug: 'b', pricingOptions: [{ id: 'adult', name: 'Adult', price: 40 }, { id: 'child', name: 'Child', price: 40 }] })).toBeNull();
    expect(planChildPrice('pyramids-excursions', { slug: 'c', pricingOptions: [{ id: 'adult', name: 'Adult', price: 40, childPrice: 24 }, { id: 'child', name: 'Child', price: 24 }] })).toBeNull();
  });
});
