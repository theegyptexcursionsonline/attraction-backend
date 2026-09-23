import 'dotenv/config';
import mongoose from 'mongoose';
import { writeFile } from 'fs/promises';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { Destination } from '../models/Destination';
import { tenantPickupDestinationSlugs } from '../utils/pickupDestinations';
import { translationSourceTemplate } from '../services/attractionLocalization.service';
async function main() {
  const args = process.argv.slice(2); const value = (key: string) => args.includes(key) ? args[args.indexOf(key) + 1] : '';
  const slug = value('--tenant'), domain = value('--domain'), output = value('--out');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !domain || !output) throw new Error('Provide --tenant <slug> --domain <verified-domain> --out <new-file>');
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI; if (!uri) throw new Error('Database configuration is required');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  try {
    const tenant = await Tenant.findOne({ slug, customDomain: domain, status: 'active' }).lean(); if (!tenant) throw new Error('Active tenant/domain ownership did not match');
    const tours = []; const cities = new Set<string>();
    for await (const tour of Attraction.find({ tenantIds: tenant._id, status: 'active', archivedAt: { $exists: false }, trashedAt: { $exists: false } }).sort({ _id: 1 }).lean().cursor()) { if (!tour.updatedAt) throw new Error('A source tour has no version'); cities.add(tour.destination?.city); tours.push({ id: String(tour._id), slug: tour.slug, sourceUpdatedAt: tour.updatedAt.toISOString(), content: translationSourceTemplate(tour) }); }
    const destinations = []; for await (const destination of Destination.find({ isActive: true, $or: [{ name: { $in: [...cities] } }, { slug: { $in: tenantPickupDestinationSlugs(tenant as never) } }] }).sort({ _id: 1 }).lean().cursor()) destinations.push({ id: String(destination._id), slug: destination.slug, sourceUpdatedAt: destination.updatedAt, name: destination.name, country: destination.country, description: destination.description, shortDescription: destination.shortDescription, highlights: destination.highlights, bestTimeToVisit: destination.bestTimeToVisit, tags: destination.tags });
    await writeFile(output, JSON.stringify({ tenantId: String(tenant._id), tenantSlug: slug, domain, exportedAt: new Date().toISOString(), tours, destinations }, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ exported: true, tours: tours.length, destinations: destinations.length, databaseWrites: 0 }));
  } finally { await mongoose.disconnect(); }
}
main().catch(() => { console.error('Read-only translation export failed. Check tenant/domain, database access and destination file.'); process.exitCode = 1; });
