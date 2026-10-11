const {
  config,
  endpoint,
  send,
  fail,
  originGuard,
  readBody,
  validateReview,
  tokenField,
  rateLimit,
  verifyTurnstile,
  clientIP,
  hash,
  rpc,
  db,
} = require('../server/core.cjs');
const { pagination, pageResult } = require('../server/pagination.cjs');
const { reviewSummary } = require('../server/review-summary.cjs');
module.exports = endpoint(['GET', 'POST'], async (req, res) => {
  const cfg = config();
  if (!cfg.enabled) fail(503, 'Ulasan belum dibuka. Silakan kembali nanti.');
  if (req.method === 'GET') {
    const { filter } = pagination(req);
    const [rows, summary] = await Promise.all([
      db(
        cfg,
        'reviews?status=neq.rejected&select=id,name,location,rating,comment,created_at&order=created_at.desc,id.desc&limit=7' +
          filter,
      ),
      reviewSummary(cfg),
    ]);
    // Short cache reduces reads while keeping newly submitted reviews visible quickly.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    return send(res, 200, {
      ...pageResult(rows, 6),
      summary,
    });
  }
  originGuard(req, cfg);
  const body = readBody(req);
  const review = validateReview(body);
  tokenField(body.token);
  const ipHash = await rateLimit(req, cfg, 'review');
  await verifyTurnstile(cfg, body.token, clientIP(req), 'review');
  const fingerprint = hash(cfg, JSON.stringify(review).toLocaleLowerCase('id'));
  const result = await rpc(cfg, 'wga_submit_review', {
    p_name: review.name,
    p_location: review.location,
    p_rating: review.rating,
    p_comment: review.comment,
    p_hash: fingerprint,
    p_ip_hash: ipHash,
  });
  if (result === 'limited') fail(429, 'Batas kiriman harian tercapai. Silakan coba besok.');
  if (result !== 'received') fail(503, 'Kiriman belum dapat diproses.');
  send(res, 202, {
    message: 'Terima kasih! Ulasanmu sudah diterima dan langsung ditampilkan.',
  });
});
