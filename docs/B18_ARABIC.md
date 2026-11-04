# B18 Arabic records: prepared and checked, not published

State on 4 November 2026: **prepared, committed and pushed on `feat/b18-arabic`; the read-only apply check
passes for all three sites on the branch head; nothing is published, no language was switched and no tenant
record was touched.** Every publishing step in section 7 is a production write and needs the owner's approval
for that run.

Batch B18 takes the older network sites that are still served in English only, **three at a time** (owner,
4 November). Group `b18a` is the first three, 27 trips and 35 rows:

| Group | Sites |
|---|---|
| `b18a` | `cairo-adventures`, `horse-riding-hurghada`, `gamila-horse-stable` |

## 1. Why the group is shaped this way, and the state the sites are in

B14's groups were the seed batches themselves; B17 regrouped four seed batches into three sixes, but still
took each site **from its seed batch by reference**, so no site described itself twice.

These three sites were **not created by the network seed scripts at all**. There is no `NetworkSite` to take
them from, and writing one would be a second, competing account of a site production already holds — its
trips, prices, copy, photos and pages. So `network-arabic/group.ts` introduces the narrower
`ArabicSite` / `ArabicGroup`: a group names only the three facts the pipeline **verifies against the live
record** — the slug, the platform domain, and the domain of its own that the site already answers on. A
`NetworkBatch` satisfies the same shape, so B14's and B17's groups keep working unchanged, and
`src/scripts/network-arabic/b18.ts` carries nothing a site could contradict. Everything else — the trips, the
destinations, the presentation sources — is read from production at export time.

Read in production on 4 November, all three `status: active`, platform domain `<slug>.foxesnetwork.com`, and
**no custom pages on any of the three**, so the presentation is one tenant source each:

| Site | Own domain | `supportedLanguages` | `designMode` | Live trips | Destinations | Rows |
|---|---|---|---|---|---|---|
| `cairo-adventures` | `cairoattractionsticket.com` | `en, ar, de, fr, es, ru` | `luxury` | 15 | `cairo`, `luxor` | 18 |
| `horse-riding-hurghada` | `horseridinghurghada.com` | `en` | `ranch` | 3 | `hurghada` | 5 |
| `gamila-horse-stable` | none | `en, ar, de` | `stable` | 9 | `hurghada`, `makadi-bay` | 12 |

### Existing translation rows: none, on any of the three

The coordinator's brief expected some, because two of the three advertise Arabic. The export counted the rows
directly (`AttractionTranslation`, `DestinationTranslation`, `TenantPresentationTranslation`, per tenant, all
locales): **`{tours: 0, presentation: 0, destinations: 0}` for every one of the three.** Not one translation
row exists for these sites in any locale.

So `cairo-adventures` offers a language switch to Arabic, German, French, Spanish and Russian, and
`gamila-horse-stable` to Arabic and German, with **nothing behind any of those languages**. The languages were
set on the tenant record without the records ever being written. Nothing in this batch completes or replaces an
existing translation: all thirty-five rows are new, and all thirty-five are `write`, `stored: absent`.

Two consequences for the coordinator, neither of them this batch's to decide:

- **`cairo-adventures` advertises four languages this batch does not write.** German, French, Spanish and
  Russian stay empty after B18A publishes. The storefront's own guard already disagrees with the tenant record:
  `lib/i18n/storefront/locale.ts` lists `cairo-adventures` under `ENGLISH_AND_ARABIC_ONLY`, so the interface
  offers English and Arabic only. The tenant record is the thing that is wrong, and correcting it is a tenant
  write outside this batch.
- **`gamila-horse-stable` advertises German**, equally empty, by the same reasoning.

### The repository's own presentation exporter

Mirror-image of B17, and worth recording because it decides which planner can be used:

- `cairo-adventures` and `horse-riding-hurghada` have their own domains, so `exportTenantPresentationSource`
  **accepts** them.
- `gamila-horse-stable` has none, so it is **refused**: "Verified active tenant and domain required".

Neither path works unchanged for the group as a whole: the repository's `planTenantPresentation` also requires
all four languages, which none of these sites offers. So `network-arabic/publish.ts` plans the rows, as it did
for B14 and B17, and one honest change was needed.

### The one planner change, and why it is a narrowing rather than a loosening

