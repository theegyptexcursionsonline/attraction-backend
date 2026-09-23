import { createHash } from 'crypto';
import { Types } from 'mongoose';

export type CursorField = { field: string; direction: 1 | -1; kind: 'number' | 'boolean' | 'date' | 'id' };
type Value = string | number | boolean;
export class InvalidPublicCursor extends Error { statusCode = 400; constructor() { super('This page link is invalid for the selected filters. Start from the first page.'); } }

/** Cursors are positions, never permissions: callers must always retain the
 * tenant/public predicate. Bind positions to the complete filter and ordering. */
export function publicCursorPlan(query: object, fields: CursorField[], token?: string) {
  const binding = createHash('sha256').update(JSON.stringify({ query, fields }, (_key, value) => value instanceof RegExp ? { source: value.source, flags: value.flags } : value)).digest('hex').slice(0, 32);
  let cursor: { direction: 'after' | 'before'; values: Value[] } | undefined;
  if (token !== undefined) {
    try {
      if (!/^[A-Za-z0-9_-]{1,2048}$/.test(token)) throw new Error();
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
      if (decoded.v !== 1 || decoded.binding !== binding || !['after', 'before'].includes(decoded.direction) || !Array.isArray(decoded.values) || decoded.values.length !== fields.length) throw new Error();
      decoded.values.forEach((value: unknown, index: number) => {
        const kind = fields[index].kind;
        if (kind === 'number' ? typeof value !== 'number' || !Number.isFinite(value)
          : kind === 'boolean' ? typeof value !== 'boolean'
          : kind === 'id' ? typeof value !== 'string' || !/^[a-f0-9]{24}$/.test(value)
          : typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error();
      });
      cursor = decoded;
    } catch { throw new InvalidPublicCursor(); }
  }
  const convert = (value: Value, index: number) => fields[index].kind === 'id' ? new Types.ObjectId(String(value)) : fields[index].kind === 'date' ? new Date(String(value)) : value;
  const normalized = Object.fromEntries(fields.map((item, index) => [`_cursor${index}`, { $ifNull: [`$${item.field}`, item.kind === 'date' ? new Date(0) : item.kind === 'boolean' ? false : 0] }]));
  const sort = Object.fromEntries(fields.map((item, index) => [`_cursor${index}`, item.direction * (cursor?.direction === 'before' ? -1 : 1)])) as Record<string, 1 | -1>;
  const seek = cursor ? { $or: fields.map((item, index) => ({
    ...Object.fromEntries(fields.slice(0, index).map((_field, previous) => [`_cursor${previous}`, convert(cursor!.values[previous], previous)])),
    [`_cursor${index}`]: { [item.direction * (cursor!.direction === 'before' ? -1 : 1) === 1 ? '$gt' : '$lt']: convert(cursor!.values[index], index) },
  })) } : null;
  const page = (input: Record<string, any>[], limit: number, total: number) => {
    const extra = input.length > limit;
    const rows = input.slice(0, limit);
    if (cursor?.direction === 'before') rows.reverse();
    const encode = (row: Record<string, any>, direction: 'after' | 'before') => Buffer.from(JSON.stringify({ v: 1, binding, direction, values: fields.map((_field, index) => row[`_cursor${index}`]) })).toString('base64url');
    const previous = rows.length > 0 && (cursor?.direction === 'before' ? extra : !!cursor);
    const next = rows.length > 0 && (cursor?.direction === 'before' ? !!cursor : extra);
    return { rows: rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_cursor')))), pagination: { limit, total, previousCursor: previous ? encode(rows[0], 'before') : null, nextCursor: next ? encode(rows[rows.length - 1], 'after') : null } };
  };
  return { normalized, sort, seek, page };
}
