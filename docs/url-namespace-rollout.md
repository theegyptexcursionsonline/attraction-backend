# Website URL namespace protocol

Protocol 1 serializes namespace changes for each website in MongoDB transactions. Pages and tours reserve both their stored slug and tour pathSlug; drafts and archived records retain their URLs until renamed or removed. The underlying page and attraction data remain authoritative. There is no claim backfill or destructive migration.

Ordinary Mongoose document saves (including `$save` and insertOne), create, insertMany, query updates/replacements/deletes and bulkWrite use the same model plugin. Bulk changes are atomic, ordered and limited to 1,000 records. Unsafe pipeline writes, aggregation output writes and lean batch inserts that bypass schema normalization are rejected. Application and maintenance code must use the guarded models, never raw collection writes. Direct database administration remains outside application enforcement.

Namespace collisions return HTTP 409. During the initial cutover, namespace mutations return HTTP 503 unless `URL_NAMESPACE_WRITES_READY=true`. Ordinary title, content, lifecycle and settings updates and all reads remain available. Transactions require a MongoDB replica set or sharded cluster; unsupported configuration fails closed.

## Initial rollout

1. Ship protocol-capable code with `URL_NAMESPACE_WRITES_READY` absent or false. The health response must report `urlNamespace.protocol=1` and `writesReady=false`.
2. Verify every previous deployment instance and its in-flight writes have drained. Old code does not participate in this protocol; an environment flag cannot constrain an old binary.
3. Set `URL_NAMESPACE_WRITES_READY=true`, restart the protocol-capable runtime, and verify the health response reports protocol 1 with writesReady true.
4. Verify one website-specific conflict rejection and a permitted namespace change. Retain the exact deployment and evidence before reporting the transition complete.

The first guarded write lazily creates a document in `url_namespace_locks` for each affected website. Its existing unique `_id` index serializes transactions; counters are not leases and do not require cleanup. Additive nonunique tenant/slug indexes accelerate lookups and tolerate existing collisions.

## Read-only audit

Use `npm run audit:url-namespace -- --tenant <website-slug> --page 1` against the verified database configuration. The command disables automatic collection/index creation and only reads. Results paginate through the database, 100 collisions per page. Continue through totalPages. An audit does not authorize renaming or deleting conflicting records.

Existing ambiguous URLs remain unchanged until deliberately repaired. Ordinary edits continue to work. A newly introduced owner/path is always checked against current pages and tours inside the transaction, including old records without namespace metadata.

## Rollback

First set `URL_NAMESPACE_WRITES_READY=false` and verify all protocol-capable instances report writesReady false. This pauses namespace writes without altering stored pages, tours or URLs. Roll back to another protocol-capable build while keeping this pause. Retain the lock collection and additive indexes.

Rolling back to pre-protocol code is not safe while writes remain reachable: that code ignores the flag and locks. If such a rollback is necessary, first block namespace mutation routes at the deployment boundary, drain in-flight writes, and keep that external write block until protocol-capable code is restored. Never drop locks or discard page/tour data as a rollback shortcut.
