# Cloud development environment

The sibling `.env.example` file inventories all keys found in runtime/maintenance source, existing example files and local configuration key names. It contains no copied credential values. Optional and legacy example keys are labelled; their presence does not establish that a feature is supported or configured.

Use the frontend template as `.env.local` in the frontend repo and the backend template as `.env` in the backend repo, or enter the corresponding values in that environment's settings. Keep the two files separate: the backend PORT must not become the frontend's port. Both services must share one fresh development JWT_SECRET, entered through the secure environment settings. Set distinct encryption and booking-access secrets there when needed; do not reuse production secrets.

The URLs assume a frontend on 3000, backend on 5000, and isolated MongoDB on 27017 in the same cloud environment. MongoDB is a prerequisite, not provisioned by this file. Use actual reachable service URLs if they run separately. Never point testing at a production database. Do not manually set NODE_ENV=development when running a production build.

External provider credentials remain empty and delivery/payment feature flags are disabled for isolated development. Remove inherited provider credentials from cloud environment settings too: empty dotenv values may not override values already injected by the host. Imported tenant records can contain their own provider settings, so use a fresh isolated database and the guarded Coral seed. No live test messages are authorized.

Frontend public variables are compiled into client bundles. Never put secrets in NEXT_PUBLIC_* settings. Some advertised example keys are legacy; inspect current code before enabling them. The Coral site record and its preview access must still be created with the guarded seed in the handoff.

See `../CORAL-SAFARI-HANDOFF.md` for implementation status, source links, known failures and asset manifest.
