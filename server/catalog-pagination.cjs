const { fail } = require('./core.cjs');
const ORDER = 'legacy_page.asc.nullslast,created_at.asc,id.asc';
function catalogPagination(req) {
  const query = new URL(req.url, 'http://localhost').searchParams;
  const cursor = query.get('cursor');
  const rawSize = query.get('limit');
  const size = rawSize === null ? 24 : Number(rawSize);
  if (!Number.isInteger(size) || size < 1 || size > 48) fail(400, 'Batas halaman tidak valid.');
  let filter = '';
  if (cursor) {
    let value;
    try {
      if (cursor.length > 240) throw Error();
      value = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    } catch {
      fail(400, 'Cursor tidak valid.');
    }
    if (
      !value ||
      !(
        value.legacy === null ||
        (Number.isInteger(value.legacy) && value.legacy >= 1 && value.legacy <= 9999)
      ) ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value.time) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id)
    )
      fail(400, 'Cursor tidak valid.');
    // legacy_page is unique. New uploads follow ALL numbered legacy records.
    filter =
      value.legacy === null
        ? `&legacy_page=is.null&or=${encodeURIComponent(`(created_at.gt.${value.time},and(created_at.eq.${value.time},id.gt.${value.id}))`)}`
        : `&or=${encodeURIComponent(`(legacy_page.gt.${value.legacy},legacy_page.is.null)`)}`;
  }
  return { query, size, filter, order: ORDER };
}
function catalogPageResult(rows, size) {
  const items = rows.slice(0, size);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > size && last
        ? Buffer.from(
            JSON.stringify({
              legacy: last.legacy_page ?? null,
              time: last.created_at,
              id: last.id,
            }),
          ).toString('base64url')
        : null,
  };
}
module.exports = { catalogPagination, catalogPageResult };
