# B14 Arabic records: prepared and checked, not published

State on 2 November 2026: **prepared, committed and pushed on `feat/b14-arabic`; the read-only apply check passes
for all ten sites; nothing is published.** Every publishing step below is a production write and needs the owner's
approval for that run.

Sites: `shaab-abu-nugar`, `fanous-east`, `north-abu-ramada`, `careless-reef`, `fanadir-north` (group `b14a`) and
`erg-sabina`, `fanous-west`, `abu-dabbab-beach`, `elphinstone-reef`, `sharm-el-luli` (group `b14b`), 14 trips.

## 1. How earlier batches store their Arabic (read in production, read-only)

The B12/B13 working scripts were never committed, so the shape was read from production instead
(`export-network-arabic-sources.ts`, part `existing:summary`). Every network site with Arabic (92 sites; B13's seven
included) has, for locale `ar` only:

- one `AttractionTranslation` per live trip: `status: published`, `slug: <trip slug>-ar`
  (e.g. `ssb-orange-bay-cruise-with-massage-ar`), `sourceSnapshot` version 1;
- one `DestinationTranslation` per destination the site lists: `slug: <destination slug>-ar` (`hurghada-ar`);
- one `TenantPresentationTranslation` for the tenant (`kind: tenant`, `revision: 1`), Arabic only, the description
  on one line (the presentation schema refuses line breaks);
- `supportedLanguages: ['en', 'ar']`, and no `customDomain` (the sites still run behind their preview codes).

The repository planners cannot plan these rows: `planLocalization` / `planTenantPresentation` verify a site by its
custom domain, and the presentation planner requires all four languages. `src/scripts/network-arabic/publish.ts`
therefore plans the same rows for a network site verified by id, slug, platform domain (`<slug>.foxesnetwork.com`)
and active status, Arabic only, using the repository's own content schemas, cleaning and completeness validation,
snapshots, digests, URL collision checks, row shape and (on publication) the same transaction, index readiness check,
presentation fence and readback. A database test (`network-arabic-publish.database.test.ts`) proves its rows are
identical to the repository planners' rows for the same site, apart from generated ids and timestamps. A site that
has its own domain is refused (the repository planners are its path).

Because a file written on the ops-runner does not survive the run, a plan cannot be saved and approved later. The
approval digest is computed over everything that decides the write (site, each row's identity, the digest of the row
as it stands, the exact row to write) and nothing generated, so a later run on the same state computes the same digest,
and a publication refuses to start unless its digest equals the approved one.

## 2. What was exported

`src/scripts/export-network-arabic-sources.ts --batch=b14a,b14b` (read-only; no insert, update or delete; connects
with `autoIndex: false, autoCreate: false`) prints, as tagged base64 log chunks with a digest per part:

- per site, the sources the two exporters build: the tenant presentation sources with their snapshots and export
  digest, each live trip's translatable fields with `sourceUpdatedAt` and snapshot digest, and each destination;
- the network's existing Arabic as a translation memory (8,542 English strings with their renderings) and examples
  for 177 shared terms (places, recurring phrases, species).

Found: 10 sites, 14 trips, 10 destination sources (7 × `hurghada`, 3 × `marsa-alam`), 10 presentation sources (no
custom pages), no existing translation rows for any of the ten. Two export runs (`d7256300`, `f41c008a`) gave the
same source digests.

## 3. Strings: reused and new

585 unique English strings: **352 reused** from the network's published Arabic (8 had two renderings; the majority
reading was kept) and **233 new**, authored for this batch (36,202 English characters).

| Site | Group | Trips | Unique reused | Unique new |
|---|---|---|---|---|
| shaab-abu-nugar | b14a | 3 | 94 | 46 |
| fanous-east | b14a | 1 | 59 | 17 |
| north-abu-ramada | b14a | 2 | 83 | 25 |
| careless-reef | b14a | 1 | 49 | 35 |
| fanadir-north | b14a | 1 | 64 | 17 |
| erg-sabina | b14b | 1 | 60 | 17 |
| fanous-west | b14b | 1 | 67 | 17 |
| abu-dabbab-beach | b14b | 2 | 82 | 25 |
| elphinstone-reef | b14b | 1 | 63 | 17 |
| sharm-el-luli | b14b | 1 | 45 | 17 |

(Per-site counts overlap: a string shared by two sites counts on both.)

Payloads: `src/scripts/network-arabic/b14/<slug>.json`, each record with its English source, its Arabic, its source
version and digest. Glossary: `src/scripts/network-arabic/b14/glossary.json`.

Readings, in order of precedence: the network's published Arabic, the facts' own Arabic spelling, the brief's list.
Erg Sabina = عرق صابينا; Shaab Abu Nugar = شعب أبو نقر; Fanous East / West = فانوس الشرقية / الغربية;
North Abu Ramada = شمال أبو رمادة; Careless Reef = شعب كيرلس; Fanadir North = الفنادير الشمالية;
Abu Dabbab Beach = شاطئ أبو دباب; **Elphinstone Reef = شعاب الفينستون** (the facts record this Arabic name, so it
replaces the brief's شعب إلفنستون, as the brief's own rule says); Sharm El Luli = شرم اللولي. Network readings kept:
Orange Bay = أورانج باي, Giftun = جفتون, Big/larger Giftun = جفتون الكبيرة, Shaab Sabina = شعب صابينا,
Umm Gamar = أم قمر, Magawish = ماجاويش, Dolphin House = بيت الدلافين, snorkelling = سنوركلينغ.

## 4. Checker

