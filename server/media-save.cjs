const { db, storage } = require('./core.cjs');
async function persistMedia(cfg, table, bucket, row) {
  try {
    return await db(cfg, table, {
      method: 'POST',
      body: row,
      headers: { Prefer: 'return=representation' },
    });
  } catch (error) {
    // A timed-out insert might already be committed. Never delete its photos blindly.
    let saved;
    try {
      saved = await db(cfg, `${table}?path=eq.${encodeURIComponent(row.path)}&select=*&limit=1`);
    } catch {
      throw error;
    } // Unknown outcome: retain objects for reconciliation, not data loss.
    if (saved.length) return saved;
    await Promise.allSettled(
      [row.path, row.thumb_path]
        .filter(Boolean)
        .map((file) => storage(cfg, `object/${bucket}/${file}`, { method: 'DELETE' })),
    );
    throw error;
  }
}
module.exports = { persistMedia };
