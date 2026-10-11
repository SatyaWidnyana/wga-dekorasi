const { fail } = require('./core.cjs');
function pagination(req, direction = 'desc') {
  const query = new URL(req.url, 'http://localhost').searchParams;
  const cursor = query.get('cursor');
  const ascending = direction === 'asc';
  let filter = '';
  if (cursor) {
    if (cursor.length > 200) fail(400, 'Cursor tidak valid.');
    let value;
    try {
      value = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    } catch {
      fail(400, 'Cursor tidak valid.');
    }
    if (
      !value ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value.time) ||
      !/^[0-9a-f-]{36}$/i.test(value.id)
    )
      fail(400, 'Cursor tidak valid.');
    const comparison = ascending ? 'gt' : 'lt';
    filter = `&or=${encodeURIComponent(`(created_at.${comparison}.${value.time},and(created_at.eq.${value.time},id.${comparison}.${value.id}))`)}`;
  }
  return { query, filter };
}
function pageResult(rows, size) {
  const items = rows.slice(0, size);
  const last = items.at(-1);
  const nextCursor =
    rows.length > size
      ? Buffer.from(JSON.stringify({ time: last.created_at, id: last.id })).toString('base64url')
      : null;
  return { items, nextCursor };
}
module.exports = { pagination, pageResult };
