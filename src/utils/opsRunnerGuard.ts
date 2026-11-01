/**
 * The Railway ops-runner service (docs/OPS_RUNNER.md) is built from this repository to run
 * maintenance scripts. It must never serve the API or start its background workers, whatever
 * start command it is given. Railway sets RAILWAY_SERVICE_NAME on every service.
 */
export const OPS_RUNNER_SERVICE = 'ops-runner';

export const refusesApiServer = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.RAILWAY_SERVICE_NAME === OPS_RUNNER_SERVICE;
