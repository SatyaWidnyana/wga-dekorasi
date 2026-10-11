const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const securityHeaders = require('../vercel.json').headers[0].headers;

const root = path.resolve(__dirname, '..');
const routes = Object.fromEntries(
  [
    'config',
    'reviews',
    'admin-session',
    'admin-reviews',
    'moments',
    'admin-moments',
    'catalog',
    'admin-catalog',
  ].map((name) => ['/api/' + name, require('../api/' + name + '.js')]),
);
const publicFiles = new Set([
  'index.html',
  'katalog.html',
  'ulasan.html',
  'admin.html',
  'admin-catalog.html',
  'admin-moments.html',
  'admin-reviews.html',
  'momen.html',
  'robots.txt',
  'sitemap.xml',
]);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
};

http
  .createServer(async (req, res) => {
    for (const header of securityHeaders) {
      if (header.key !== 'Strict-Transport-Security') res.setHeader(header.key, header.value);
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (routes[pathname]) {
      let size = 0;
      const chunks = [];
      try {
        const maxRequestSize = ['/api/admin-moments', '/api/admin-catalog'].includes(pathname)
          ? require('../server/media-validation.cjs').MAX_REQUEST_BYTES
          : 8192;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > maxRequestSize) {
            res
              .writeHead(413, { 'Content-Type': 'application/json' })
              .end(JSON.stringify({ error: 'Kiriman terlalu besar.' }));
            return;
          }
          chunks.push(chunk);
        }
        req.body = Buffer.concat(chunks).toString('utf8');
        await routes[pathname](req, res);
      } catch {
        if (!res.writableEnded) res.writeHead(400).end();
      }
      return;
    }
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const target = path.resolve(root, relative);
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405).end();
      return;
    }
    if (
      !target.startsWith(root + path.sep) ||
      !(publicFiles.has(relative) || /^(css|js|assets)\/[a-zA-Z0-9_./-]+$/.test(relative)) ||
      relative.split('/').some((part) => part.startsWith('.'))
    ) {
      res.writeHead(404).end();
      return;
    }
    try {
      const data = await fs.promises.readFile(target);
      res.writeHead(200, {
        'Content-Type': types[path.extname(target)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404).end();
    }
  })
  .listen(3000, '127.0.0.1', () =>
    console.log('WGA local preview: http://127.0.0.1:3000 (restart after backend/env changes)'),
  );
