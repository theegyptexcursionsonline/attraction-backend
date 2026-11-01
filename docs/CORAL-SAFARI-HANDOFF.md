# Coral Safari continuation handoff — 1 November 2026

## Current decision

The current visual design was rejected. This is an unfinished implementation checkpoint, not an accepted design or a finished website. Redesign it while preserving the tested request-only behavior. The owner explicitly requested the checkpoint on main despite the unfinished frontend checks.

## Requested website

- Domain: coralsafarihurghada.com. The owner confirmed it is still to be registered; continue the preview without purchasing or assigning an alternative domain.
- Exactly three experiences: horse riding, quad safari and camel riding.
- Four pickup areas: Hurghada, Sahl Hasheesh, Soma Bay and Makadi Bay.
- Latest client clarification: keep the booking process the same but collect no payment initially. Collect a request awaiting confirmation, not a confirmed reservation or inventory hold.
- The client intends to enable the full booking engine after its business approval process. Do not promise an approval outcome.
- No outgoing email or WhatsApp test is authorized. Requests are stored in the existing messages inbox; automatic delivery is disabled for this tenant.

## Checkpoints

- Frontend repository: attractions-network, main checkpoint de265454.
- Backend repository: attraction-backend, main checkpoint a06c39e0.
- No production Coral tenant was created during this work. The seed is prepared, not applied. Backend runtime version and health matched its checkpoint after deployment; frontend deployment was not verified.
- Existing B14 work is separate. Do not overwrite or merge it into this task.

## Implemented behavior

Tenant slug: `coral-safari-hurghada`.

Frontend routes: `/`, `/safari`, `/safari/horse-riding`, `/safari/quad-safari`, `/safari/camel-riding`, `/request`. On shared preview origins retain `?tenant=coral-safari-hurghada` and the existing preview gate.

The four-stage request gathers experience/date/party, pickup area/hotel, contact details, then review. It returns a durable reference with explicit wording that the trip is not confirmed. Five interface languages and light/dark appearances are implemented but full acceptance remains unfinished.

Backend endpoints: tenant-scoped `GET /api/contact/request-options` and `POST /api/contact/requests`. Three activity types and four pickup areas are server-owned request definitions, not priced tour inventory. Submission validates calendar dates in Africa/Cairo, bounds party sizes, preserves tenant scope and deduplicates by tenant plus request UUID. Reusing a UUID with changed details returns 409. No payment, booking, inventory or notification effects occur.

The new request transport deliberately omits cookies and asserts anonymous identity. Do not replace it with the shared authenticated mutation client: a pending sign-in intent blocked public requests before transport. Keep the fixed same-origin endpoint, strict tenant checks, redirect rejection, timeout/cancellation, receipt validation and stable retry ID. Shared authentication and payment guards remain unchanged.

Page components own the Coral renderer. LayoutWrapper preserves the actual Next router children after its gates. Replacing the children with the entire storefront broke internal Link navigation; do not restore that approach.

## Code map

Frontend: `components/coral/`, `lib/coral/`, `lib/server/coral-route.ts`, `lib/contact/booking-request.ts`, `lib/contact/use-booking-request.ts`, `lib/api/booking-requests.ts`, the new public routes, `public/coral/` and `app/fonts/coral/`.

Backend: `src/controllers/contactRequests.controller.ts`, `src/utils/coralRequestPolicy.ts`, contact routes/controller/model, tenant booking closure policy and `src/scripts/seed-coral-request-site.ts`.

The create-only seed supports inspection, journaled application and guarded retirement. It requires real uploaded assets, an environment-supplied preview code using the platform's eight-character format, exact target/database confirmation and ownership checks. It refuses overwrites and preserves requests on retirement. Do not apply it before reviewing current account, database, tenant state and release readiness.

## Verified and unfinished

Backend final BUILD=1 quality gate passed: 280 suites, 4,661 tests, typecheck, lint, build and source scans.

Frontend typecheck and lint passed. Its full gate was stopped at the owner's requested checkpoint; it was not green. Known failing suites:

1. `__tests__/unit/seo/public-route-metadata-contract.test.ts`: the three new routes are not recognized by the host-aware metadata contract. Recognize only the reviewed Coral helper imports and retain host/hidden/conflicting-identity checks; do not skip the routes.
2. `__tests__/unit/royal-links.test.ts`: physical route inventory lacks request/safari. Repair exact-tenant ownership while preserving other tenants' previous flat-CMS 404/308 behavior. An unconditional concrete-root exemption is unsafe.
3. `__tests__/unit/lib/ai-search.test.ts`: account for the new tenant-specific, non-catalogue routes without adding them to global search catalogue listings.

One complete desktop journey was exercised in the actual in-app browser: home to list to detail to request, validation, four stages, duplicate tap and saved receipt. Isolated database readback showed one request, zero bookings and delivery skipped. This was local proof, not production acceptance. URL preselection and anonymous submission defects were repaired and retested.

Remaining: redesign approval; repair the failing contracts; complete full frontend gate and production build; second independent mobile/Arabic workflow; failure/retry checks on the final build; final desktop/390px light/dark evidence; unchanged-tenant verification; guarded production tenant creation and release checks when appropriate. Domain launch remains separate from preview completion.

## Sources and assets

Client examples (same product IDs, canonical URLs):

- https://www.getyourguide.com/en-gb/hurghada-l403/sahl-hasheesh-desert-sea-horse-ride-with-transfers-t1092945/
- https://www.getyourguide.com/hurghada-l403/sahl-hasheesh-quad-bike-desert-safari-with-hotel-pickup-t1173299/
- https://www.getyourguide.com/hurghada-l403/hurghada-camel-ride-blue-lagoon-bbq-and-stargazing-t1192009/
- Supplied business location: https://share.google/3UIEToaJ41qzu9mj3

The examples name Sea Horse Sahl Hasheesh-Hurghada as provider. Do not silently copy its prices, policies, options or legal identity to Coral. Coral's own business listing confirms horse riding, quad safaris and camel rides along the Sahl Hasheesh coastline. Its listed business address is Coral hotel, Hurghada 1, Red Sea Governorate 84511, Egypt; this does not establish hotel affiliation or an activity route.

`coral-safari-assets.json` beside this file contains actual uploaded public asset URLs, checked as images. Original artwork is illustrative, not operator-supplied documentary photography. Frontend source assets and font license are already committed. No credentials or preview codes are included here.

Earlier local screenshots, diagnostic logs and temporary launch helpers are workspace-only artifacts and are not required to understand this handoff. Recreate verification against the current checkout and an isolated local database; never substitute production credentials or data for a local fixture.
