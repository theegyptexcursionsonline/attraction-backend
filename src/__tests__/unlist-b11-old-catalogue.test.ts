import fs from 'fs';
import path from 'path';
import { decide, SITES, type Listing } from '../scripts/unlist-b11-old-catalogue';
import { B11_EXISTING } from '../scripts/seed-network-b11-existing';

const listing = (over: Partial<Listing> = {}): Listing => ({
  slug: 'camel-riding-hurghada',
  title: 'Camel Riding in Hurghada Desert',
  ownerSlug: 'cairo-tour-from-hurghada',
  listedOn: ['cairo-tour-from-hurghada', 'luxor-tour-from-hurghada', 'ctoureg'],
  bookings: 0,
  bookingStatuses: [],
  rating: 4.5,
  reviewCount: 156,
  ...over,
});

const SITE = { slug: 'luxor-tour-from-hurghada', clientTrips: ['lth-shared-day-in-luxor', 'lth-private-day-in-luxor'] };

describe('taking the old catalogue off the four B11 sites', () => {
  it('is the four sites of batch B11, with the trips that batch sells', () => {
    expect(SITES.map((site) => site.slug)).toEqual([
      'cairo-tour-from-hurghada', 'luxor-tour-from-hurghada', 'hurghada-snorkeling', 'cairo-night-cruise',
    ]);
    // Taken from the batch itself, so the two can never drift apart, and makadi-bay-safari is in neither.
    expect(SITES.map((site) => site.clientTrips)).toEqual(
      B11_EXISTING.sites.map((site) => site.trips.map((trip) => `${site.slugPrefix}${trip.path}`)),
    );
    expect(SITES.reduce((total, site) => total + site.clientTrips.length, 0)).toBe(15);
    expect(SITES.map((site) => site.slug)).not.toContain('makadi-bay-safari');
  });

  it('never touches one of the client\'s own trips', () => {
    for (const slug of SITE.clientTrips) expect(decide(SITE, listing({ slug, listedOn: [SITE.slug, 'other'] }))).toBeNull();
    // Even one that would otherwise qualify in every way is left alone because it is what the site sells.
    expect(decide(SITE, listing({ slug: 'lth-shared-day-in-luxor', bookings: 0, listedOn: [SITE.slug, 'ctoureg'] }))).toBeNull();
  });

  it('keeps a record with a booking of any status, whoever owns it', () => {
    for (const status of ['pending', 'confirmed', 'cancelled', 'completed', 'refunded']) {
      const verdict = decide(SITE, listing({ bookings: 1, bookingStatuses: [status] }))!;
      expect(verdict.action).toBe('keep');
      expect((verdict as { reason: string }).reason).toMatch(new RegExp(`1 booking\\(s\\) \\(${status}\\)`));
    }
    // A cancelled booking counts too: the rule is any status, so nothing a guest booked leaves a site.
    expect(decide(SITE, listing({ bookings: 3, bookingStatuses: ['cancelled'] }))!.action).toBe('keep');
  });

  it('keeps a record that would be left listed nowhere, and never archives it', () => {
    const verdict = decide(SITE, listing({ listedOn: [SITE.slug] }))!;
    expect(verdict.action).toBe('keep');
    expect((verdict as { reason: string }).reason).toMatch(/only site that lists it/);
    // The same record listed on one other site is unlisted, and the plan says where it still lives.
    const other = decide(SITE, listing({ listedOn: [SITE.slug, 'cairo-tour-from-hurghada'] }))!;
    expect(other).toEqual({ slug: 'camel-riding-hurghada', action: 'unlist', stillListedOn: ['cairo-tour-from-hurghada'] });
  });

  it('a booking outranks every other reason', () => {
    // Listed only here AND booked: still kept, and the booking is the reason given.
    const verdict = decide(SITE, listing({ listedOn: [SITE.slug], bookings: 1, bookingStatuses: ['confirmed'] }))!;
    expect(verdict.action).toBe('keep');
    expect((verdict as { reason: string }).reason).toMatch(/booking/);
  });

  it('unlists a record a sibling owns, and leaves the owner\'s own listing alone', () => {
    // cairo-night-cruise owns twelve records its siblings list; taking one off a sibling leaves the owner listed.
    const verdict = decide(SITE, listing({ slug: 'cairo-night-cruise', ownerSlug: 'cairo-night-cruise', listedOn: [SITE.slug, 'cairo-night-cruise', 'ctoureg'] }))!;
    expect(verdict).toEqual({ slug: 'cairo-night-cruise', action: 'unlist', stillListedOn: ['cairo-night-cruise', 'ctoureg'] });
    // And a record this very site owns is unlisted from it only while some other site still lists it.
    expect(decide(SITE, listing({ ownerSlug: SITE.slug, listedOn: [SITE.slug, 'ctoureg'] }))!.action).toBe('unlist');
    expect(decide(SITE, listing({ ownerSlug: SITE.slug, listedOn: [SITE.slug] }))!.action).toBe('keep');
  });

  it('writes nothing but a pull from tenantIds, and nothing to a tenant', () => {
    const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'unlist-b11-old-catalogue.ts'), 'utf8');
    // The only mutation in the file, apart from the restore's matching $addToSet.
    expect(script).toMatch(/\$pull: \{ tenantIds: plan\.tenantId \}/);
    expect(script).toMatch(/\$addToSet: \{ tenantIds: journal\.tenantId \}/);
    // No other mutation operator anywhere, and no archive: the words "archived" that remain are the prose
    // explaining that nothing is, and the `archived: 'none'` the applied report prints.
    expect(script).not.toMatch(/\$set\b|\$unset\b|\$push\b|\$addFields\b/);
    expect(script).not.toMatch(/status: 'archived'|statusBeforeArchive|archivedAt/);
    expect(script).not.toMatch(/Attraction\.(?:deleteOne|deleteMany|findOneAndDelete|replaceOne|create|insertMany)/);
    expect(script).not.toMatch(/Tenant\.(?:updateOne|updateMany|findOneAndUpdate|create|insertMany|replaceOne|deleteOne|deleteMany|findOneAndDelete|bulkWrite)/);
    // Both refusals are checked again at the write, not only when the plan was made.
    const applyBody = script.slice(script.indexOf('async function apply('), script.indexOf('async function restore('));
    expect(applyBody).toMatch(/Booking\.countDocuments\(\{ attractionId: live\._id \}\)/);
    expect(applyBody).toMatch(/if \(!others\.length\) throw new Error/);
    // The write is fenced on the record still being listed here, so a concurrent change cannot be overwritten.
    expect(applyBody).toMatch(/Attraction\.updateOne\(\{ slug: entry\.slug, tenantIds: plan\.tenantId \}/);
    // Apply is fenced, and refuses while namespace writes are paused.
    expect(applyBody).toMatch(/urlNamespaceReadiness\(\)\.writesReady/);
    expect(script).toMatch(/confirmedSites\(\)/);
  });
});
