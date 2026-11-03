# B17 Arabic records: prepared and checked, not published

State on 3 November 2026: **prepared, committed and pushed on `feat/b17-arabic`; the read-only apply check passes
for all eighteen sites on the branch head; nothing is published.** Every publishing step below is a production write and needs the
owner's approval for that run.

Sites, three groups of six, 18 trips and 54 rows:

| Group | Sites |
|---|---|
| `b17a` | `erg-abu-ramada`, `shabruhr-umm-gamar`, `hamda`, `ras-hankorab`, `qulaan`, `wadi-lahmy` |
| `b17b` | `daedalus-reef`, `el-ikhwa-islands`, `zabargad-island`, `hebat-allah-wreck`, `blue-lagoon-dahab`, `ein-kid` |
| `b17c` | `seven-pools`, `wadi-zaghara`, `gebel-el-rosas-bay`, `marsa-abu-galawa`, `skar-transport-cairo`, `future-travel-egypt` |

## 1. Why the groups are new, and the state the sites are in

B14's groups were the seed batches themselves. These eighteen sites were seeded in four batches — `B15A`, `B15B`
(`network-sites/b15.ts`), `B15C` (`b15c.ts`) and `B16` (`b16.ts`) — and none of those holds six. A group here is
only the unit one ops-runner run takes, so `src/scripts/network-arabic/b17.ts` regroups them into three sixes, each
group keeping its sites in the order its seed batch lists them, and each site taken from its seed batch **by
reference**, so no site describes itself twice. The groups are registered in the export script's `NETWORK_BATCHES`
and in `network-arabic/publish.ts`'s `PUBLISH_BATCHES` (folder `b17`), which is what the read-only apply check, the
publication and the language switch all read.

Every one of the eighteen, read in production on 3 November: `status: active`, platform domain
`<slug>.foxesnetwork.com`, **no `customDomain`**, `supportedLanguages: ['en']`, one live trip, one destination, one
tenant presentation and **no custom pages** — and **no existing translation row of any kind**, in any locale. The
repository's own presentation exporter refuses all eighteen ("Verified active tenant and domain required"), which is
why `network-arabic/publish.ts` plans the rows instead, verifying a site by id, slug, platform domain and active
status; a database test (`network-arabic-publish.database.test.ts`) proves its rows are identical to the repository
planners' rows for the same site, apart from generated ids and timestamps.

Destinations, as `export-attraction-localization.ts` lists them for each site: `hurghada` (4 sites), `marsa-alam`
(7), `sharm-el-sheikh` (4), `el-gouna` (1), `cairo` (2). Rows per site: 3 — one trip, one destination, one
presentation. 54 in all, 18 to a group.

## 2. What was exported

`src/scripts/export-network-arabic-sources.ts --batch=b17a,b17b,b17c` (read-only; no insert, update or delete;
connects with `autoIndex: false, autoCreate: false`) prints, as tagged base64 log chunks with a digest per part:
per site, the tenant presentation sources with their snapshots and export digest, each live trip's translatable
fields with `sourceUpdatedAt` and snapshot digest, and each destination; then the network's existing Arabic as a
translation memory (8,775 English strings with their renderings, read from 102 sites) and examples for the shared
terms, to which this batch added the places the B17 facts name — Sinai and the Gulf of Aqaba, Cairo and Giza, El
Gouna and the Hurghada reefs, the Marsa Alam coast and the open sea.

Found: 18 sites, 18 trips, 18 destination sources, 18 presentation sources (no custom pages), **no existing
translation rows for any of the eighteen**, 789 unique English strings, 473 of them already rendered somewhere on
the network.

