# Ops runner (Railway)

Cloud agent sessions can only make HTTPS requests, so they cannot open a MongoDB connection.
The `ops-runner` service in the `attraction-backend` Railway project runs maintenance scripts
inside Railway instead, where `MONGODB_URI` is reachable, and its logs are read back over the
Railway API.

- Built from this repository with `railway.ops.json` (not `railway.json`), so it never starts
  the API server, has no health check or public domain, and never restarts.
- Its start command is `sh scripts/ops-runner.sh`. With `OPS_TASK` unset it logs `idle` and
  exits. `OPS_TASK` must name an existing `src/scripts/*.ts` file plus its arguments; anything
  else is refused. Scripts keep their own guards (`check` first, `--confirm`, `--database`).
- It has no deploy trigger: a push to `main` does not run it. A run is a manual deploy of the
  latest `main` after setting `OPS_TASK`; clear `OPS_TASK` afterwards.
- Variables are references to the `web` service (`${{web.NAME}}`) for the database and the
  secrets the configuration requires in production. Email, SMS and payment credentials are
  deliberately not given to it.
- Read-only checks may run freely. A run that changes production data needs the owner's
  approval for that run.
