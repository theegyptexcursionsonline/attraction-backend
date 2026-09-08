import { AsyncLocalStorage } from 'async_hooks';
import { ClientSession, Schema, Types } from 'mongoose';
import { AppError } from '../middleware/error.middleware';

/** All ordinary Mongoose namespace writers share this protocol, including maintenance scripts. */
type Kind = 'page' | 'attraction';
type RecordValue = Record<string, any>;
type Claim = { tenant: string; owner: string; path: string; kind: Kind };
const MAX_BATCH = 1000;
const managedSaves = new AsyncLocalStorage<Set<string>>();
const installed = Symbol('urlNamespaceInstalled');
const executed = Symbol('urlNamespaceQueryExecuted');
const QUERY_WRITES = new Set(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete']);
const projection = (kind: Kind) => kind === 'page'
  ? { _id: 1, 'customPages._id': 1, 'customPages.slug': 1 }
  : { _id: 1, slug: 1, pathSlug: 1, tenantIds: 1 };
const objectId = (value: unknown): string | undefined => {
  const raw = value && typeof value === 'object' && '_id' in value ? (value as { _id: unknown })._id : value;
  const text = String(raw ?? '');
  return /^[a-f0-9]{24}$/i.test(text) ? text.toLowerCase() : undefined;
};
const claims = (kind: Kind, records: RecordValue[]): Claim[] => records.flatMap(record => {
  if (kind === 'page') return (record.customPages || []).flatMap((page: RecordValue, index: number) => {
    const tenant = objectId(record._id), path = typeof page.slug === 'string' ? page.slug.trim().toLowerCase() : '';
    return tenant && path ? [{ tenant, path, owner: String(page._id || `legacy-${index}`), kind }] : [];
  });
  const paths = [...new Set([record.slug, record.pathSlug].filter(value => typeof value === 'string' && value.trim()).map(value => String(value).trim().toLowerCase()))];
  return (record.tenantIds || []).flatMap((id: unknown) => {
    const tenant = objectId(id);
    return tenant ? paths.map(path => ({ tenant, path, owner: String(record._id), kind })) : [];
  });
});
const claimKey = (claim: Claim) => `${claim.tenant}:${claim.kind}:${claim.owner}:${claim.path}`;
const pathAffected = (kind: Kind, key: string): boolean => kind === 'attraction'
  ? ['slug', 'pathSlug', 'tenantIds'].includes(key.split('.')[0])
  : key === 'customPages' || /^customPages\.(?:\$[^.]*|\d+)(?:\.(?:slug|_id))?$/.test(key);
const affectsNamespace = (kind: Kind, update: unknown): boolean => {
  if (Array.isArray(update)) return true; // Pipeline effects cannot be inferred safely.
  if (!update || typeof update !== 'object') return false;
  return Object.entries(update).some(([key, value]) => {
    if (pathAffected(kind, key)) return true;
    if (!key.startsWith('$') || !value || typeof value !== 'object') return false;
    return Object.entries(value).some(([path, target]) => pathAffected(kind, path) || (key === '$rename' && typeof target === 'string' && pathAffected(kind, target)));
  });
};
const incomingTenants = (kind: Kind, value: unknown): string[] => {
  if (kind !== 'attraction' || !value || typeof value !== 'object') return [];
  const result = new Set<string>();
  const collect = (item: unknown): void => {
    if (Array.isArray(item)) item.forEach(collect);
    else if (item && typeof item === 'object' && !(item instanceof Types.ObjectId)) Object.values(item).forEach(collect);
    else { const id = objectId(item); if (id) result.add(id); }
  };
  for (const [key, item] of Object.entries(value)) {
    if (key.split('.')[0] === 'tenantIds') collect(item);
    else if (key.startsWith('$') && item && typeof item === 'object') incomingTenants(kind, item).forEach(id => result.add(id));
  }
  return [...result];
};
const transient = (error: any): boolean => error?.code === 112 || error?.code === 11000 || error?.hasErrorLabel?.('TransientTransactionError');
const unavailable = () => new AppError('Website URL updates are temporarily paused. Retry after the maintenance window.', 503);
const conflict = () => new AppError('This public URL is already used by another page or tour on the selected site.', 409);

interface Operation {
  model: any;
  kind: Kind;
  ids: string[];
  extraTenants: string[];
  read: (session?: ClientSession) => Promise<RecordValue[]>;
  session?: ClientSession;
  execute: (session: ClientSession) => Promise<any>;
}

async function validateNewClaims(operation: Operation, before: RecordValue[], session: ClientSession): Promise<void> {
  const after = await operation.model.collection.find({ _id: { $in: operation.ids.map(id => new Types.ObjectId(id)) } }, { projection: projection(operation.kind), session }).toArray();
  const oldCounts = new Map<string, number>();
  claims(operation.kind, before).forEach(claim => oldCounts.set(claimKey(claim), (oldCounts.get(claimKey(claim)) || 0) + 1));
  const introduced = claims(operation.kind, after).filter(claim => {
    const key = claimKey(claim), remaining = oldCounts.get(key) || 0;
    if (remaining) { oldCounts.set(key, remaining - 1); return false; }
    return true;
  });
  const groups = new Map<string, Map<string, Claim>>();
  for (const claim of introduced) {
    const group = groups.get(claim.tenant) || new Map<string, Claim>();
    const existing = group.get(claim.path);
    if (existing && (existing.owner !== claim.owner || existing.kind !== claim.kind)) throw conflict();
    group.set(claim.path, claim);
    groups.set(claim.tenant, group);
  }
  for (const [tenant, group] of groups) {
    const tenantId = new Types.ObjectId(tenant);
    const record = await operation.model.db.collection('tenants').findOne({ _id: tenantId }, { projection: projection('page'), session });
    if (!record) throw new AppError('The selected website no longer exists.', 400);
    const pages = new Map<string, Claim[]>();
    for (const page of claims('page', [record])) pages.set(page.path, [...(pages.get(page.path) || []), page]);
    for (const claim of group.values()) {
      const matchingPages = pages.get(claim.path) || [];
      if (matchingPages.some(page => claim.kind !== 'page' || page.owner !== claim.owner) || (claim.kind === 'page' && matchingPages.length > 1)) throw conflict();
    }
    const paths = [...group.keys()];
    const tours = operation.model.db.collection('attractions').find({ tenantIds: tenantId, $or: [{ slug: { $in: paths } }, { pathSlug: { $in: paths } }] }, { projection: { _id: 1, slug: 1, pathSlug: 1 }, session }).batchSize(100);
    try {
      for await (const tour of tours) {
        for (const path of [tour.slug, tour.pathSlug]) {
          const claim = group.get(path);
          if (claim && (claim.kind !== 'attraction' || claim.owner !== String(tour._id))) throw conflict();
        }
      }
    } finally { await tours.close(); }
  }
}

async function runNamespace(operation: Operation): Promise<any> {
  const preliminary = await operation.read(operation.session);
  const tenants = new Set([...claims(operation.kind, preliminary).map(claim => claim.tenant), ...operation.extraTenants]);
  if (!tenants.size) return operation.execute(operation.session as ClientSession);
  if (process.env.URL_NAMESPACE_WRITES_READY !== 'true') throw unavailable();
  if (tenants.size > MAX_BATCH) throw new AppError('Split this URL update into smaller batches.', 400);
  if (operation.session && !operation.session.inTransaction()) throw new AppError('Website URL updates require an active transaction when a session is supplied.', 503);
  const owned = !operation.session;
  let result: any;
  let attempts = 0;
  const transaction = async (session: ClientSession) => {
    if (++attempts > 8) throw new AppError('Another editor is changing website URLs. Reload and retry.', 409);
    if (attempts > 1) await new Promise(resolve => setTimeout(resolve, 25 * attempts));
    for (const id of [...tenants].sort()) {
      await operation.model.db.collection('url_namespace_locks').updateOne({ _id: new Types.ObjectId(id) }, { $inc: { revision: 1 } }, { upsert: true, session });
    }
    const before = await operation.read(session);
    const additional = claims(operation.kind, before).map(claim => claim.tenant).filter(id => !tenants.has(id));
    if (additional.length) {
      additional.forEach(id => tenants.add(id));
      const changed = new operation.model.db.base.mongo.MongoServerError({ message: 'Website assignment changed during URL update', code: 112 });
      changed.addErrorLabel('TransientTransactionError');
      throw changed;
    }
    if (operation.ids.length > MAX_BATCH) throw new AppError('Split this URL update into smaller batches.', 400);
    result = await managedSaves.run(new Set(operation.ids.map(id => `${operation.model.db.id}:${operation.kind}:${id}`)), () => operation.execute(session));
    await validateNewClaims(operation, before, session);
    return result;
  };
  try {
    // Connection.transaction resets Mongoose document state between driver retries.
    // Re-running only a collision preflight would not make an aborted save retry-safe.
    return owned
      ? await operation.model.db.transaction(transaction, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 5000 })
      : await transaction(operation.session!);
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    if (error?.code === 20 || error?.codeName === 'IllegalOperation') throw new AppError('Website URL changes require transaction-capable database configuration.', 503);
    // Let an outer transaction retry its entire business operation on a write conflict.
    if (!owned && error?.hasErrorLabel?.('TransientTransactionError')) throw error;
    if (transient(error)) throw new AppError('Another editor changed this website URL. Reload and retry.', 409);
    throw error;
  } finally {
    if (owned) {
      const restore = (value: any): void => { if (Array.isArray(value)) value.forEach(restore); else if (value?.$session) value.$session(null); };
      restore(result);
    }
  }
}