`src/__tests__/network-arabic-b14-payload.test.ts` (what the B12/B13 checkers did), **0 problems, 8/8 passing**:
every source has its Arabic and nothing is invented where the English is empty; ids, indexes, URLs, placeholders,
markup and `\n\n` paragraph breaks kept (presentation on one line); Latin digits only and the same numbers in every
string; one English string = one Arabic reading across the ten sites; every glossary term on its one reading and no
second reading; no "official", "best", rating, guarantee, luxury or year the English lacks; the repository schemas
and completeness validators accept every record. With it: `network-arabic-text.test.ts` (7) and
`network-arabic-publish.database.test.ts` (6). 21/21 passing.

## 5. Read-only apply check

`OPS_TASK="src/scripts/check-network-arabic-apply.ts --group=b14a,b14b"`, run on commit `1fa890fc` (deployment `65cd503d`), exit code 0:

| Group | Sites | Rows to write | Rows present | Sources matched | Approval digest |
|---|---|---|---|---|---|
| b14a | 5 | 18 | 0 | 18/18 | `3746b1678c82e9783ca4dd93210cde36925b9b24544192856479f06500d038f5` |
| b14b | 5 | 16 | 0 | 16/16 | `0e46215dfd1a1256faedd8d4ce555feff62c8a323a54cbbaf8ee359a54875353` |

Per site: 3 rows (1 trip + 1 destination + 1 presentation), 4 for `north-abu-ramada` and `abu-dabbab-beach`, 5 for
`shaab-abu-nugar`; no mismatch anywhere. An earlier run on `2f453093` gave the same result; the sites whose Arabic
did not change between the two commits printed the same site digests both times, as the digest design intends.
The digests hold only while production is unchanged: take them from a fresh check run immediately before publishing.

Ops-runner runs for this work, all read-only, each followed by `OPS_TASK` reset to `""`:

| Task | Commit | Exit |
|---|---|---|
| `export-network-arabic-sources.ts --batch=b14a,b14b` | `d7256300` | 0 |
| `export-network-arabic-sources.ts --batch=b14a,b14b` | `f41c008a` | 0 |
| `check-network-arabic-apply.ts --group=b14a,b14b` | `2f453093` | 0 |
| `check-network-arabic-apply.ts --group=b14a,b14b` | `1fa890fc` | 0 |

## 6. Publishing, in order (for the coordinator; each write needs the owner's approval for that run)

Each step is one ops-runner run (`docs/OPS_RUNNER.md`): `variableUpsert` `OPS_TASK` with `skipDeploys: true`,
`serviceInstanceDeployV2` for a commit that contains these files (the head of `feat/b14-arabic`, or `main` once
merged; Railway accepts a branch commit), read `deploymentLogs` until `[ops-runner] finished: exit code N`, then set
`OPS_TASK` back to `""`. One run at a time.

1. **Check (read-only).** `src/scripts/check-network-arabic-apply.ts --group=b14a,b14b`
   Expect `[check] group b14a: passed … approval <A>` and `[check] group b14b: passed … approval <B>`, 34 rows to
   write, 0 present.
2. **Publish b14a (write).** `src/scripts/apply-network-arabic.ts --group=b14a --approve=<A>`
   Expect five lines `{"apply":"network-arabic",…,"changed":true,"verified":true}` and `"completed":true`. Any
   drift since step 1 refuses the run with nothing written; run step 1 again.
3. **Publish b14b (write).** `src/scripts/apply-network-arabic.ts --group=b14b --approve=<B>`
   (b14a's publication does not touch b14b's rows, so `<B>` from step 1 stays valid.)
4. **Verify 1 (read-only).** Step 1 again: every site `write 0, present N`, both groups passed.
5. **Once the ten sites' Arabic storefront pages are live** (release, handover step 5):
   `src/scripts/set-arabic-languages.ts --group=b14a` (read-only dry run). Expect every site `ready: true`,
   `before ["en"]`, `after ["en","ar"]`, and an `approval <L1>`. A site with any trip, destination or presentation
   not served in Arabic blocks the group.
6. **Switch Arabic on, b14a (write).** `src/scripts/set-arabic-languages.ts --group=b14a --apply --approve=<L1>`
7. **Same for b14b:** dry run `--group=b14b` (approval `<L2>`), then `--group=b14b --apply --approve=<L2>`.
8. **Verify 2 (read-only).** Dry run for each group: `toChange: 0`, `ready: true`; then the release's Arabic
   captures of the ten sites.

## 7. For the owner or coordinator to decide

- **Storefront readings differ from these records.** The brand files on `feat/b14-integration` write Shaab Abu Nugar
  شعب أبو نجار (the brief and the network's own "Umm Gamar = أم قمر" read the g as ق: أبو نقر) and Careless Reef
  شعاب كيرلس (brief: شعب كيرلس); they also write some network terms differently: خليج أورانج (network أورانج باي),
  شعب سابينا (network شعب صابينا), أم جمار (network أم قمر), مجاويش (network ماجاويش), الجفتون / جفتون الكبرى
  (network جفتون / جفتون الكبيرة), شعبة بيت الدلافين, السنوركل. One side must change before release so a page shows
  one reading. Changing these records is mechanical: edit the Arabic in the payload files and `glossary.json`, then
  rerun the checker and the apply check.
- **Destination rows** for Hurghada and Marsa Alam reuse the network's existing Arabic, which translates the English
  destination records' own wording ("premier", "world-class", "pristine", "paradise"). Changing those English records
  would make every network site's destination rows stale.
- **New publish path.** The B13 scripts are not in the repository; the publish path here is new code, proven
  equivalent to the repository planners in a database test. Its rows carry no `__v` key (B13's rows carry Mongoose's
  `__v` from model writes); nothing reads it.
