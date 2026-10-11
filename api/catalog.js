const { config, endpoint, send, fail, db } = require('../server/core.cjs');
const { catalogPagination, catalogPageResult } = require('../server/catalog-pagination.cjs');

module.exports = endpoint(['GET'], async (req, res) => {
  const cfg = config();
  const { query, filter, size, order } = catalogPagination(req);
  const category = query.get('category')?.trim() || '';
  const search = query.get('q')?.trim() || '';
  if (category && !/^[\p{L}\p{N} &+/_-]{2,60}$/u.test(category)) fail(400, 'Kategori tidak valid.');
  if (search && !/^[\p{L}\p{N} .&+/_()'-]{1,80}$/u.test(search))
    fail(400, 'Pencarian tidak valid.');
  const categoryFilter = category ? `category=eq.${encodeURIComponent(category)}&` : '';
  const searchFilter = search
    ? `and=${encodeURIComponent(`(or(title.ilike."*${search}*",category.ilike."*${search}*"))`)}&`
    : '';
  const [rows, categories] = await Promise.all([
    db(
      cfg,
      `catalog_items?${categoryFilter}${searchFilter}select=id,title,category,url,thumb_url,legacy_page,created_at&order=${order}&limit=${size + 1}${filter}`,
    ),
    db(cfg, 'catalog_categories?select=id,name&order=name.asc'),
  ]);
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  send(res, 200, {
    ...catalogPageResult(rows, size),
    categories,
  });
});
