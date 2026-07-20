# Production Operations

## Ownership

- Platform operations owner: RDMI Platform Operations
- Release owner: RDMI Release Management
- Customer incident owner: RDMI Customer Success
- Payment reconciliation owner: RDMI Finance Operations

Owners use the approved shared secret manager and provider dashboards. Secrets,
customer records, access tokens, and backup archives must never be committed or
attached to release evidence.

## Monitoring

- Railway deployment health check: `GET /api/ready` (database-aware readiness).
- External liveness probe: `GET /api/health`.
- Frontend liveness probe: `GET /` on the Netlify production domain.
- Alert on five consecutive readiness failures, elevated HTTP 5xx responses, or a
  failed booking-integrity audit. Route alerts to Platform Operations and Customer
  Success.
- Production request logs contain a generated request ID and redacted URL. They do
  not include referrers, cookies, authorization headers, or sensitive query values.

## Backup And Restore

Run from an approved operations workstation with MongoDB Database Tools installed:

```bash
npm run ops:verify-backup
```

The command creates a compressed dump, restores it into an isolated local MongoDB,
compares every collection count, prints only aggregate evidence and a SHA-256 hash,
and removes the temporary archive. A release fails when any collection differs.

Production backup retention and encryption remain configured in the MongoDB provider.
Platform Operations reviews provider backup status weekly and performs this restore
verification before each major release and at least monthly.

## Release And Rollback

1. Record tested frontend and backend commit SHAs.
2. Run tests, lint/typecheck, builds, dependency audits, secret scans, booking
   integrity audit, and backup verification.
3. Deploy the exact commits and wait for Netlify `ready` and Railway `SUCCESS`.
4. Re-run live health, readiness, authentication, tenant-isolation, booking, and
   checkout checks.
5. If a P0/P1 regression appears, redeploy the last known-good provider deployment.
6. If a data migration caused the regression, stop writes, preserve evidence, and
   restore only through the approved MongoDB provider workflow with Finance and
   Platform Operations approval.

## Secret Rotation

Rotate credentials only in the approved secret manager and corresponding provider.
After rotation, redeploy both services when applicable, verify replacement access,
revoke prior sessions or keys, run secret scans, and record only the rotation date and
credential name in the release report.
