// Local API mocks only. No upload, deletion, or Supabase write is performed.
const assert = require('node:assert/strict');
const { chromium } = require('../tmp/refactor-tools/node_modules/playwright');
const rows = Array.from({ length: 61 }, (_, i) => ({
  id: String(i + 1),
  title: `Foto ${i + 1}`,
  category: 'Dekor',
  url: '/assets/hero-wga-bali-1280.webp',
  thumb_url: '/assets/hero-wga-bali-640.webp',
}));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const requests = [],
        errors = [];
      let failNextPage = false,
        active = 0,
        maxActive = 0;
      await context.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://127.0.0.1:3000') return route.continue();
        if (url.pathname === '/api/admin-session')
          return route.fulfill({ json: { admin: { id: 'test' } } });
        const offset = Number(url.searchParams.get('cursor')) || 0;
        const limit = Number(url.searchParams.get('limit')) || 24;
        requests.push(url.pathname + url.search);
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 80));
        active--;
        if (failNextPage && offset === 24) {
          failNextPage = false;
          return route.fulfill({ status: 503, json: { error: 'Simulasi gangguan koneksi.' } });
        }
        const filtered = url.searchParams.get('q')
          ? rows.filter((row) => row.title === url.searchParams.get('q'))
          : rows;
        return route.fulfill({
          json: {
            items: filtered.slice(offset, offset + limit),
            categories: [{ name: 'Dekor' }],
            nextCursor: offset + limit < filtered.length ? String(offset + limit) : null,
          },
        });
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      const waitCount = (selector, count) =>
        page.waitForFunction(
          ({ selector, count }) => document.querySelectorAll(selector).length === count,
          { selector, count },
        );
      await page.goto('http://127.0.0.1:3000/');
      await waitCount('#homeCatalogGrid .catalog-card', 10);
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(250);
      assert.equal(await page.locator('#homeCatalogGrid .catalog-card').count(), 10);
      for (const [file, selector] of [
        ['katalog.html', '#catalogGrid .catalog-card'],
        ['momen.html', '.moment-card'],
        ['admin-catalog.html', '.moment-admin-card'],
        ['admin-moments.html', '.moment-admin-card'],
      ]) {
        await page.goto(`http://127.0.0.1:3000/${file}`);
        await waitCount(selector, 24);
        const firstRequests = requests.length;
        await page.waitForTimeout(250);
        assert.equal(requests.length, firstRequests, 'must not fetch unseen pages at the top');
        assert.equal(
          await page
            .getByRole('button', { name: /Muat lebih banyak|Muat momen lainnya/ })
            .isVisible(),
          false,
        );
        failNextPage = true;
        await page.locator('.auto-page-sentinel').scrollIntoViewIfNeeded();
        await page.getByRole('button', { name: 'Coba lagi', exact: true }).waitFor();
        const failedRequests = requests.length;
        await page.waitForTimeout(300);
        assert.equal(requests.length, failedRequests, 'failure must not cause a retry loop');
        assert.equal(await page.locator(selector).count(), 24);
        await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
        await waitCount(selector, 48);
        await page.locator('.auto-page-sentinel').scrollIntoViewIfNeeded();
        await waitCount(selector, 61);
        assert.equal(await page.locator('.auto-page-sentinel').isVisible(), false);
        const titles = await page
          .locator(selector)
          .evaluateAll((cards) =>
            cards.map((card) => card.querySelector('strong, .catalog-card-title').textContent),
          );
        assert.deepEqual(
          titles,
          rows.map((row) => row.title),
          'oldest first, no duplicates',
        );
        const completedRequests = requests.length;
        await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(250);
        assert.equal(requests.length, completedRequests, 'must stop at the last page');
        if (file === 'katalog.html') {
          await page.locator('#q').fill('Foto 61');
          await waitCount(selector, 1);
          assert.match(await page.locator(selector).innerText(), /Foto 61/);
          assert.equal(await page.locator('.auto-page-sentinel').isVisible(), false);
        }
      }
      assert.equal(maxActive, 1, 'one gallery request in flight at a time');
      assert.deepEqual(errors, []);
      console.log(
        JSON.stringify({
          width,
          result: 'PASS',
          pages: 4,
          checks: [
            'automatic scroll',
            'retry without loops',
            'end of list',
            'order/no duplicates',
            'home stays 10',
            'search reset',
          ],
        }),
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
