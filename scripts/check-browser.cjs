// Read-only local browser QA. Every API request is mocked; no Supabase writes occur.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../tmp/refactor-tools/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp/optimization-check');
const item = (i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  title: `Foto ${i}`,
  category: i % 2 ? 'Dekor' : 'Kursi',
  legacy_page: null,
  url: '/assets/hero-wga-bali-1280.webp',
  thumb_url: '/assets/hero-wga-bali-640.webp',
  created_at: `2026-10-11T10:00:${String(i % 60).padStart(2, '0')}Z`,
});
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    // Keep the existing button-based regression suite as the older-browser fallback test.
    // Normal automatic scrolling is tested separately in check-auto-paging.cjs.
    await context.addInitScript(() => {
      delete window.IntersectionObserver;
    });
    const errors = [],
      violations = [];
    let adminItems = Array.from({ length: 32 }, (_, i) => item(i + 1)),
      uploadBytes = 0,
      nextUploadId = 999;
    const categories = [{ name: 'Dekor' }, { name: 'Kursi' }];
    await context.route('**/api/**', async (route) => {
      const url = new URL(route.request().url()),
        endpoint = url.pathname;
      if (url.origin !== 'http://127.0.0.1:3000') return route.continue();
      const reply = (data) => route.fulfill({ json: data });
      if (endpoint === '/api/admin-session') return reply({ admin: { id: 'test' } });
      if (endpoint === '/api/config') return reply({ configured: false, reviewsEnabled: false });
      if (endpoint === '/api/reviews' || endpoint === '/api/admin-reviews')
        return reply({
          items: [],
          nextCursor: null,
          summary: { totalReviews: 0, averageRating: 0 },
        });
      if (endpoint.startsWith('/api/admin-')) {
        if (route.request().method() === 'DELETE') {
          const { id } = route.request().postDataJSON();
          adminItems = adminItems.filter((row) => row.id !== id);
          return reply({ message: 'Foto dihapus.' });
        }
        if (route.request().method() === 'POST') {
          uploadBytes = Buffer.byteLength(route.request().postData());
          assert.ok(uploadBytes < 4 * 1024 * 1024);
          const data = route.request().postDataJSON();
          assert.equal(data.mimeType, 'image/webp');
          const uploaded = { ...item(nextUploadId++), title: data.title, category: data.category };
          adminItems.push(uploaded);
          return reply({ item: uploaded, message: 'Foto diunggah.' });
        }
        const offset = Number(url.searchParams.get('cursor')) || 0;
        return reply({
          categories,
          items: adminItems.slice(offset, offset + 24),
          nextCursor: offset + 24 < adminItems.length ? String(offset + 24) : null,
        });
      }
      let rows = Array.from({ length: 103 }, (_, i) => item(i + 1));
      const category = url.searchParams.get('category');
      if (category) rows = rows.filter((row) => row.category === category);
      const q = url.searchParams.get('q');
      if (q) rows = rows.filter((row) => row.title.toLowerCase().includes(q.toLowerCase()));
      if (endpoint === '/api/moments' && category === 'Dekor')
        await new Promise((resolve) => setTimeout(resolve, 150));
      const offset = Number(url.searchParams.get('cursor')) || 0;
      const limit = Number(url.searchParams.get('limit')) || 24;
      return reply({
        categories,
        items: rows.slice(offset, offset + limit),
        nextCursor: offset + limit < rows.length ? String(offset + limit) : null,
      });
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.stack || e.message}`));
    await page.exposeFunction('recordViolation', (message) => violations.push(message));
    await page.addInitScript(() =>
      document.addEventListener('securitypolicyviolation', (e) =>
        window.recordViolation(`${e.violatedDirective}: ${e.blockedURI}`),
      ),
    );
    const base = 'http://127.0.0.1:3000';
    assert.equal((await page.goto(base)).status(), 200);
    await page.waitForFunction(
      () => document.querySelectorAll('#homeCatalogGrid .catalog-card').length === 10,
    );
    await page.screenshot({ path: path.join(output, 'desktop-home.png') });
    await page.goto(base + '/katalog.html');
    await page.waitForFunction(
      () => document.querySelectorAll('#catalogGrid .catalog-card').length === 24,
    );
    await page.getByRole('button', { name: 'Muat lebih banyak' }).click();
    await page.waitForFunction(
      () => document.querySelectorAll('#catalogGrid .catalog-card').length === 48,
    );
    await page.locator('#q').fill('Foto 103');
    await page.waitForFunction(
      () => document.querySelectorAll('#catalogGrid .catalog-card').length === 1,
    );
    assert.match(await page.locator('#catalogGrid').innerText(), /Foto 103/);
    await page.locator('#q').fill('tidak-ada');
    await page.waitForFunction(
      () => document.querySelectorAll('#catalogGrid .catalog-card').length === 0,
    );
    await page.goto(base + '/momen.html');
    await page.getByRole('button', { name: 'Dekor', exact: true }).click();
    await page.getByRole('button', { name: 'Kursi', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('#moments-grid small')?.textContent === 'Kursi',
    );
    await page.locator('.moment-card').first().click();
    await page.locator('#moment-lightbox-close').click();
    await page.locator('.moment-card').nth(1).click();
    assert.match(await page.locator('#moment-lightbox-caption').innerText(), /Foto 4/);
    await page.locator('#moment-lightbox-close').click();
    page.on('dialog', (dialog) => dialog.accept());
    for (const [kind, prefix] of [
      ['catalog', 'catalog'],
      ['moments', 'moment'],
    ]) {
      adminItems = Array.from({ length: 32 }, (_, i) => item(i + 1));
      await page.goto(`${base}/admin-${kind}.html`);
      await page.waitForFunction(
        () => document.querySelectorAll('.moment-admin-card').length === 24,
      );
      for (const [title, expected] of [
        ['Pending QA A', 25],
        ['Pending QA B', 26],
      ]) {
        await page
          .locator(`#${prefix}-file`)
          .setInputFiles(path.join(root, 'assets/hero-wga-bali-640.webp'));
        await page.locator(`#${prefix}-title-input`).fill(title);
        await page.locator(`#${prefix}-category`).selectOption('Dekor');
        await page.locator(`#${prefix}-upload-button`).click();
        await page.waitForFunction(
          (count) => document.querySelectorAll('.moment-admin-card').length === count,
          expected,
        );
        assert.equal(await page.locator('.moment-admin-card strong').last().innerText(), title);
        assert.ok(await page.getByRole('button', { name: 'Muat lebih banyak' }).isVisible());
      }
      // Deleting a just-uploaded tail card must not resurrect it on the next page.
      await page
        .locator('.moment-admin-card')
        .filter({ hasText: 'Pending QA A' })
        .getByRole('button', { name: 'Hapus' })
        .click();
      await page.waitForFunction(
        () => document.querySelectorAll('.moment-admin-card').length === 25,
      );
      await page.getByRole('button', { name: 'Muat lebih banyak' }).click();
      await page.waitForFunction(
        () => document.querySelectorAll('.moment-admin-card').length === 33,
      );
      assert.deepEqual(await page.locator('.moment-admin-card strong').allTextContents(), [
        ...Array.from({ length: 32 }, (_, i) => `Foto ${i + 1}`),
        'Pending QA B',
      ]);
      assert.equal(
        await page.getByRole('button', { name: 'Muat lebih banyak' }).isVisible(),
        false,
      );
    }
    adminItems = Array.from({ length: 32 }, (_, i) => item(i + 1));
    await page.goto(base + '/admin-catalog.html');
    await page.waitForFunction(() => document.querySelectorAll('.moment-admin-card').length === 24);
    await page.getByRole('button', { name: 'Muat lebih banyak' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.moment-admin-card').length === 32);
    await page.getByRole('button', { name: 'Hapus', exact: true }).first().click();
    await page.waitForFunction(() => document.querySelectorAll('.moment-admin-card').length === 31);
    await page
      .locator('#catalog-file')
      .setInputFiles(path.join(root, 'assets/hero-wga-bali-640.webp'));
    await page.locator('#catalog-title-input').fill('Upload QA');
    await page.locator('#catalog-category').selectOption('Dekor');
    await page.locator('#catalog-upload-button').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#catalog-upload-status').dataset.kind === 'success' &&
        document.querySelectorAll('.moment-admin-card').length === 32,
    );
    assert.equal(await page.locator('.moment-admin-card strong').last().innerText(), 'Upload QA');
    assert.equal(await page.locator('.moment-admin-card strong').first().innerText(), 'Foto 2');
    // An older browser without AbortSignal.timeout must still load these pages.
    await page.addInitScript(() => {
      AbortSignal.timeout = undefined;
    });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const file of [
        'index.html',
        'katalog.html',
        'momen.html',
        'ulasan.html',
        'admin.html',
        'admin-catalog.html',
        'admin-moments.html',
        'admin-reviews.html',
      ]) {
        await page.goto(`${base}/${file}`);
        await page.waitForTimeout(150);
        const dimensions = await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        if (dimensions.scroll > width + 1) {
          console.log(
            await page.evaluate(() =>
              [...document.querySelectorAll('body *')]
                .map((node) => ({
                  tag: node.tagName,
                  id: node.id,
                  cls: node.className,
                  right: node.getBoundingClientRect().right,
                  width: node.getBoundingClientRect().width,
                }))
                .filter((node) => node.right > innerWidth + 1)
                .slice(0, 18),
            ),
          );
          await page.screenshot({
            path: path.join(output, `overflow-${file}-${width}.png`),
            fullPage: true,
          });
        }
        assert.ok(
          dimensions.scroll <= width + 1,
          `${file} overflows at ${width}: ${dimensions.scroll}`,
        );
      }
      if (width === 390)
        await page.screenshot({ path: path.join(output, 'mobile-admin.png'), fullPage: true });
    }
    assert.deepEqual(errors, [], 'JavaScript errors');
    assert.deepEqual(violations, [], 'CSP violations');
    console.log(
      JSON.stringify({
        result: 'PASS',
        viewports: [320, 390, 768, 1440],
        pages: 8,
        uploadBytes,
        checks: [
          'home 10',
          'pagination',
          'search and empty result',
          'filter race',
          'lightbox',
          'admin delete then upload ordering',
          'catalog/moments upload before pagination ends: visible, ordered, no duplicates',
          'CSP',
          'legacy timeout fallback',
          'no horizontal overflow',
        ],
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