`networkTenant` refused **any** site carrying a `customDomain` ("the site has its own domain; plan it with the
repository planners"). Two of these three carry one, so the refusal had to be replaced by something — and the
something is an extra checked fact, not a dropped one:

- the group **declares** the domain the site already answers on (`ArabicSite.customDomain`);
- the payload carries it, and `assertPayloadShape` refuses a payload whose own domain is not the one the group
  declares;
- `networkTenant` requires the live `customDomain` to equal the declared one **exactly**, case- and
  space-normalised, and still requires the id, the slug, the platform domain and `status: active`;
- a site that declares none must still **have** none, so B14's and B17's sites behave exactly as before, and a
  site that grows or changes a domain after the group was written is refused with nothing planned.

`network-arabic-publish.database.test.ts` still proves a site with an undeclared own domain is refused, and
still proves this module's rows are identical to the repository planners' rows for the same site.

**The approval digest formula is unchanged.** The declared own domain is deliberately *not* in it: it is
verified by `networkTenant` at plan time **and again inside the publication transaction**, which is stronger
than a digest, and leaving the formula alone keeps B14's and B17's recorded digests valid.

## 2. What was exported

`src/scripts/export-network-arabic-sources.ts --batch=b18a` (read-only; no insert, update, replace or delete;
connects with `autoIndex: false, autoCreate: false`) prints, as tagged base64 log chunks with a digest per
part: per site the tenant presentation source with its snapshot and export digest, each live trip's
translatable fields with `sourceUpdatedAt` and snapshot digest, and each destination; then the network's
existing Arabic as a translation memory and examples for the shared terms.

Found: 3 sites, 27 trips, 5 destination sources, 3 presentation sources (no custom pages), **no existing
translation rows for any of the three**, 818 unique English strings, 317 of them already rendered somewhere on
the network. Translation memory: 9,091 English strings with their renderings. `databaseWrites: 0`.

This batch added to `network-arabic/text.ts`'s `GLOSSARY_TERMS` the places and words the B18 facts name — the
Hurghada bays (Makadi Bay, Sahl Hasheesh, Soma Bay, Safaga), the Cairo and Luxor sites (Karnak, Hatshepsut,
the Colossi of Memnon, Tutankhamun, Khan el-Khalili, Al-Azhar, the Hanging Church, Saladin, the Alabaster
Mosque, Talaat Harb), and the riding words (horseback, pony, paddock, handler, stable, gallop, rider).

## 3. Strings: reused and new

818 unique English strings: **317 reused** from the network's published Arabic (the majority reading kept) and
**501 new**, written for this batch (21,597 English characters). Readings, in order of precedence: the
network's published Arabic, then the site's own storefront brand file, then the place's own recorded Arabic
spelling.

| Site | Group | Trips | Rows | Unique strings | Reused | New |
|---|---|---|---|---|---|---|
| cairo-adventures | b18a | 15 | 18 | 433 | 169 | 264 |
| horse-riding-hurghada | b18a | 3 | 5 | 136 | 55 | 81 |
| gamila-horse-stable | b18a | 9 | 12 | 322 | 154 | 168 |

(Per-site counts overlap: a string shared by two sites counts on both. The batch totals are the union.)

Payloads: `src/scripts/network-arabic/b18/<slug>.json`, each record with its English source, its Arabic, its
source version and digest. Glossary: `src/scripts/network-arabic/b18/glossary.json`, 64 terms.

### Readings

Place names follow the network's live Arabic: الغردقة · خليج مكادي · سهل حشيش · الجونة · سفاجا · خليج سوما ·
البحر الأحمر · القاهرة · الجيزة · الأقصر · الإسكندرية · النيل · أهرامات الجيزة · أبو الهول · المتحف المصري ·
المتحف المصري الكبير · وادي الملوك · معبد الكرنك · معبد حتشبسوت · تمثالي ممنون · توت عنخ آمون · خان الخليلي ·
الجامع الأزهر · الكنيسة المعلقة · قلعة صلاح الدين · مسجد الألباستر · طلعت حرب · القاهرة الإسلامية ·
القاهرة القبطية · الفلوكة · الكشري · الفلافل · الفول المدمس.

The riding words, which this batch introduces to the network: ركوب الخيل · ظهر الخيل · المهر / المهور ·
الإسطبل · الحلبة · حصان عربي · دراجات الكواد · عربة الكثبان · مراقبة النجوم · عشاء المشويات.

**Two brand names have no published Arabic form, and stand in Latin inside the Arabic**, exactly as B17 did for
`SKAR Transport Cairo` and `Future Travel Egypt`: `Gamila Horse Stable` (and the shorter `Gamila Stable`, which
one description uses) and `Cairo Attractions Ticket`. Nothing in the storefront offers an Arabic name for
either — `components/stable/*` falls back to the English string, and no Arabic brand string exists anywhere in
the storefront repository — and coining one here would put a client's trading name into production on this
batch's authority. The glossary records that a name kept in Latin counts as its own reading. `Four Seasons`, a
third party's hotel named in one meeting point, is kept in Latin for the same reason.

**Open for the owner or the client:** the Arabic trading names. Once decided, the affected strings are a handful
per site (a tagline, two or three metaTitles, two meeting-point lines, one description, two SEO keywords) and
the records are re-exported and re-checked before publication.

## 4. Checker

`src/__tests__/network-arabic-b18-payload.test.ts`, **0 problems, 10/10 passing**: all three sites covered with
their trips, destinations and presentation, 27 trips and 35 rows; every source string has its Arabic and
nothing is invented where the English is empty; no English prose is left standing in an Arabic field; ids,
indexes, URLs, placeholders, markup and `\n\n` paragraph breaks are kept (presentation on one line, as the
presentation schema requires); Latin digits only and the same numbers in every string; one English string keeps
one Arabic reading across the three sites; every glossary term keeps its one reading and no second reading
appears anywhere; nothing claims more than the English does; the payload's site identity, own domain included,
is the one the group declares; and the repository's own content schemas and completeness validators accept
every record.

Because B18's sites have no seed description to compare against, the coverage test carries the **production
read of 4 November** instead: each site's live trip slugs, destination slugs and presentation kinds, in the
order the exporters list them. A payload that gains, loses or reorders a record fails there rather than at the
apply check.

**Two of B17's claim rules are made word-aware here**, narrowing each to the claim it was written for and to
nothing else. Both corrections were forced by the network's *own published Arabic*, which this batch reuses, so
the alternative would have been to reject the network's established readings:

1. `رسمي` ("official") matched inside **غير رسمية** — "informal", the published reading of "Smart casual
   attire". The rule now skips a `رسمي` that `غير` negates, which is the opposite of the claim.
2. `تضمن` ("guarantees") matched inside **تتضمن** — "includes", the published reading of "Long walking
   distances involved". The rule now requires the word to begin at a space or a punctuation mark, so `ضمان` and
   `تضمن` still catch a guarantee while `تتضمن` and `يتضمن` read as what they are.

No rule was widened to admit a claim, and no claim word was introduced that its English does not warrant.

With it: `network-arabic-b18-groups.test.ts` (5) proves the group covers the three sites exactly once in the
brief order, that each is named by its platform domain and by its own domain only where it has one, that the
export, the apply check, the publication and the language switch all accept the group, that it reads its Arabic
from the `b18` folder, and that **every site of B14 and B17 still declares no domain of its own**.
`npm run lint` (`tsc --noEmit`) is clean, and the full jest suite is green: 294 suites, 4,795 tests, 0 failures.

## 5. Read-only apply check

`OPS_TASK="src/scripts/check-network-arabic-apply.ts --group=b18a"`, run on commit `69030778` (the head of
`feat/b18-arabic`), **exit code 0, group passed, `databaseWrites: 0`**:

| Group | Sites | Rows to write | Rows present | Sources matched | Approval digest |
|---|---|---|---|---|---|
| b18a | 3 | 35 | 0 | 35/35 | `025254fd0c6bd12c91745adf90536f8e6fe292864c8fe413fc09f094249d6cc4` |

| Site | Rows to write | Rows present | Sources matched | Approval digest |
|---|---|---|---|---|
| cairo-adventures | 18 (15 tour · 2 destination · 1 presentation) | 0 | 18/18 | `e2df590bf03d7e1dfb37907e3b44e0bc0fda9baff122fabbf76a6015ca91b293` |
| horse-riding-hurghada | 5 (3 · 1 · 1) | 0 | 5/5 | `0ef191bc5179b749eb027540400076107b287a02ceeacd0e86b18fe25316de9e` |
| gamila-horse-stable | 12 (9 · 2 · 1) | 0 | 12/12 | `0273fe4262be55e703ba716312c8af0e495a607ceda1e71003f331203e1908f5` |

No mismatch anywhere; every row `stored: absent`. The run also proves the widened verification works against
production: `cairo-adventures` and `horse-riding-hurghada` planned with their own domains matched exactly, and
`gamila-horse-stable` planned with none.

**The digests hold only while production is unchanged: take them from a fresh check run immediately before
publishing.**

Ops-runner runs for this work, all read-only, each followed by `OPS_TASK` reset to `""`:

| Task | Commit | Exit |
|---|---|---|
| `check-network-arabic-apply.ts --group=b18a` | `69030778` | 0 |

The source export was run read-only against production from the workspace rather than on the ops-runner, which
needs no `OPS_TASK` and writes nothing: 8 parts, 818 batch strings, 317 reused, `databaseWrites: 0`, exit 0.

## 6. English defects found while translating

Found in the sites' **English** source; none is this batch's to fix, and each is translated faithfully rather
than quietly corrected. Repairing the English makes the matching Arabic row stale, so each repair means a
re-export, a re-check and a fresh digest for that site.

1. **Unbacked rating claims on `gamila-horse-stable`.** `gamila-makadi-horse-riding-desert-sea-guide` says
   "Rated 4.8★ by 114 guests" in a highlight and "with 114 five-star reviews … Rated 4.8★." in its
   description. The network's standing rule is that a network trip never shows a rating, a star or a review
   count (`UNBACKED_CLAIMS` in `seed-network-sites.ts` bars `★`, `rated` and `reviews`), and the trip carries
   no approved reviews behind the figures. The Arabic says exactly what the English says, with the same
   numbers; it should disappear from both when the English is fixed.
2. **Five `shortDescription` fields truncated mid-word at 120 characters** on `gamila-horse-stable`:
   `two-hours-desert-ride` ("…and be"), `three-hours-desert-trip` ("…the tranq"),
   `four-hours-desert-sea-swimming` ("…with your hors"), `swimming-with-horse-2-hour` ("…followed b") and
   `two-hours-beach-desert-ride` ("…and gold"). Each is its own `description` cut at 120 characters, so the
   intended wording is not in doubt. The Arabic renders the complete sentences the English reaches, and stops
   where the English stops being a sentence — it does not reproduce a dangling fragment, and it adds nothing
   the site does not already say in that record's own `description`.
3. **One `seo.metaTitle` truncated** on `horse-riding-hurghada`
   (`hrh-horse-riding-in-hurghada-with-optional-stargazing-bbq`): "… BBQ Dinner and…". The Arabic keeps the
   same ellipsis.
4. **A typo in the English** on `horse-riding-hurghada`: "Pick-up and dropp-off outside Hurghada not
   included …", in an exclusion, and the line ends without a full stop. Both are kept as they are.
5. **Raw location data in an itinerary line** on `horse-riding-hurghada`
   (`hrh-explore-makadi-bay-on-horseback-from-hurghada`): "Sahl Hasheesh, XVM5+RV7, Sahl Hasheesh, Safaga,
   Hurghada, Makadi Bay, Safaga" — a Google plus code and two repeated place names. The Arabic transliterates
   the places and keeps the plus code in Latin.
6. **`gamila-horse-stable` lists a trip whose slug is another site's slug**: its first trip is
   `horse-riding-hurghada`, which is also the slug of the second site in this group. Nothing in this batch
   depends on it — the planner works by id, and the Arabic URL `horse-riding-hurghada-ar` is scoped to the
   tenant — but it is confusing enough to be worth a look.

## 7. Publishing, in order (for the coordinator; each write needs the owner's approval for that run)

Each step is one ops-runner run (`docs/OPS_RUNNER.md`): `variableUpsert` `OPS_TASK` with `skipDeploys: true`,
`serviceInstanceDeployV2` for a commit that contains these files (the head of `feat/b18-arabic`, or `main` once
merged; Railway accepts a branch commit), read `deploymentLogs` until `[ops-runner] finished: exit code N`, then
set `OPS_TASK` back to `""`. One run at a time.

1. **Check (read-only).**
   `src/scripts/check-network-arabic-apply.ts --group=b18a`
   Expect `[check] group b18a: passed … approval <A>`, 35 rows to write, 0 present. Use the `<A>` this run
   prints, not the one recorded above.
2. **Publish b18a (write).**
   `src/scripts/apply-network-arabic.ts --group=b18a --approve=<A>`
   Expect three lines `{"apply":"network-arabic",…,"changed":true,"verified":true}` and `"completed":true`. Any
   drift since step 1 refuses the run with nothing written; run step 1 again.
3. **Verify (read-only).** Step 1 again: every site `write 0, present 3/5/12/…`, the group passed.
4. **Once the three Arabic storefront pages are live** (the separate interface work), the language step below.

### The language step: only `horse-riding-hurghada` needs it

`cairo-adventures` and `gamila-horse-stable` already list `ar`, so the switch leaves them alone
(`change: false`); `horse-riding-hurghada` is `["en"]` and is the only site that changes. Prepared, **not
run**:

5. **Dry run (read-only).**
   `src/scripts/set-arabic-languages.ts --group=b18a`
   Expect `horse-riding-hurghada` `before ["en"]`, `after ["en","ar"]`, `change: true`; the other two
   `change: false`; every site `ready: true`; `toChange: 1`; and an `approval <L>`. **A site whose trips,
   destinations or presentation are not all served in Arabic blocks the whole group**, so this step cannot pass
   before step 2 has published.
6. **Switch Arabic on (write).**
   `src/scripts/set-arabic-languages.ts --group=b18a --apply --approve=<L>`
7. **Verify (read-only).** Step 5 again: `toChange: 0`, `ready: true`, then the release's Arabic captures.

**Why that step is already guarded, journaled and reversible**, so no new script was written for it:

- *Guarded* — `--apply` refuses unless the approval digest it recomputes equals `<L>`, and each write is
  `updateOne({_id, slug, status: 'active', supportedLanguages: <exactly what the dry run saw>})`, so a
  concurrent change makes it match nothing and the run stops with `languages changed since the dry run`.
- *Journaled* — the dry run prints one line per site with `before`, `after`, `ready` and `missing`, the apply
  run prints one line per site with `changed`, and both lines land in the deployment log the ops-runner keeps.
  Record the `<L>` digest and the dry-run lines with the release evidence.
- *Reversible* — the only field written is `supportedLanguages`, and the dry run records its exact prior value
  (`["en"]` for `horse-riding-hurghada`). To roll back, set that field back to the recorded `before` with the
  same conditional shape, which hides the Arabic pages again and touches nothing else. The translation rows are
  untouched by the switch either way.
- *Fail-closed* — a site not fully served in Arabic blocks the group, so the switch can never advertise Arabic
  over missing pages.

## 8. For the owner or coordinator to decide

- **The two Arabic trading names** (section 3): `Gamila Horse Stable` and `Cairo Attractions Ticket` stand in
  Latin inside the Arabic until the client names them.
- **`cairo-adventures`'s four empty languages** and **`gamila-horse-stable`'s empty German** (section 1). Both
  are tenant records advertising languages with no records behind them, today, before this batch publishes
  anything. The storefront already offers `cairo-adventures` English and Arabic only, so the tenant record is
  the thing to correct — a tenant write, outside this batch.
- **The six English defects** in section 6, the rating claims first.
- **Destination rows** for Cairo, Luxor, Hurghada and Makadi Bay reuse the network's existing Arabic, which
  translates the English destination records' own wording ("premier", "world-class", "pristine", "exclusive").
  Changing those English records would make every network site's destination rows stale, not only these.
- **The next three sites.** Still English-only, from the fifteen the earlier brief named:
  `cairo-tours-packages`, `camel-riding-hurghada`, `cave-divers`, `giftun-island-hurghada`, `hula-hula-island`,
  `hurghada-dolphins`, `hurghada-jeep-safari`, `hurghada-luxury-cruise`, `hurghada-private-safari`,
  `makadi-excursions`, `orange-bay-tours`, `paradise-island-hurghada`, `parasailing-hurghada` and
  `coral-safari-hurghada`. Two carry custom pages (`hula-hula-island` 5, `paradise-island-hurghada` 7), which
  B18A did not have to handle. **`coral-safari-hurghada` sells no trip at all** — it is the request-only site,
  five presentation strings in total — so the language switch would refuse it and block whichever group holds
  it; it belongs in a batch of its own, or after it sells something.
