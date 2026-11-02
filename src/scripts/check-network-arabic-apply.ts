/**
 * Read-only apply check for a network group's committed Arabic payloads (`network-arabic/<batch>/*.json`),
 * built to run on the Railway ops-runner (docs/OPS_RUNNER.md):
 *
 *   OPS_TASK="src/scripts/check-network-arabic-apply.ts --group=b14a"
 *   OPS_TASK="src/scripts/check-network-arabic-apply.ts --group=b14a,b14b"   (each group planned on its own)
 *
 * For every site of the group it plans the write in memory (`network-arabic/publish.ts`: the repository's
 * content validation, snapshots, digests, collision checks and row shape) and prints one JSON line per site:
 * rows to write, rows already present, source digests matched and mismatched, and the site's approval
 * digest; then one line for the group with its approval digest, the value `apply-network-arabic.ts` needs.
 * It never writes, and the connection creates no index or collection.
 */
import mongoose from 'mongoose';
import { groupApprovalDigest, loadGroupPayloads, planSite, planSummary, PUBLISH_BATCHES, type SitePlan } from './network-arabic/publish';

export function checkArguments(args: string[]): { groups: string[] } {
  if (args.length !== 1 || !/^--group=[a-z0-9]+(,[a-z0-9]+)*$/.test(args[0])) throw new Error('Provide --group=<group>[,<group>]');
  const groups = args[0].slice('--group='.length).split(',');
  if (groups.some((group) => !PUBLISH_BATCHES[group]) || new Set(groups).size !== groups.length) throw new Error(`Unknown or repeated group; known: ${Object.keys(PUBLISH_BATCHES).join(', ')}`);
  return { groups };
}

/** Plans one group and prints its lines; true when every site planned with no source drift. */
async function checkGroup(group: string): Promise<boolean> {
  const payloads = loadGroupPayloads(group);
  const plans: SitePlan[] = [];
  const failures: string[] = [];
  for (const payload of payloads) {
    try {
      const plan = await planSite(payload);
      plans.push(plan);
      const summary = planSummary(plan);
      console.log(JSON.stringify({ check: 'network-arabic-apply', ...summary }));
      // The same facts as plain text, which the deployment log keeps as a message line.
      console.log(`[check] ${plan.site}: write ${summary.rowsToWrite}, present ${summary.rowsPresent}, sources matched ${summary.sourcesMatched}/${plan.rows.length}, mismatched ${summary.sourcesMismatched.length ? summary.sourcesMismatched.join(' ') : 'none'}, approval ${summary.approval || 'none'}`);
    } catch (error) {
      failures.push(payload.tenant.slug);
      const message = error instanceof Error ? error.message : 'planning failed';
      console.log(JSON.stringify({ check: 'network-arabic-apply', site: payload.tenant.slug, failed: message }));
      console.log(`[check] ${payload.tenant.slug}: FAILED ${message}`);
    }
  }
  const passed = !failures.length && plans.every((plan) => plan.approval && !plan.mismatches.length);
  console.log(JSON.stringify({
    check: 'network-arabic-apply',
    group,
    sites: payloads.length,
    passed,
    rowsToWrite: plans.reduce((sum, plan) => sum + plan.rows.filter((row) => row.write).length, 0),
    rowsPresent: plans.reduce((sum, plan) => sum + plan.rows.filter((row) => !row.write).length, 0),
    sourcesMatched: plans.reduce((sum, plan) => sum + plan.rows.filter((row) => row.sourceMatched).length, 0),
    sourcesMismatched: plans.reduce((sum, plan) => sum + plan.rows.filter((row) => !row.sourceMatched).length, 0),
    failedSites: failures,
    approval: passed ? groupApprovalDigest(plans) : null,
    databaseWrites: 0,
  }));
  console.log(`[check] group ${group}: ${passed ? 'passed' : 'FAILED'}, ${payloads.length} sites, approval ${passed ? groupApprovalDigest(plans) : 'none'}`);
  return passed;
}

async function main() {
  const { groups } = checkArguments(process.argv.slice(2));
  for (const group of groups) loadGroupPayloads(group);
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('Database configuration is required');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  try {
    let passed = true;
    for (const group of groups) passed = (await checkGroup(group)) && passed;
    if (!passed) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof Error && !/mongodb|password|srv|uri/i.test(error.message) ? error.message : 'Read-only apply check could not complete.';
    console.error(`[check-network-arabic-apply] ${message}`);
    process.exitCode = 1;
  });
}
