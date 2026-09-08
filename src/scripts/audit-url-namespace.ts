import 'dotenv/config';
import mongoose from 'mongoose';
import { auditTenantUrlNamespace } from '../services/urlNamespaceAudit.service';

async function main() {
  const args = process.argv.slice(2);
  const value = (key: string) => args[args.indexOf(key) + 1];
  const tenant = args.includes('--tenant') ? value('--tenant') : '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenant)) throw new Error('Usage: npm run audit:url-namespace -- --tenant <website-slug> [--page 1]');
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('Database configuration is required');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  try { console.log(JSON.stringify(await auditTenantUrlNamespace(tenant, args.includes('--page') ? Number(value('--page')) : 1), null, 2)); }
  finally { await mongoose.disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'URL audit failed'); process.exitCode = 1; });
