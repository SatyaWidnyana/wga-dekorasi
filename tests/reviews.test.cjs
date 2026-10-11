const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../server/core.cjs');
const reviews = require('../api/reviews.js');
const admin = require('../api/admin-reviews.js');
const session = require('../api/admin-session.js');
const configAPI = require('../api/config.js');
const { pagination } = require('../server/pagination.cjs');
const savedEnv = { ...process.env },
  savedFetch = global.fetch;
afterEach(() => {
  process.env = { ...savedEnv };
  global.fetch = savedFetch;
});
function env() {
  Object.assign(process.env, {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    SUPABASE_SECRET_KEY: 'sb_secret_test',
    TURNSTILE_SITE_KEY: 'site-test',
    TURNSTILE_SECRET_KEY: 'secret-test',
    ABUSE_HASH_SECRET: 'a'.repeat(64),
    ALLOWED_ORIGINS: 'https://wga.test',
    TURNSTILE_HOSTNAMES: 'wga.test',
    REVIEWS_ENABLED: 'true',
  });
  delete process.env.VERCEL;
}
const valid = () => ({
  name: 'Made',
  location: 'Denpasar',
  rating: 5,
  comment: 'Dekorasinya rapi dan timnya membantu.',
  consent: true,
  website: '',
  token: 'test-token',
});
function req(method, body = valid(), extra = {}) {
  return {
    method,
    body,
    url: '/api/reviews',
    headers: { origin: 'https://wga.test', 'content-type': 'application/json', ...extra },
    socket: { remoteAddress: '127.0.0.1' },
  };
}
async function run(handler, request) {
  const res = {
    headers: {},
    statusCode: 200,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(value) {
      this.data = JSON.parse(value);
    },
  };
  await handler(request, res);
  return res;
}
const answer = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const adminID = '11111111-1111-4111-8111-111111111111';
const reviewID = '22222222-2222-4222-8222-222222222222';
const cookie = { cookie: 'wga-admin=' + 'a'.repeat(40) };

