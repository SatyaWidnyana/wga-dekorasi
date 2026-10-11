const { config, endpoint, send, fail, db } = require('../server/core.cjs');
const { pagination } = require('../server/pagination.cjs');

module.exports = endpoint(['GET'], async (req, res) => {
  const cfg = config();
  const { query, filter } = pagination(req, 'asc');
  const category = query.get('category');
  if (category && !/^[\p{L}\p{N} &+/_-]{2,60}$/u.test(category))
    fail(400, 'Kategori tidak valid.');
  const categoryFilter = category ? `category=eq.${encodeURIComponent(category)}&` : '';
  const [rows, categories] = await Promise.all([
    db(
      cfg,
      `moment_photos?${categoryFilter}select=id,title,category,url,thumb_url,created_at&order=created_at.asc,id.asc&limit=25${filter}`,
    ),
    db(cfg, 'moment_categories?select=id,name&order=name.asc'),
  ]);
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  send(res, 200, {
    items: rows.slice(0, 24),
    categories,
    nextCursor: rows.length > 24 ? Buffer.from(JSON.stringify({ time: rows[23].created_at, id: rows[23].id })).toString('base64url') : null,
  });
});
