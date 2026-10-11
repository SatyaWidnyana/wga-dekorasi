const { createHmac } = require('node:crypto');
const { isIP } = require('node:net');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};
const list = (value) =>
  (value || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function config() {
  const env = process.env;
  const required = [
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'TURNSTILE_SITE_KEY',
    'TURNSTILE_SECRET_KEY',
    'ABUSE_HASH_SECRET',
    'ALLOWED_ORIGINS',
    'TURNSTILE_HOSTNAMES',
  ];
  if (required.some((key) => !env[key]) || env.ABUSE_HASH_SECRET.length < 32)
    fail(503, 'Layanan ulasan belum tersedia. Silakan coba lagi nanti.');
  let url;
  try {
    url = new URL(env.SUPABASE_URL);
  } catch {
    fail(503, 'Konfigurasi layanan belum lengkap.');
  }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co'))
    fail(503, 'Konfigurasi layanan belum lengkap.');
  return {
    url: url.origin,
    publicKey: env.SUPABASE_PUBLISHABLE_KEY,
    secretKey: env.SUPABASE_SECRET_KEY,
    siteKey: env.TURNSTILE_SITE_KEY,
    turnstileSecret: env.TURNSTILE_SECRET_KEY,
    hashSecret: env.ABUSE_HASH_SECRET,
    origins: list(env.ALLOWED_ORIGINS),
    hostnames: list(env.TURNSTILE_HOSTNAMES),
    enabled: env.REVIEWS_ENABLED === 'true',
  };
}

function originGuard(req, cfg) {
  if (!cfg.origins.includes(req.headers.origin)) fail(403, 'Permintaan tidak diizinkan.');
  if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Permintaan tidak diizinkan.');
}

function readBody(req, maxBytes = 8192) {
  if ((req.headers['content-type'] || '').split(';')[0].trim() !== 'application/json')
    fail(415, 'Gunakan format JSON.');
  if (Number(req.headers['content-length'] || 0) > maxBytes) fail(413, 'Kiriman terlalu besar.');
  let body;
  try {
    body = req.body;
    if (Buffer.isBuffer(body)) body = body.toString('utf8');
    if (typeof body === 'string') {
      if (Buffer.byteLength(body) > maxBytes) fail(413, 'Kiriman terlalu besar.');
      body = JSON.parse(body);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail(400, 'Data tidak valid.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Data tidak valid.');
  if (Buffer.byteLength(JSON.stringify(body)) > maxBytes) fail(413, 'Kiriman terlalu besar.');
  return body;
}

function textField(value, min, max, label) {
  if (typeof value !== 'string') fail(400, `${label} wajib diisi.`);
  const text = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if ([...text].length < min || [...text].length > max || /[\u0000-\u001f\u007f<>]/u.test(text))
    fail(400, `${label} harus ${min}–${max} karakter, tanpa kode HTML.`);
  return text;
}

function validateReview(body) {
  const allowed = ['name', 'location', 'rating', 'comment', 'consent', 'website', 'token'];
  if (Object.keys(body).some((key) => !allowed.includes(key))) fail(400, 'Data tidak valid.');
  if (body.website) fail(400, 'Kiriman tidak dapat diproses.');
  if (body.consent !== true) fail(400, 'Persetujuan publikasi diperlukan.');
  if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5)
    fail(400, 'Pilih bintang 1 sampai 5.');
  const review = {
    name: textField(body.name, 2, 80, 'Nama'),
    location: textField(body.location, 2, 100, 'Lokasi'),
    rating: body.rating,
    comment: textField(body.comment, 10, 1500, 'Ulasan'),
  };
  if (/https?:\/\/|www\./i.test(review.comment)) fail(400, 'Ulasan tidak boleh berisi tautan.');
  return review;
}

function tokenField(value) {
  if (typeof value !== 'string' || !value.length || value.length > 2048)
    fail(400, 'Selesaikan verifikasi keamanan.');
  return value;
}

function clientIP(req) {
  // On Vercel this header is overwritten by its trusted proxy. Locally ignore proxy headers.
  const ip =
    process.env.VERCEL === '1'
      ? (req.headers['x-vercel-forwarded-for'] || '').split(',')[0].trim()
      : req.socket?.remoteAddress;
  if (!ip || !isIP(ip)) fail(503, 'Identitas koneksi tidak dapat diverifikasi.');
  return ip;
}

function ipBucket(ip) {
  if (isIP(ip) !== 6) return ip;
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) return ip.slice(7);
  const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const [left, right] = normalized.split('::');
  const a = left ? left.split(':') : [];
  const b = right ? right.split(':') : [];
  const full = right === undefined ? a : [...a, ...Array(8 - a.length - b.length).fill('0'), ...b];
  return (
    full
      .slice(0, 4)
      .map((part) => part.padStart(4, '0'))
      .join(':') + '::/64'
  );
}
const hash = (cfg, value) => createHmac('sha256', cfg.hashSecret).update(value).digest('hex');

async function fetchJSON(url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(7000) });
    const data = response.status === 204 ? null : await response.json();
    return { response, data };
  } catch {
    fail(503, 'Layanan sedang sibuk. Silakan coba lagi nanti.');
  }
}

