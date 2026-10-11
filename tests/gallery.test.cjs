const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { catalogPagination, catalogPageResult } = require('../server/catalog-pagination.cjs');
const { MAX_REQUEST_BYTES, validateImage } = require('../server/media-validation.cjs');
const { reviewSummary } = require('../server/review-summary.cjs');
const { persistMedia } = require('../server/media-save.cjs');
const catalog = require('../api/catalog.js');
const handlers = [require('../api/admin-catalog.js'), require('../api/admin-moments.js')];
const savedFetch = global.fetch,
  savedEnv = { ...process.env };
afterEach(() => {
  global.fetch = savedFetch;
  process.env = { ...savedEnv };
});
const id = '11111111-1111-4111-8111-111111111111';
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
const answer = (data, status = 200) => new Response(JSON.stringify(data), { status });
async function run(handler, method, body, extra = {}) {
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(s) {
      this.data = JSON.parse(s);
    },
  };
  await handler(
    {
      method,
      url: '/api/catalog',
      body,
      socket: { remoteAddress: '127.0.0.1' },
      headers: {
        cookie: 'wga-admin=' + 'a'.repeat(40),
        origin: 'https://wga.test',
        'content-type': 'application/json',
      },
      ...extra,
    },
    res,
  );
  return res;
}
function mockAdmin(handle) {
  global.fetch = async (url, options) => {
    if (url.includes('/auth/v1/user')) return answer({ id });
    if (url.includes('/review_admins?')) return answer([{ user_id: id }]);
    if (url.includes('/rpc/wga_rate_limit')) return answer(true);
    return handle(url, options);
  };
}
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2TjEAAAAASUVORK5CYII=',
  'base64',
);
const payload = () => ({
  title: 'Dekorasi',
  category: 'Dekor',
  data: png.toString('base64'),
  thumbData: png.toString('base64'),
  mimeType: 'image/png',
  thumbMimeType: 'image/png',
});

