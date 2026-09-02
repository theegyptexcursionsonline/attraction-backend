/**
 * Attach the source-published child-age notice to Makadi Excursions horse
 * riding products without changing any other tenant or tour field.
 *
 * Dry run:
 *   npm run set:makadi-participant-requirements
 * Apply:
 *   npm run set:makadi-participant-requirements -- --apply --confirm-tenant=makadi-excursions
 */

const TENANT_SLUG = 'makadi-excursions';
const REQUIREMENT = 'Children must be 12 or older';

export const MAKADI_PARTICIPANT_REQUIREMENTS = [
  {
    slug: 'makadi-excursions-makadi-horse-ride',
    source: 'https://www.makadi-excursions.com/tours/makadi_bay_horse_riding_tour/',
    requirements: [REQUIREMENT],
  },
  {
    slug: 'makadi-excursions-marsa-alam-horse-ride',
    source: 'https://www.makadi-excursions.com/tours/marsa-alam-horse-riding-tour-child-12-years-copy/',
    requirements: [REQUIREMENT],
  },
] as const;

export function validateMakadiParticipantRequirements(
  records: readonly { slug: string; source: string; requirements: readonly string[] }[] = MAKADI_PARTICIPANT_REQUIREMENTS,
): string[] {
  const errors: string[] = [];
  if (records.length !== 2) errors.push('Exactly two horse-riding products must be targeted.');
  if (new Set(records.map((record) => record.slug)).size !== records.length) errors.push('Tour targets must be unique.');

  for (const record of records) {
    if (!record.slug.startsWith(`${TENANT_SLUG}-`) || !record.slug.endsWith('-horse-ride')) {
      errors.push(`Unexpected tour target: ${record.slug}`);
    }
    let source: URL | null = null;
    try {
      source = new URL(record.source);
    } catch {
      errors.push(`Invalid source URL: ${record.source}`);
    }
    if (source && (source.protocol !== 'https:' || source.hostname !== 'www.makadi-excursions.com' || !source.pathname.startsWith('/tours/'))) {
      errors.push(`Source is outside the Makadi tour catalogue: ${record.source}`);
    }
    if (record.requirements.length !== 1 || record.requirements[0] !== REQUIREMENT) {
      errors.push(`Unexpected participant requirement: ${record.slug}`);
    }
  }
  return errors;
}

async function applyRequirements(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (!args.has(`--confirm-tenant=${TENANT_SLUG}`)) {
    throw new Error(`Apply fence missing. Pass --confirm-tenant=${TENANT_SLUG}.`);
  }

  const mongoose = await import('mongoose');
  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  await connectDatabase();

  const session = await mongoose.startSession();
  try {
    const tenant = await Tenant.findOne({ slug: TENANT_SLUG }).select('_id slug').lean();
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_SLUG}`);

    await session.withTransaction(async () => {
      for (const record of MAKADI_PARTICIPANT_REQUIREMENTS) {
        const tour = await Attraction.findOne({ slug: record.slug, ownerTenantId: tenant._id })
          .select('_id slug participantRequirements ownerTenantId')
          .session(session);
        if (!tour) throw new Error(`Owned tour not found: ${record.slug}`);

        tour.participantRequirements = [...record.requirements];
        await tour.save({ session, validateModifiedOnly: true });
      }
    });

    const verified = await Attraction.find({
      slug: { $in: MAKADI_PARTICIPANT_REQUIREMENTS.map((record) => record.slug) },
      ownerTenantId: tenant._id,
    }).select('slug participantRequirements').lean();
    if (verified.length !== MAKADI_PARTICIPANT_REQUIREMENTS.length || verified.some((tour) => (
      tour.participantRequirements?.length !== 1 || tour.participantRequirements[0] !== REQUIREMENT
    ))) {
      throw new Error('Participant-requirement verification failed after the database update.');
    }

    console.log(`[makadi-participant-requirements] Applied and verified ${verified.length} owned horse-riding products.`);
  } finally {
    await session.endSession();
    await disconnectDatabase();
  }
}

export async function main(): Promise<void> {
  const errors = validateMakadiParticipantRequirements();
  if (errors.length) throw new Error(`Participant-requirement plan is invalid:\n- ${errors.join('\n- ')}`);

  const args = new Set(process.argv.slice(2));
  if (!args.has('--apply')) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      tenant: TENANT_SLUG,
      targets: MAKADI_PARTICIPANT_REQUIREMENTS,
      mutationScope: ['two owned horse-riding products', 'participantRequirements field only'],
      safeguards: ['no database connection', 'tenant fence required', 'transactional update', 'post-write verification'],
    }, null, 2));
    return;
  }

  await applyRequirements();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[makadi-participant-requirements] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