**Two export runs.** The first, on commit `cf85c20c` for `b17a` alone, printed every site's source part and then
showed nothing further for forty minutes, so it was left without a recorded exit code. The second, on commit
`ed4fd26f` for all three groups, **finished with exit code 0**: 23 parts, 789 batch strings, 473 of them already
rendered, `databaseWrites: 0`. Its per-site tenant ids, presentation digests, `sourceUpdatedAt` values and snapshot
digests are **identical to the ones the payloads carry** — checked record by record, 0 mismatches. (Railway's log
API lags behind the container: the second run's reader was still reporting 38 log lines when the run had in fact
already printed all 203 and its exit line, so a run that looks stalled there may simply not have been shipped to
the log yet.)

## 3. Strings: reused and new

789 unique English strings: **473 reused** from the network's published Arabic (the majority reading kept) and
**315 new**, written for this batch (61,399 English characters). One further string was taken from a storefront
brand file. Readings, in order of precedence: the network's published Arabic, then the site's own storefront brand
file, then the place's own recorded Arabic spelling.

| Site | Group | Trips | Rows | Unique strings | Reused | New |
|---|---|---|---|---|---|---|
| erg-abu-ramada | b17a | 1 | 3 | 78 | 60 | 18 |
| shabruhr-umm-gamar | b17a | 1 | 3 | 84 | 67 | 17 |
| hamda | b17a | 1 | 3 | 76 | 58 | 18 |
| ras-hankorab | b17a | 1 | 3 | 62 | 44 | 18 |
| qulaan | b17a | 1 | 3 | 62 | 44 | 18 |
| wadi-lahmy | b17a | 1 | 3 | 62 | 44 | 18 |
| daedalus-reef | b17b | 1 | 3 | 70 | 53 | 17 |
| el-ikhwa-islands | b17b | 1 | 3 | 65 | 48 | 17 |
| zabargad-island | b17b | 1 | 3 | 80 | 63 | 17 |
| hebat-allah-wreck | b17b | 1 | 3 | 70 | 53 | 17 |
| blue-lagoon-dahab | b17b | 1 | 3 | 91 | 73 | 18 |
| ein-kid | b17b | 1 | 3 | 82 | 64 | 18 |
| seven-pools | b17c | 1 | 3 | 71 | 53 | 18 |
| wadi-zaghara | b17c | 1 | 3 | 81 | 63 | 18 |
| gebel-el-rosas-bay | b17c | 1 | 3 | 71 | 53 | 18 |
| marsa-abu-galawa | b17c | 1 | 3 | 74 | 56 | 18 |
| skar-transport-cairo | b17c | 1 | 3 | 67 | 49 | 18 |
| future-travel-egypt | b17c | 1 | 3 | 75 | 58 | 17 |

(Per-site counts overlap: a string shared by two sites counts on both.)

Payloads: `src/scripts/network-arabic/b17/<slug>.json`, each record with its English source, its Arabic, its source
version and digest. Glossary: `src/scripts/network-arabic/b17/glossary.json`, 115 terms.

### Readings

Place names follow the network's live Arabic: الغردقة · مرسى علم · الجونة · شرم الشيخ · دهب · القاهرة · الجيزة ·
القصير · بورت غالب · مرسى مبارك · مرسى شونة · حماطة · جفتون (جفتون الصغيرة / جفتون الكبيرة) · أورانج باي ·
**ماجاويش** · أم قمر · بيت الدلافين · شعب سمداي · شعب كيرلس · رأس محمد · الجزيرة البيضاء · الثقب الأزرق ·
الوادي الملون · وادي سلامة الملون · وادي الجمال · شرم اللولي · أبو الهول · سقارة · ممفيس · ميدان التحرير ·
المتحف المصري.

The eighteen sites' own names take the readings their storefront brand files set: عرق أبو رمادة ·
شعب رهر أم قمر · حمدة · رأس حنكوراب · قلعان · وادي لحمي · شعب ديدالوس (وأبو الكيزان) · جزر الإخوة (الأخ الأكبر /
الأخ الأصغر) · جزيرة الزبرجد · البحيرة الزرقاء · وادي زغرة · جبل الرصاص · مرسى أبو جلاوة · رأس أبو جالوم ·
مسار سيناء · العبابدة.

