import mongoose from 'mongoose';
import { env } from '../config/env';
import { Tenant } from '../models/Tenant';
import { decryptSecretWithSource, reencryptLegacySecret } from '../utils/secretCrypto';

type StripeSecretRecord = {
  secretKeyEnc?: string;
  webhookSecretEnc?: string;
};

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  if (apply && !env.hasDedicatedEncryptionKey) {
    throw new Error('Set a dedicated ENCRYPTION_KEY before applying secret rotation');
  }

  await mongoose.connect(env.mongodbUri);
  const tenants = await Tenant.find({})
    .select('+paymentSettings.stripe.secretKeyEnc +paymentSettings.stripe.webhookSecretEnc')
    .lean<Array<Record<string, unknown>>>();

  const counts = {
    tenants: tenants.length,
    encryptedValues: 0,
    primaryValues: 0,
    legacyValues: 0,
    unreadableValues: 0,
    updatedTenants: 0,
  };

  for (const tenant of tenants) {
    const paymentSettings = tenant.paymentSettings as { stripe?: StripeSecretRecord } | undefined;
    const stripe = paymentSettings?.stripe;
    if (!stripe) continue;

    const updates: Record<string, string> = {};
    const fields: Array<keyof StripeSecretRecord> = ['secretKeyEnc', 'webhookSecretEnc'];
    for (const field of fields) {
      const payload = stripe[field];
      if (!payload) continue;
      counts.encryptedValues += 1;

      const decrypted = decryptSecretWithSource(payload);
      if (decrypted.source === 'primary') counts.primaryValues += 1;
      else if (decrypted.source === 'legacy') {
        counts.legacyValues += 1;
        if (apply) updates[`paymentSettings.stripe.${field}`] = reencryptLegacySecret(payload);
      } else counts.unreadableValues += 1;
    }

    if (apply && Object.keys(updates).length > 0) {
      await Tenant.updateOne({ _id: tenant._id }, { $set: updates });
      counts.updatedTenants += 1;
    }
  }

  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    counts,
  }, null, 2)}\n`);

  if (counts.unreadableValues > 0) process.exitCode = 2;
}

run()
  .catch((error) => {
    console.error('Tenant payment-secret rotation failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
