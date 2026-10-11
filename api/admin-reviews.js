const {
  config,
  endpoint,
  send,
  fail,
  requireAdmin,
  originGuard,
  readBody,
  rateLimit,
  db,
  rpc,
} = require('../server/core.cjs');
const { pagination, pageResult } = require('../server/pagination.cjs');
const statuses = ['pending', 'approved', 'rejected'];
module.exports = endpoint(['GET', 'PATCH', 'DELETE'], async (req, res) => {
  const cfg = config();
  if (req.method !== 'GET') originGuard(req, cfg);
  const admin = await requireAdmin(req, cfg);
  await rateLimit(req, cfg, 'admin');
  if (req.method === 'GET') {
    const { query, filter } = pagination(req);
    const status = query.get('status') || 'all';
    if (status !== 'all' && !statuses.includes(status)) fail(400, 'Status tidak valid.');
    const statusFilter = status === 'all' ? '' : `status=eq.${status}&`;
    const rows = await db(
      cfg,
      `reviews?${statusFilter}select=id,name,location,rating,comment,status,created_at,moderated_at,moderation_note&order=created_at.desc,id.desc&limit=21${filter}`,
    );
    return send(res, 200, pageResult(rows, 20));
  }
  if (req.method === 'DELETE') {
    const body = readBody(req);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id))
      fail(400, 'ID ulasan tidak valid.');
    const result = await rpc(cfg, 'wga_delete_review', {
      p_id: body.id,
      p_actor: admin.id,
    });
    if (result === 'missing') fail(404, 'Ulasan tidak ditemukan.');
    if (result !== 'deleted') fail(503, 'Ulasan belum dapat dihapus.');
    return send(res, 200, { message: 'Ulasan dihapus.' });
  }
  const body = readBody(req);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id) ||
    !statuses.includes(body.status) ||
    !statuses.includes(body.expectedStatus) ||
    typeof body.note !== 'string' ||
    [...body.note].length > 500
  )
    fail(400, 'Data moderasi tidak valid.');
  const result = await rpc(cfg, 'wga_moderate_review', {
    p_id: body.id,
    p_actor: admin.id,
    p_status: body.status,
    p_expected: body.expectedStatus,
    p_note: body.note.trim(),
  });
  if (result === 'conflict')
    fail(409, 'Status sudah berubah. Muat ulang daftar sebelum melanjutkan.');
  if (result === 'missing') fail(404, 'Ulasan tidak ditemukan.');
  if (result !== 'updated') fail(503, 'Moderasi belum dapat disimpan.');
  send(res, 200, { message: 'Status ulasan diperbarui.' });
});