test('disabled/unconfigured deployments never accept reviews or expose secrets', async () => {
  env();
  process.env.REVIEWS_ENABLED = 'false';
  let called = false;
  global.fetch = () => {
    called = true;
    throw Error();
  };
  assert.equal((await run(reviews, req('POST'))).statusCode, 503);
  delete process.env.SUPABASE_SECRET_KEY;
  assert.equal((await run(configAPI, req('GET'))).data.configured, false);
  assert.equal(called, false);
});
test('public config returns only site key and feature state', async () => {
  env();
  const result = await run(configAPI, req('GET'));
  assert.deepEqual(Object.keys(result.data).sort(), [
    'configured',
    'reviewsEnabled',
    'turnstileSiteKey',
  ]);
});
test('rejects cross-origin requests, invalid bodies, status injection and consent bypass before upstream calls', async () => {
  env();
  global.fetch = () => {
    throw Error('Should not call network');
  };
  assert.equal(
    (await run(reviews, req('POST', valid(), { origin: 'https://attacker.test' }))).statusCode,
    403,
  );
  for (const overrides of [
    { rating: 6 },
    { rating: '5' },
    { status: 'approved' },
    { consent: false },
    { website: 'bot' },
    { name: '<script>x</script>' },
    { comment: 'https://spam.test' },
    { token: '' },
  ]) {
    assert.equal((await run(reviews, req('POST', { ...valid(), ...overrides }))).statusCode, 400);
  }
  assert.equal((await run(reviews, req('POST', '{bad json'))).statusCode, 400);
  assert.equal(
    (await run(reviews, req('POST', valid(), { 'content-length': '9000' }))).statusCode,
    413,
  );
  assert.equal(
    (await run(reviews, req('POST', valid(), { 'content-type': 'text/plain' }))).statusCode,
    415,
  );
});
test('rate limit rejection stops before Turnstile and insertion', async () => {
  env();
  let calls = 0;
  global.fetch = async (url) => {
    calls++;
    assert.match(url, /rpc\/wga_rate_limit$/);
    return answer(false);
  };
  const result = await run(reviews, req('POST'));
  assert.equal(result.statusCode, 429);
  assert.equal(calls, 1);
});
test('Turnstile rejects invalid, reused, wrong-host and wrong-action tokens', async () => {
  env();
  for (const captcha of [
    { success: false },
    { success: true, hostname: 'evil.test', action: 'review' },
    { success: true, hostname: 'wga.test', action: 'login' },
  ]) {
    global.fetch = async (url) => (/wga_rate_limit/.test(url) ? answer(true) : answer(captcha));
    assert.equal((await run(reviews, req('POST'))).statusCode, 400);
  }
});
test('valid submission sends only server-selected fields and hashed connection identifier', async () => {
  env();
  let inserted;
  global.fetch = async (url, options) => {
    if (/wga_rate_limit/.test(url)) return answer(true);
    if (/siteverify/.test(url))
      return answer({ success: true, hostname: 'wga.test', action: 'review' });
    inserted = JSON.parse(options.body);
    return answer('received');
  };
  const result = await run(reviews, req('POST'));
  assert.equal(result.statusCode, 202);
  assert.equal(inserted.p_name, 'Made');
  assert.match(inserted.p_ip_hash, /^[0-9a-f]{64}$/);
  assert.equal(inserted.status, undefined);
  assert.equal(JSON.stringify(inserted).includes('127.0.0.1'), false);
});
test('upstream outage fails closed with a generic error', async () => {
  env();
  global.fetch = async () => {
    throw Error('SECRET should never leak');
  };
  const result = await run(reviews, req('POST'));
  assert.equal(result.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(result.data), /SECRET/);
});
test('public list selects non-rejected safe fields with bounded pagination and summary', async () => {
  env();
  global.fetch = async (url) => {
    if (url.endsWith('/rpc/wga_review_summary'))
      return answer({ totalReviews: 0, averageRating: 0 });
    assert.match(url, /status=neq.rejected/);
    assert.match(url, /limit=7/);
    assert.doesNotMatch(url, /ip_hash|moderation_note|submission_hash/);
    return answer([]);
  };
  assert.deepEqual((await run(reviews, req('GET'))).data, {
    items: [],
    nextCursor: null,
    summary: { totalReviews: 0, averageRating: 0 },
  });
  assert.throws(() => pagination({ url: '/api/reviews?cursor=invalid' }));
});
test('admin API requires valid session AND a server-side admin membership', async () => {
  env();
  assert.equal((await run(admin, req('GET'))).statusCode, 401);
  global.fetch = async (url) => (/auth\/v1\/user/.test(url) ? answer({ id: adminID }) : answer([]));
  assert.equal((await run(admin, req('GET', {}, cookie))).statusCode, 403);
});
test('moderation cannot impersonate actor; stale status returns conflict', async () => {
  env();
  global.fetch = async (url, options) => {
    if (/auth\/v1\/user/.test(url)) return answer({ id: adminID });
    if (/review_admins/.test(url)) return answer([{ user_id: adminID }]);
    if (/wga_rate_limit/.test(url)) return answer(true);
    const body = JSON.parse(options.body);
    assert.equal(body.p_actor, adminID);
    return answer('conflict');
  };
  const result = await run(
    admin,
    req(
      'PATCH',
      { id: reviewID, actor: 'attacker', status: 'approved', expectedStatus: 'pending', note: '' },
      cookie,
    ),
  );
  assert.equal(result.statusCode, 409);
});
test('login verifies captcha, membership and stores tokens only in an HttpOnly cookie', async () => {
  env();
  let captchaSeen = false;
  global.fetch = async (url) => {
    if (/wga_rate_limit/.test(url)) return answer(true);
    if (/siteverify/.test(url)) {
      captchaSeen = true;
      return answer({ success: true, action: 'admin_login', hostname: 'wga.test' });
    }
    if (/auth\/v1\/token/.test(url)) {
      assert.equal(captchaSeen, true);
      return answer({
        access_token: 'a'.repeat(40),
        refresh_token: 'private',
        expires_in: 3600,
        user: { id: adminID, email: 'admin@wga.test' },
      });
    }
    return answer([{ user_id: adminID }]);
  };
  const result = await run(
    session,
    req('POST', { email: 'admin@wga.test', password: 'test-password', token: 'test' }),
  );
  assert.equal(result.statusCode, 200);
  assert.match(result.headers['Set-Cookie'], /HttpOnly; SameSite=Strict/);
  assert.doesNotMatch(JSON.stringify(result.data), /access_token|refresh_token|private/);
});
test('IP bucketing prevents IPv6 suffix rotation; local proxy headers are ignored', () => {
  env();
  assert.equal(core.ipBucket('2001:db8:1234:5678::1'), core.ipBucket('2001:db8:1234:5678::ffff'));
  assert.equal(
    core.clientIP(req('POST', {}, { 'x-vercel-forwarded-for': '8.8.8.8' })),
    '127.0.0.1',
  );
  process.env.VERCEL = '1';
  assert.equal(core.clientIP(req('POST', {}, { 'x-vercel-forwarded-for': '8.8.8.8' })), '8.8.8.8');
  assert.match(core.sessionCookie('token', 3600), /^__Host-wga-admin=.*; Secure$/);
});
