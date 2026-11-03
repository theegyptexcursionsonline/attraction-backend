/**
 * Publishes a network group's committed Arabic payloads. A production write: it needs the owner's approval
 * for the run, and it refuses to start without the approval digest the read-only check printed.
 *
 *   1. OPS_TASK="src/scripts/check-network-arabic-apply.ts --group=b14a"        (read-only; prints `approval`)
 *   2. OPS_TASK="src/scripts/apply-network-arabic.ts --group=b14a --approve=<approval>"
 *
 * The plan is computed again here and its digest must equal the approved one, so any change to a site, a
 * source or a stored row between the check and this run stops it before anything is written. Each site is
 * then published in its own transaction (`executeSitePlan`), with the repository's index readiness check,
 * source fence and readback; rows already present are left alone, so a repeated run writes nothing.
 */
import mongoose from 'mongoose';
import { executeSitePlan, groupApprovalDigest, loadGroupPayloads, planSite, PUBLISH_BATCHES } from './network-arabic/publish';

export function applyArguments(args: string[]): { group: string; approve: string } {
  const group = args.find((arg) => arg.startsWith('--group='))?.slice('--group='.length) || '';
  const approve = args.find((arg) => arg.startsWith('--approve='))?.slice('--approve='.length) || '';
  if (args.length !== 2 || !PUBLISH_BATCHES[group] || !/^[a-f\d]{64}$/.test(approve)) throw new Error('Provide --group=<group> and --approve=<digest printed by check-network-arabic-apply.ts>');
  return { group, approve };
}

async function main() {
  const { group, approve } = applyArguments(process.argv.slice(2));
  const payloads = loadGroupPayloads(group);
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('Database configuration is required');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  try {
    const plans = [];
    for (const payload of payloads) plans.push(await planSite(payload));
    const digest = plans.every((plan) => plan.approval && !plan.mismatches.length) ? groupApprovalDigest(plans) : '';
    if (!digest || digest !== approve) {
      console.log(JSON.stringify({ apply: 'network-arabic', group, refused: 'The plan differs from the approved one. Run the check again; nothing was written.', databaseWrites: 0 }));
      process.exitCode = 1;
      return;
    }
    for (const [index, plan] of plans.entries()) {
      const receipt = await executeSitePlan(plan, payloads[index], plan.approval);
      console.log(JSON.stringify({ apply: 'network-arabic', group, ...receipt }));
    }
    console.log(JSON.stringify({ apply: 'network-arabic', group, sites: plans.length, approval: digest, completed: true }));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof Error && !/mongodb|password|srv|uri/i.test(error.message) ? error.message : 'Arabic publication could not complete. Run the read-only check before retrying.';
    console.error(`[apply-network-arabic] ${message}`);
    process.exitCode = 1;
  });
}