async function readMatching(model: any, kind: Kind, filter: RecordValue, session?: ClientSession, one = false, options: RecordValue = {}): Promise<RecordValue[]> {
  let cursor = model.collection.find(filter, { projection: projection(kind), ...(session ? { session } : {}), ...(options.collation ? { collation: options.collation } : {}), ...(options.let ? { let: options.let } : {}) });
  if (options.sort) cursor = cursor.sort(options.sort);
  const docs = await cursor.limit(one ? 1 : MAX_BATCH + 1).toArray();
  if (docs.length > MAX_BATCH) throw new AppError('Split this URL update into batches of at most 1000 records.', 400);
  return docs;
}

/** Wrap the complete operation, rather than a pre-save check, so collision failures roll back the entity write. */
export function urlNamespacePlugin(schema: Schema, options: { kind: Kind }): void {
  schema.pre('aggregate', function() {
    if (this.pipeline().some((stage: RecordValue) => stage.$out !== undefined || stage.$merge !== undefined)) {
      throw new AppError('Aggregation writes cannot claim website URLs. Use guarded model writes.', 400);
    }
  });
  schema.on('init', (model: any) => {
    if (Object.prototype.hasOwnProperty.call(model, installed)) return;
    model[installed] = true;
    const kind = options.kind;
    const save = model.prototype.save;
    model.prototype.save = async function(saveOptions: RecordValue = {}) {
      if (managedSaves.getStore()?.has(`${model.db.id}:${kind}:${this._id}`)) return save.call(this, saveOptions);
      const relevant = this.isNew ? claims(kind, [this.toObject()]).length > 0 : this.modifiedPaths().some((path: string) => pathAffected(kind, path));
      if (!relevant) return save.call(this, saveOptions);
      const originalSession = saveOptions.session || this.$session();
      const doc = this;
      const snapshot = this.toObject();
      try {
        return await runNamespace({ model, kind, ids: [String(this._id)], extraTenants: claims(kind, [snapshot]).map(claim => claim.tenant), session: originalSession || undefined,
          read: session => readMatching(model, kind, { _id: doc._id }, session),
          execute: session => save.call(doc, { ...saveOptions, ...(session ? { session } : {}) }),
        });
      } finally { if (!originalSession) doc.$session(null); }
    };
    model.prototype.$save = model.prototype.save;
    const exec = model.Query.prototype.exec;
    model.Query.prototype.exec = async function(...args: unknown[]) {
      const deleting = this.op.startsWith('delete') || this.op === 'findOneAndDelete';
      const replacing = this.op === 'replaceOne' || this.op === 'findOneAndReplace';
      if (!QUERY_WRITES.has(this.op) || (!deleting && !replacing && !affectsNamespace(kind, this.getUpdate()))) return exec.apply(this, args);
      if (this[executed]) throw new Error('Query was already executed');
      this[executed] = true;
      if (Array.isArray(this.getUpdate())) throw new AppError('Pipeline writes cannot change website URLs. Use an explicit update.', 400);
      const query = this, queryOptions = this.getOptions(), filter = this.cast(model);
      const update = this.getUpdate() || {};
      let insertedId: string | undefined;
      if (queryOptions.upsert) {
        insertedId = objectId(filter._id) || objectId(update._id) || objectId(update.$setOnInsert?._id) || String(new Types.ObjectId());
        this.setUpdate(replacing ? { ...update, _id: new Types.ObjectId(insertedId) } : { ...update, $setOnInsert: { ...update.$setOnInsert, _id: new Types.ObjectId(insertedId) } });
      }
      const ids: string[] = insertedId ? [insertedId] : [];
      const one = !['updateMany', 'deleteMany'].includes(this.op);
      const extras = [...incomingTenants(kind, update), ...incomingTenants(kind, filter)];
      if (kind === 'page' && insertedId) extras.push(insertedId);
      const previousSession = queryOptions.session;
      return runNamespace({ model, kind, ids, extraTenants: extras, session: previousSession,
        read: async session => {
          const docs = await readMatching(model, kind, filter, session, one, queryOptions);
          for (const doc of docs) { const id = String(doc._id); if (!ids.includes(id)) ids.push(id); if (kind === 'page' && !extras.includes(id)) extras.push(id); }
          return docs;
        },
        execute: session => { const attempt = query.clone(); if (session) attempt.setOptions({ session }); return exec.apply(attempt, args); },
      });
    };
    for (const method of ['create', 'insertMany']) {
      const original = model[method];
      model[method] = async function(...args: any[]) {
        const arrayInput = Array.isArray(args[0]);
        const input = arrayInput ? args[0] : (method === 'create' ? args.filter(arg => arg != null) : [args[0]]);
        const documents = input.map((document: any) => {
          const value = document?.toObject ? document.toObject() : { ...document };
          if (value._id && !objectId(value._id)) throw new AppError('Invalid record identifier.', 400);
          return { ...value, _id: value._id || new Types.ObjectId() };
        });
        if (!documents.length || !claims(kind, documents).length) return original.apply(this, args);
        if (documents.length > MAX_BATCH) throw new AppError('Split this URL update into batches of at most 1000 records.', 400);
        const writeOptions = arrayInput || method === 'insertMany' ? args[1] || {} : {};
        if (writeOptions.lean === true) throw new AppError('Website URL batches require schema normalization. Remove the lean option.', 400);
        if (writeOptions.ordered === false || writeOptions.aggregateErrors === true) throw new AppError('Website URL batches must be ordered and atomic.', 400);
        const ids = documents.map((doc: RecordValue) => String(doc._id));
        const result = await runNamespace({ model, kind, ids, extraTenants: claims(kind, documents).map(claim => claim.tenant), session: writeOptions.session,
          read: session => readMatching(model, kind, { _id: { $in: ids.map((id: string) => new Types.ObjectId(id)) } }, session),
          execute: session => original.call(model, documents, { ...writeOptions, ordered: true, session }),
        });
        return method === 'create' && !arrayInput && documents.length === 1 ? result[0] : result;
      };
    }
    const bulkWrite = model.bulkWrite;
    model.bulkWrite = async function(operations: any[], writeOptions: RecordValue = {}) {
      const sensitive = operations.some(op => op.insertOne || op.replaceOne || op.deleteOne || op.deleteMany || affectsNamespace(kind, op.updateOne?.update || op.updateMany?.update));
      if (!sensitive) return bulkWrite.call(model, operations, writeOptions);
      if (operations.length > MAX_BATCH || writeOptions.ordered === false) throw new AppError('Website URL batches must be ordered and contain at most 1000 operations.', 400);
      const ids: string[] = [], extras: string[] = [];
      const normalized = operations.map(op => {
        const type = Object.keys(op)[0], spec = { ...op[type] };
        if (Array.isArray(spec.update)) throw new AppError('Pipeline writes cannot change website URLs. Use an explicit update.', 400);
        if (type === 'insertOne') { spec.document = { ...spec.document, _id: spec.document._id || new Types.ObjectId() }; ids.push(String(spec.document._id)); extras.push(...claims(kind, [spec.document]).map(claim => claim.tenant)); }
        else {
          const query = model.find(spec.filter || {}); spec.filter = query.cast(model);
          extras.push(...incomingTenants(kind, spec.update || spec.replacement), ...incomingTenants(kind, spec.filter));
          if (spec.upsert) {
            const id = objectId(spec.filter._id) || objectId(spec.replacement?._id) || objectId(spec.update?.$setOnInsert?._id) || String(new Types.ObjectId());
            ids.push(id); if (kind === 'page') extras.push(id);
            if (spec.replacement) spec.replacement = { ...spec.replacement, _id: new Types.ObjectId(id) };
            else spec.update = { ...spec.update, $setOnInsert: { ...spec.update?.$setOnInsert, _id: new Types.ObjectId(id) } };
          }
        }
        return { [type]: spec };
      });
      return runNamespace({ model, kind, ids, extraTenants: extras, session: writeOptions.session,
        read: async session => {
          const records: RecordValue[] = [];
          for (const op of normalized) {
            const type = Object.keys(op)[0], spec = op[type];
            if (type === 'insertOne') continue;
            const docs = await readMatching(model, kind, spec.filter, session, !type.endsWith('Many'), spec);
            for (const doc of docs) { const id = String(doc._id); if (!ids.includes(id)) ids.push(id); if (kind === 'page' && !extras.includes(id)) extras.push(id); }
            records.push(...docs);
          }
          if (ids.length > MAX_BATCH) throw new AppError('Split this URL update into batches of at most 1000 records.', 400);
          return records;
        },
        execute: session => bulkWrite.call(model, normalized, { ...writeOptions, ordered: true, session }),
      });
    };
  });
}

export const urlNamespaceReadiness = () => ({ protocol: 1, writesReady: process.env.URL_NAMESPACE_WRITES_READY === 'true' });