Six names have no published Arabic form and stand in Latin inside the Arabic, exactly as their brand files require,
with an Arabic gloss of what each is beside them: `Camel Reef`, `Ein Kid` / `Ein Kidd`, `Seven Pools`,
`Hebat Allah` (with هبة الله as a gloss, never as the site's Arabic title), `SKAR Transport Cairo` and
`Future Travel Egypt`. The glossary records that a name a brand file keeps in Latin counts as its own reading, so
the checker accepts `SKAR Transport Cairo` where the English says Cairo.

### Two brand-file disagreements, resolved by the precedence rule

1. **Magawish.** The network's published Arabic reads **ماجاويش** (Magawish Island = جزيرة ماجاويش, live on other
   sites, and B14's own decision). `components/safarikit/brands/ergaburamada/copy.ts` writes **مجاويش**. The records
   follow the network: **ماجاويش**, and the glossary lists مجاويش under `avoid`. The brand file is the one that
   should change, not the records.
2. **Elphinstone Reef.** `brands/elphinstone/copy.ts` and `brands/ikhwa/copy.ts` read **شعاب الفينستون** (the
   network's live reading, and B14's decision); `brands/daedalus/copy.ts` writes **شعب إلفنستون**. No B17 record
   names Elphinstone, so nothing here depends on it, but the `daedalus` brand file disagrees with the network and
   with B14's glossary (`avoid: شعب إلفنستون`).

Both are frontend-repo matters for the coordinator; neither changes a payload.

### One term the network itself reads two ways

**Calamari** appears on the network as both كلماري and كاليماري. The one B17 record that names it (`hamda`'s
schedule line) reuses the published string, كاليماري, so no new reading was introduced, and `calamari` is left out
of the glossary rather than pretending the network has settled it.

## 4. Checker

`src/__tests__/network-arabic-b17-payload.test.ts`, **0 problems, 9/9 passing**: every site of the three groups is
covered with its trip, its destination and its presentation, 18 trips and 54 rows; every source string has its
Arabic and nothing is invented where the English is empty; no English prose is left standing in an Arabic field;
ids, indexes, URLs, placeholders, markup and `\n\n` paragraph breaks are kept (presentation on one line, as the
presentation schema requires); Latin digits only and the same numbers in every string; one English string keeps one
Arabic reading across the eighteen sites; every glossary term keeps its one reading and no second reading appears
anywhere; nothing claims more than the English does; and the repository's own content schemas and completeness
validators accept every record.

Two of the claim rules were widened to the English that warrants the Arabic word, and only that: `stargazing` and
`astronom` for النجوم (the stars of the sky, in `ein-kid`'s published inclusion "Stargazing session with
professional telescopes"), and `gourmet` for فاخر (in `seven-pools`'s published "Gourmet lunch"). Both Arabic
strings are the network's own published renderings.

With it: `network-arabic-b17-groups.test.ts` (4) proves the three groups cover the eighteen sites exactly once, six
to a group, each taken from its seed batch by reference, and that the export, the apply check, the publication and
the language switch all accept them; `network-arabic-text.test.ts` (7) and `network-arabic-publish.database.test.ts`
(6) are unchanged in substance. `npm run lint` (tsc --noEmit) is clean, and the full jest suite is green: 292 suites, 4,777 tests, 0 failures.

## 5. Read-only apply check

`OPS_TASK="src/scripts/check-network-arabic-apply.ts --group=b17a,b17b,b17c"`, run on commit `327f63c8` (the head of
`feat/b17-arabic`), exit code 0, every group passed:

| Group | Sites | Rows to write | Rows present | Sources matched | Approval digest |
|---|---|---|---|---|---|
| b17a | 6 | 18 | 0 | 18/18 | `56901167dfd50f2cad378316bf2c51bb02862e6e1616388034697484162bdf6c` |
| b17b | 6 | 18 | 0 | 18/18 | `8dd3415cbf475c557880ed88fa701c502f176229b1d48f24185279dba0b8ffdf` |
| b17c | 6 | 18 | 0 | 18/18 | `094dd9b36fa882b0e46f7e3fbf607524bf611737cadfd341013252984d32827a` |

Per site, every one of the eighteen: 3 rows to write, 0 present, 3/3 sources matched, no mismatch anywhere.

| Site | Group | Approval digest |
|---|---|---|
| erg-abu-ramada | b17a | `8ea0ea59a3776600c34eaae6aaf2f528a53d0963b381b222384ad9d1364bba84` |
| shabruhr-umm-gamar | b17a | `fd0d47af0560458702afb17f8fe949762a53c9361d77e8dbb588ad14626cbab8` |
| hamda | b17a | `3c0e2610b19c749227bef2d0ae76ba7845b3a8911d03c316639b6ec09c519dfb` |
| ras-hankorab | b17a | `b488c9c72954551c2753d388cb28580e241624cc7976c6da3793a21c23ff6875` |
| qulaan | b17a | `bcdf69b0cb15c07086d018bf98fdf6cc88082d3ad13e4bc9b56260b5eb110d99` |
| wadi-lahmy | b17a | `5dbb318a5674abe3c365d3bfa42e6ecd0f8d93ac921032a6d336c6e4c8545b95` |
| daedalus-reef | b17b | `58cf45f187a967d4c2f3cfacfc11741d8087ef94f8c49c5cfe2dc33092220d6d` |
| el-ikhwa-islands | b17b | `998e4bd35776e2651d94f30398bb33da9eb32293a01becc04713fb2553fc07cc` |
| zabargad-island | b17b | `1dbea1359a88c86c2eca1e740ac6a49edb765e8edd80d83810fa7ee4e3af7ada` |
| hebat-allah-wreck | b17b | `f5f80d130a9add8a61553ff906ad7c5225d344eda8f4d9a222e4f75530a3cb32` |
| blue-lagoon-dahab | b17b | `aeefdccda082dc0c8f7074c6f3ad3c301d7a7f5aebbcece6a332a20bb9478990` |
| ein-kid | b17b | `06157a3974dc35d10490aa5f75c201a21267b1f9ea673c347394ed8ff4308dc5` |
| seven-pools | b17c | `14ea979d1a385b9f509ff63eac1e92312b70f4a6832fb65c777048bfe3559e93` |
| wadi-zaghara | b17c | `2d507f500bad7b4b4d73e18d3ff1710708fd69b2f5dff21cc25d7830fc0b2446` |
| gebel-el-rosas-bay | b17c | `175348dc433eeb63f1b34da1bedd88480761635edb39d9be8f9c7ba3f3b5eb52` |
| marsa-abu-galawa | b17c | `231adda6af9ee7eacd048f22aefff6102070248deba686b1b669c459ce3994b9` |
| skar-transport-cairo | b17c | `c10230296ffa7840d84085acbac3f0fac2ac6dcaebbc48ec00ccafbaf16c9eef` |
| future-travel-egypt | b17c | `54057d3bd5d6d6e6d629d961277e48b0d8d58f76a8a14d9ee8290b38de06e967` |

An earlier run of the same check on `ed4fd26f`, before the nine lines of the read-back pass (`327f63c8`), gave the
same result and the same digests for `b17a` and for the twelve sites that pass unchanged; the six sites whose Arabic
changed, and the two groups holding them, changed digest, as the digest design intends.

**The digests hold only while production is unchanged: take them from a fresh check run immediately before
publishing.**

Ops-runner runs for this work, all read-only, each followed by `OPS_TASK` reset to `""`:

| Task | Commit | Exit |
|---|---|---|
| `export-network-arabic-sources.ts --batch=b17a` | `cf85c20c` | no exit line within 40 minutes (section 2) |
| `check-network-arabic-apply.ts --group=b17a` | `ed4fd26f` | 0 |
| `check-network-arabic-apply.ts --group=b17b` | `ed4fd26f` | 0 |
| `check-network-arabic-apply.ts --group=b17c` | `ed4fd26f` | 0 |
| `export-network-arabic-sources.ts --batch=b17a,b17b,b17c` | `ed4fd26f` | 0 |
| `check-network-arabic-apply.ts --group=b17a,b17b,b17c` | `327f63c8` | 0 |

## 6. Publishing, in order (for the coordinator; each write needs the owner's approval for that run)

Each step is one ops-runner run (`docs/OPS_RUNNER.md`): `variableUpsert` `OPS_TASK` with `skipDeploys: true`,
`serviceInstanceDeployV2` for a commit that contains these files (the head of `feat/b17-arabic`, or `main` once
merged; Railway accepts a branch commit), read `deploymentLogs` until `[ops-runner] finished: exit code N`, then set
`OPS_TASK` back to `""`. One run at a time.

1. **Check (read-only).** `src/scripts/check-network-arabic-apply.ts --group=b17a,b17b,b17c`
   Expect `[check] group b17a: passed … approval <A>` and the same for `b17b` `<B>` and `b17c` `<C>`, 54 rows to
   write, 0 present.
2. **Publish b17a (write).** `src/scripts/apply-network-arabic.ts --group=b17a --approve=<A>`
   Expect six lines `{"apply":"network-arabic",…,"changed":true,"verified":true}` and `"completed":true`. Any drift
   since step 1 refuses the run with nothing written; run step 1 again.
3. **Publish b17b (write).** `src/scripts/apply-network-arabic.ts --group=b17b --approve=<B>`
4. **Publish b17c (write).** `src/scripts/apply-network-arabic.ts --group=b17c --approve=<C>`
   (One group's publication does not touch another's rows, so `<B>` and `<C>` from step 1 stay valid.)
5. **Verify 1 (read-only).** Step 1 again: every site `write 0, present 3`, all three groups passed.
6. **Once a group's Arabic storefront pages are live** (release, handover step 5):
   `src/scripts/set-arabic-languages.ts --group=b17a` (read-only dry run). Expect every site `ready: true`,
   `before ["en"]`, `after ["en","ar"]`, and an `approval <L1>`. A site with any trip, destination or presentation
   not served in Arabic blocks the group.
7. **Switch Arabic on, b17a (write).** `src/scripts/set-arabic-languages.ts --group=b17a --apply --approve=<L1>`
8. **Same for b17b and b17c:** dry run per group for `<L2>` and `<L3>`, then `--apply --approve=` each.
9. **Verify 2 (read-only).** Dry run for each group: `toChange: 0`, `ready: true`; then the release's Arabic
   captures of the eighteen sites.

## 7. For the owner or coordinator to decide

- **The two brand-file disagreements** in section 3: `ergaburamada`'s مجاويش against the network's ماجاويش, and
  `daedalus`'s شعب إلفنستون against the network's شعاب الفينستون. The records follow the network in both cases, as
  the precedence rule says; the frontend files are the ones to bring into line, in the storefront repo.
- **Destination rows** for Hurghada, Marsa Alam, Sharm El Sheikh, El Gouna and Cairo reuse the network's existing
  Arabic, which translates the English destination records' own wording ("premier", "world-class", "pristine",
  "paradise"). Changing those English records would make every network site's destination rows stale.
- **The five business and no-position sites** (`skar-transport-cairo`, `future-travel-egypt`, `ein-kid`,
  `seven-pools`, `marsa-abu-galawa`) carry the same silences in Arabic as in English: no coined Arabic trading or
  place name, no coordinate, no distance where none is published, and no telephone number, address or price of the
  business. Their Arabic says in Arabic what the thing is, beside its Latin name.
- **`hebat-allah-wreck`** keeps the ship's name in Latin with هبة الله only as a gloss, and says in Arabic that no
  day sold there dives the wreck.
