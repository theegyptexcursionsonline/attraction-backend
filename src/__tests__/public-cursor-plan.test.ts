import { Types } from 'mongoose';
import { publicCursorPlan, InvalidPublicCursor, type CursorField } from '../utils/publicCursor';
const fields: CursorField[] = [{ field: 'priceFrom', direction: 1, kind: 'number' }, { field: '_id', direction: -1, kind: 'id' }];
const query = { tenantIds: [new Types.ObjectId()], title: /reef/i };
it('normalizes DB fields and composes a strict lexicographic seek predicate', () => {
  const plan = publicCursorPlan(query, fields);
  const id = new Types.ObjectId();
  const page = plan.page([{ _id: id, _cursor0: 2, _cursor1: id }, { _id: new Types.ObjectId(), _cursor0: 3, _cursor1: new Types.ObjectId() }], 1, 2);
  expect(page.rows).toEqual([{ _id: id }]);
  const next = publicCursorPlan(query, fields, page.pagination.nextCursor!);
  expect(next.seek).toEqual({ $or: [{ _cursor0: { $gt: 2 } }, { _cursor0: 2, _cursor1: { $lt: id } }] });
  expect(() => publicCursorPlan({ ...query, title: /different/i }, fields, page.pagination.nextCursor!)).toThrow(InvalidPublicCursor);
  expect(() => publicCursorPlan(query, [{ ...fields[0], direction: -1 }, fields[1]], page.pagination.nextCursor!)).toThrow(InvalidPublicCursor);
});
it('rejects hostile or malformed cursor shapes and bound values', () => {
  const id = new Types.ObjectId();
  const plan = publicCursorPlan(query, fields);
  const page = plan.page([{ _cursor0: 1, _cursor1: id }, { _cursor0: 2, _cursor1: id }], 1, 2);
  const decoded = JSON.parse(Buffer.from(page.pagination.nextCursor!, 'base64url').toString());
  for (const change of [{ v: 2 }, { direction: 'sideways' }, { values: [1] }, { values: [{ $gt: 0 }, String(id)] }, { values: [1, 'not-an-id'] }, { binding: 'foreign' }]) {
    expect(() => publicCursorPlan(query, fields, Buffer.from(JSON.stringify({ ...decoded, ...change })).toString('base64url'))).toThrow(InvalidPublicCursor);
  }
});
