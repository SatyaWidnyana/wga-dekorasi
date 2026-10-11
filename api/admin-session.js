const {
  config,
  endpoint,
  send,
  fail,
  originGuard,
  readBody,
  tokenField,
  rateLimit,
  verifyTurnstile,
  clientIP,
  fetchJSON,
  db,
  requireAdmin,
  sessionToken,
  sessionCookie,
} = require('../server/core.cjs');
module.exports = endpoint(['GET', 'POST', 'DELETE'], async (req, res) => {
  const cfg = config();
  if (req.method === 'GET') return send(res, 200, { admin: await requireAdmin(req, cfg) });
  originGuard(req, cfg);
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', sessionCookie('', 0));
    try {
      const token = sessionToken(req);
      await fetch(`${cfg.url}/auth/v1/logout?scope=local`, {
        method: 'POST',
        headers: { apikey: cfg.publicKey, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      /* Local cookie is cleared even when the identity provider is unavailable. */
    }
    return send(res, 200, { message: 'Sudah keluar.' });
  }
  const body = readBody(req);
  if (
    typeof body.email !== 'string' ||
    body.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ||
    typeof body.password !== 'string' ||
    body.password.length < 8 ||
    body.password.length > 128
  )
    fail(400, 'Isi email dan kata sandi yang valid.');
  tokenField(body.token);
  await rateLimit(req, cfg, 'login');
  await verifyTurnstile(cfg, body.token, clientIP(req), 'admin_login');
  // Captcha is enforced here, before Auth. Never reuse a consumed token at Auth.
  const { response, data } = await fetchJSON(`${cfg.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: cfg.publicKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: body.email.trim(), password: body.password }),
  });
  if (!response.ok || !data?.access_token || !data.user?.id)
    fail(401, 'Login gagal. Periksa akun dan ulangi verifikasi keamanan.');
  if (!/^[0-9a-f-]{36}$/i.test(data.user.id)) fail(401, 'Login gagal.');
  const members = await db(cfg, `review_admins?user_id=eq.${data.user.id}&select=user_id&limit=1`);
  if (!members.length) fail(403, 'Akun ini tidak memiliki akses admin.');
  res.setHeader(
    'Set-Cookie',
    sessionCookie(data.access_token, Math.min(Number(data.expires_in) || 3600, 3600)),
  );
  // Neither access nor refresh tokens are exposed to browser JavaScript.
  send(res, 200, { admin: { id: data.user.id, email: data.user.email } });
});
