const { db, fetchJSON, fail } = require('./core.cjs');
async function reviewSummary(cfg) {
  const result = await fetchJSON(`${cfg.url}/rest/v1/rpc/wga_review_summary`, {
    method: 'POST',
    headers: { apikey: cfg.secretKey, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (result.response.ok) return result.data;
  // Compatibility while migration 006 is being applied; never silently cap counts at 1,000.
  if (!['PGRST202', '42883'].includes(result.data?.code))
    fail(503, 'Statistik ulasan belum tersedia.');
  let totalReviews = 0,
    sum = 0,
    offset = 0;
  for (;;) {
    const rows = await db(
      cfg,
      `reviews?status=neq.rejected&select=rating&order=id.asc&limit=1000&offset=${offset}`,
    );
    for (const row of rows) {
      totalReviews++;
      sum += Number(row.rating);
    }
    if (rows.length < 1000) break;
    offset += rows.length;
  }
  return {
    totalReviews,
    averageRating: totalReviews ? Math.round((sum / totalReviews) * 10) / 10 : 0,
  };
}
module.exports = { reviewSummary };