async function db(cfg, route, { method = 'GET', body, headers = {} } = {}) {
  const result = await fetchJSON(`${cfg.url}/rest/v1/${route}`, {
    method,
    headers: { apikey: cfg.secretKey, 'Content-Type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!result.response.ok) fail(503, 'Penyimpanan sementara tidak tersedia.');
  return result.data;
}
const rpc = (cfg, name, body) => db(cfg, `rpc/${name}`, { method: 'POST', body });
async function storage(cfg, route, { method = 'GET', body, headers = {} } = {}) {
  const result = await fetchJSON(`${cfg.url}/storage/v1/${route}`, {
    method,
    headers: {
      apikey: cfg.secretKey,
      Authorization: `Bearer ${cfg.secretKey}`,
      ...headers,
    },
    ...(body !== undefined ? { body } : {}),
  });
  if (!result.response.ok) fail(503, 'Penyimpanan foto sementara tidak tersedia.');
  return result.data;
}

async function rateLimit(req, cfg, scope) {
  const key = hash(cfg, ipBucket(clientIP(req)));
  const allowed = await rpc(cfg, 'wga_rate_limit', { p_scope: scope, p_key: key });
  if (!allowed) fail(429, 'Terlalu banyak percobaan. Silakan tunggu sebelum mencoba lagi.');
  return key;
}

async function verifyTurnstile(cfg, token, ip, action) {
  const { response, data } = await fetchJSON(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: cfg.turnstileSecret,
        response: tokenField(token),
        remoteip: ip,
      }),
    },
  );
  if (
    !response.ok ||
    data?.success !== true ||
    data.action !== action ||
    !cfg.hostnames.includes(data.hostname)
  )
    fail(400, 'Verifikasi keamanan gagal atau kedaluwarsa. Silakan ulangi.');
}

const cookieName = () => (process.env.VERCEL === '1' ? '__Host-wga-admin' : 'wga-admin');
function sessionToken(req) {
  const value = (req.headers.cookie || '')
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookieName() + '='))
    ?.slice(cookieName().length + 1);
  if (!value || !/^[A-Za-z0-9_.-]{30,4096}$/.test(value)) fail(401, 'Silakan masuk sebagai admin.');
  return value;
}
function sessionCookie(token, seconds) {
  return `${cookieName()}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}${process.env.VERCEL === '1' ? '; Secure' : ''}`;
}

async function requireAdmin(req, cfg) {
  const token = sessionToken(req);
  const { response, data } = await fetchJSON(`${cfg.url}/auth/v1/user`, {
    headers: { apikey: cfg.publicKey, Authorization: `Bearer ${token}` },
  });
  if (!response.ok || !data?.id) fail(401, 'Sesi berakhir. Silakan masuk kembali.');
  if (!/^[0-9a-f-]{36}$/i.test(data.id)) fail(401, 'Sesi tidak valid.');
  const members = await db(cfg, `review_admins?user_id=eq.${data.id}&select=user_id&limit=1`);
  if (!members.length) fail(403, 'Akun ini tidak memiliki akses admin.');
  return { id: data.id, email: data.email };
}

function send(res, status, data) {
  res.statusCode = status;
  res.end(JSON.stringify(data));
}
function endpoint(methods, handler) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '));
      return send(res, 405, { error: 'Metode tidak diizinkan.' });
    }
    try {
      await handler(req, res);
    } catch (error) {
      // Do not log form data, credentials, tokens, or upstream errors containing secrets.
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 429) res.setHeader('Retry-After', '3600');
      send(res, status, {
        error:
          error instanceof HttpError ? error.message : 'Terjadi kendala. Silakan coba lagi nanti.',
      });
    }
  };
}

module.exports = {
  HttpError,
  fail,
  config,
  originGuard,
  readBody,
  validateReview,
  tokenField,
  clientIP,
  ipBucket,
  hash,
  fetchJSON,
  db,
  rpc,
  storage,
  rateLimit,
  verifyTurnstile,
  cookieName,
  sessionToken,
  sessionCookie,
  requireAdmin,
  send,
  endpoint,
};
