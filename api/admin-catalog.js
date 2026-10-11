const { randomUUID } = require('node:crypto');
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
  storage,
} = require('../server/core.cjs');

const BUCKET = 'wga-catalog';
const { catalogPagination, catalogPageResult } = require('../server/catalog-pagination.cjs');
const { MAX_REQUEST_BYTES, validateImage } = require('../server/media-validation.cjs');
const { persistMedia } = require('../server/media-save.cjs');
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_THUMB_BYTES = 1024 * 1024;
const mimeTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const validCategory = (value) =>
  typeof value === 'string' && /^[\p{L}\p{N} &+/_-]{2,60}$/u.test(value.trim());

module.exports = endpoint(['GET', 'POST', 'DELETE'], async (req, res) => {
  const cfg = config();
  if (req.method !== 'GET') originGuard(req, cfg);
  await requireAdmin(req, cfg);
  await rateLimit(req, cfg, 'admin');

  if (req.method === 'GET') {
    const { filter, size, order } = catalogPagination(req);
    const [categories, items] = await Promise.all([
      db(cfg, 'catalog_categories?select=id,name&order=name.asc'),
      db(
        cfg,
        `catalog_items?select=id,title,category,url,thumb_url,bytes,thumb_bytes,legacy_page,created_at&order=${order}&limit=${size + 1}${filter}`,
      ),
    ]);
    return send(res, 200, { categories, ...catalogPageResult(items, size) });
  }

  const body = readBody(req, MAX_REQUEST_BYTES);
  if (req.method === 'POST') {
    if (
      !validCategory(body.category) ||
      typeof body.data !== 'string' ||
      typeof body.thumbData !== 'string' ||
      !mimeTypes[body.mimeType] ||
      !mimeTypes[body.thumbMimeType]
    )
      fail(400, 'Gambar dan kategori wajib diisi.');
    const category = body.category.trim();
    const title = typeof body.title === 'string' ? body.title.trim().replace(/\s+/gu, ' ') : '';
    if ([...title].length < 1 || [...title].length > 120)
      fail(400, 'Judul harus diisi dan maksimal 120 karakter.');
    if (
      !/^[A-Za-z0-9+/]+=*$/.test(body.data) ||
      !/^[A-Za-z0-9+/]+=*$/.test(body.thumbData) ||
      body.data.length > 4_300_000 ||
      body.thumbData.length > 1_500_000
    )
      fail(400, 'Data gambar tidak valid atau terlalu besar.');
    const image = Buffer.from(body.data, 'base64');
    const thumbnail = Buffer.from(body.thumbData, 'base64');
    if (!image.length || image.length > MAX_IMAGE_BYTES) fail(400, 'Ukuran gambar maksimal 3 MB.');
    if (!thumbnail.length || thumbnail.length > MAX_THUMB_BYTES)
      fail(400, 'Ukuran thumbnail terlalu besar.');
    validateImage(image, body.mimeType);
    validateImage(thumbnail, body.thumbMimeType);
    const objectPath = `${randomUUID()}.${mimeTypes[body.mimeType]}`;
    const thumbPath = `thumb-${randomUUID()}.${mimeTypes[body.thumbMimeType]}`;
    let metadataStarted = false;
    try {
      const results = await Promise.allSettled([
        db(cfg, 'catalog_categories?on_conflict=name', {
          method: 'POST',
          body: { name: category },
          headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        }),
        storage(cfg, `object/${BUCKET}/${objectPath}`, {
          method: 'POST',
          body: image,
          headers: { 'Content-Type': body.mimeType, 'x-upsert': 'false' },
        }),
        storage(cfg, `object/${BUCKET}/${thumbPath}`, {
          method: 'POST',
          body: thumbnail,
          headers: { 'Content-Type': body.thumbMimeType, 'x-upsert': 'false' },
        }),
      ]);
      const failure = results.find((result) => result.status === 'rejected');
      if (failure) throw failure.reason;
      const url = `${cfg.url}/storage/v1/object/public/${BUCKET}/${objectPath}`;
      const thumbUrl = `${cfg.url}/storage/v1/object/public/${BUCKET}/${thumbPath}`;
      metadataStarted = true;
      const rows = await persistMedia(cfg, 'catalog_items', BUCKET, {
        path: objectPath,
        thumb_path: thumbPath,
        title,
        category,
        url,
        thumb_url: thumbUrl,
        mime_type: body.mimeType,
        bytes: image.length,
        thumb_bytes: thumbnail.length,
      });
      return send(res, 201, { item: rows[0], message: 'Item katalog berhasil diunggah.' });
    } catch (error) {
      if (!metadataStarted)
        await Promise.allSettled([
          storage(cfg, `object/${BUCKET}/${objectPath}`, { method: 'DELETE' }),
          storage(cfg, `object/${BUCKET}/${thumbPath}`, { method: 'DELETE' }),
        ]);
      throw error;
    }
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    fail(400, 'ID item tidak valid.');
  const rows = await db(cfg, `catalog_items?id=eq.${id}&select=path,thumb_path&limit=1`);
  if (!rows.length) fail(404, 'Item katalog tidak ditemukan.');
  await Promise.all([
    storage(cfg, `object/${BUCKET}/${rows[0].path}`, { method: 'DELETE' }),
    ...(rows[0].thumb_path
      ? [storage(cfg, `object/${BUCKET}/${rows[0].thumb_path}`, { method: 'DELETE' })]
      : []),
  ]);
  await db(cfg, `catalog_items?id=eq.${id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });
  send(res, 200, { message: 'Item katalog dihapus.' });
});