test('catalogue cursor crosses numbered legacy records into chronological uploads', () => {
  const rows = [
    { id, legacy_page: 30, created_at: '2026-10-11T10:00:00Z' },
    { id, legacy_page: null },
  ];
  const page = catalogPageResult(rows, 1);
  let result = catalogPagination({ url: '/?cursor=' + page.nextCursor });
  assert.equal(decodeURIComponent(result.filter), '&or=(legacy_page.gt.30,legacy_page.is.null)');
  const uploaded = { id, legacy_page: null, created_at: rows[0].created_at };
  result = catalogPagination({
    url: '/?cursor=' + catalogPageResult([uploaded, uploaded], 1).nextCursor,
  });
  assert.match(decodeURIComponent(result.filter), /legacy_page=is.null.*created_at.gt.*id.gt/);
  assert.equal(result.order, 'legacy_page.asc.nullslast,created_at.asc,id.asc');
  for (const query of ['cursor=bad', 'limit=0', 'limit=10000', 'limit=NaN'])
    assert.throws(() => catalogPagination({ url: '/?' + query }));
});
test('public catalogue uses bounded pages and keeps search separate from cursor predicates', async () => {
  env();
  const cursor = catalogPageResult(
    [{ id, created_at: '2026-10-11T10:00:00Z', legacy_page: 5 }, {}],
    1,
  ).nextCursor;
  global.fetch = async (url) => {
    if (url.includes('/catalog_categories?')) return answer([]);
    const params = new URL(url).searchParams;
    assert.equal(params.get('limit'), '11');
    assert.match(params.get('and'), /title.ilike/);
    assert.match(params.get('or'), /legacy_page.gt.5/);
    return answer([]);
  };
  const result = await run(catalog, 'GET', null, {
    url: '/api/catalog?limit=10&q=Alat%20(1)&cursor=' + cursor,
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.data.items, []);
});
test('image signatures reject disguised HTML and invalid MIME declarations', () => {
  validateImage(png, 'image/png');
  assert.throws(() => validateImage(Buffer.from('<script>alert(1)</script>'), 'image/png'));
  assert.throws(() => validateImage(png, 'image/webp'));
  assert.ok(MAX_REQUEST_BYTES < 4.5 * 1000 * 1000);
});
test('media endpoints enforce authentication, origin, size and content before storage writes', async () => {
  env();
  for (const handler of handlers) {
    global.fetch = async () => {
      throw Error('unexpected network');
    };
    assert.equal((await run(handler, 'GET', null, { headers: {} })).statusCode, 401);
    assert.equal(
      (await run(handler, 'POST', payload(), { headers: { origin: 'https://evil.test' } }))
        .statusCode,
      403,
    );
    mockAdmin(() => {
      throw Error('unexpected storage call');
    });
    assert.equal(
      (
        await run(handler, 'POST', {
          ...payload(),
          data: Buffer.from('not an image').toString('base64'),
        })
      ).statusCode,
      400,
    );
    assert.equal((await run(handler, 'POST', 'x'.repeat(MAX_REQUEST_BYTES + 1))).statusCode, 413);
  }
});
test('media endpoints paginate and do not stop at the first 100 records', async () => {
  env();
  for (const handler of handlers) {
    mockAdmin((url) => {
      if (url.includes('_categories?')) return answer([{ name: 'Dekor' }]);
      assert.match(url, /limit=25/);
      return answer(
        Array.from({ length: 25 }, (_, i) => ({
          id,
          title: String(i),
          created_at: '2026-10-11T10:00:00Z',
          legacy_page: null,
        })),
      );
    });
    const response = await run(handler, 'GET');
    assert.equal(response.data.items.length, 24);
    assert.ok(response.data.nextCursor);
  }
});
test('failed upload attempts cleanup of both objects even when one cleanup fails', async () => {
  env();
  for (const handler of handlers) {
    const deleted = [];
    mockAdmin((url, options) => {
      if (options.method === 'DELETE') {
        deleted.push(url);
        return answer({}, deleted.length === 1 ? 500 : 200);
      }
      if (url.includes('_categories?')) return answer([]);
      return answer({}, url.includes('/thumb-') ? 500 : 200);
    });
    assert.equal((await run(handler, 'POST', payload())).statusCode, 503);
    assert.equal(deleted.length, 2);
  }
});
test('summary migration fallback reads past 1000 without counting rejected reviews', async () => {
  global.fetch = async (url) => {
    if (url.endsWith('/rpc/wga_review_summary')) return answer({ code: 'PGRST202' }, 404);
    assert.match(url, /status=neq.rejected/);
    return answer(
      Array.from({ length: url.endsWith('offset=0') ? 1000 : 5 }, () => ({ rating: 4 })),
    );
  };
  assert.deepEqual(await reviewSummary({ url: 'https://example.supabase.co', secretKey: 'test' }), {
    totalReviews: 1005,
    averageRating: 4,
  });
});
test('an ambiguous insert never deletes photos belonging to a committed row', async () => {
  const row = { path: 'image.webp', thumb_path: 'thumb.webp' };
  let deleted = false;
  global.fetch = async (url, options) => {
    if (options.method === 'DELETE') {
      deleted = true;
      return answer({});
    }
    if (options.method === 'POST') throw Error('connection dropped after commit');
    return answer([{ id, ...row }]);
  };
  const rows = await persistMedia(
    { url: 'https://example.supabase.co', secretKey: 'test' },
    'catalog_items',
    'wga-catalog',
    row,
  );
  assert.equal(rows[0].id, id);
  assert.equal(deleted, false);
});
test('unknown database outcome retains files for reconciliation', async () => {
  let deleted = false;
  global.fetch = async (url, options) => {
    if (options.method === 'DELETE') {
      deleted = true;
      return answer({});
    }
    throw Error('database unavailable');
  };
  await assert.rejects(
    persistMedia(
      { url: 'https://example.supabase.co', secretKey: 'test' },
      'catalog_items',
      'wga-catalog',
      { path: 'image.webp' },
    ),
  );
  assert.equal(deleted, false);
});
