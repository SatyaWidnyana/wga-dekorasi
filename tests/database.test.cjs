const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('Postgres migration, grants, submission limits and moderation audit', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users (id uuid primary key);
      create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
      grant usage on schema public to anon, authenticated, service_role;`);
    await db.exec(
      fs.readFileSync(path.join(__dirname, '../supabase/migrations/001_reviews.sql'), 'utf8'),
    );
    for (const file of fs
      .readdirSync(path.join(__dirname, '../supabase/migrations'))
      .filter((file) => /^00[2-6]_.*\.sql$/.test(file))
      .sort()) {
      await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations', file), 'utf8'));
    }
    const ip = 'a'.repeat(64);
    const adminID = '11111111-1111-4111-8111-111111111111';
    let id;
    await t.test(
      'anonymous/authenticated cannot read raw data, write or call service RPCs',
      async () => {
        for (const role of ['anon', 'authenticated']) {
          await db.exec(`set role ${role}`);
          await assert.rejects(db.query('select * from public.reviews'), /permission denied/);
          await assert.rejects(db.query('select * from public.review_admins'), /permission denied/);
          for (const table of [
            'moment_photos',
            'moment_categories',
            'catalog_items',
            'catalog_categories',
          ])
            await assert.rejects(db.query(`select * from public.${table}`), /permission denied/);
          await assert.rejects(db.query('select public.wga_review_summary()'), /permission denied/);
          await assert.rejects(
            db.query('select public.wga_rate_limit($1,$2)', ['review', ip]),
            /permission denied/,
          );
          await assert.rejects(
            db.query('select public.wga_submit_review($1,$2,$3,$4,$5,$6)', [
              'Made',
              'Bali',
              5,
              'Acara sangat rapi',
              ip,
              ip,
            ]),
            /permission denied/,
          );
          await db.exec('reset role');
        }
      },
    );
    await t.test(
      'service RPC persists attempts across calls and rejects sixth attempt',
      async () => {
        await db.exec('set role service_role');
        for (let i = 0; i < 6; i++) {
          const result = await db.query('select public.wga_rate_limit($1,$2) as allowed', [
            'review',
            ip,
          ]);
          assert.equal(result.rows[0].allowed, i < 5);
        }
        await db.exec('reset role');
      },
    );
    await t.test('new review is pending, duplicate is idempotent, daily cap applies', async () => {
      await db.exec('set role service_role');
      const submit = (hash) =>
        db.query('select public.wga_submit_review($1,$2,$3,$4,$5,$6) as result', [
          'Made',
          'Denpasar',
          5,
          'Dekorasi acaranya rapi dan bagus.',
          hash,
          ip,
        ]);
      assert.equal((await submit('b'.repeat(64))).rows[0].result, 'received');
      assert.equal((await submit('b'.repeat(64))).rows[0].result, 'received');
      let rows = (await db.query('select id, status from public.reviews')).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].status, 'pending');
      id = rows[0].id;
      await submit('c'.repeat(64));
      await submit('d'.repeat(64));
      assert.equal((await submit('e'.repeat(64))).rows[0].result, 'limited');
      await db.exec('reset role');
    });
    await t.test('database constraints reject invalid ratings', async () => {
      await assert.rejects(
        db.query(
          "insert into public.reviews(name, location, rating, comment) values ('Made','Bali',6,'Contoh ulasan panjang')",
        ),
        /check constraint/,
      );
    });
    await t.test(
      'moderation checks membership, logs changes atomically and detects stale status',
      async () => {
        await db.query('insert into auth.users(id) values ($1)', [adminID]);
        await assert.rejects(
          db.query('select public.wga_moderate_review($1,$2,$3,$4,$5)', [
            id,
            adminID,
            'approved',
            'pending',
            '',
          ]),
          /Not authorized/,
        );
        await db.query('insert into public.review_admins(user_id) values ($1)', [adminID]);
        await db.exec('set role service_role');
        const result = await db.query(
          'select public.wga_moderate_review($1,$2,$3,$4,$5) as result',
          [id, adminID, 'approved', 'pending', 'Sudah ditinjau'],
        );
        assert.equal(result.rows[0].result, 'updated');
        const conflict = await db.query(
          'select public.wga_moderate_review($1,$2,$3,$4,$5) as result',
          [id, adminID, 'rejected', 'pending', ''],
        );
        assert.equal(conflict.rows[0].result, 'conflict');
        const log = (await db.query('select * from public.review_moderation_log')).rows;
        assert.equal(log.length, 1);
        assert.equal(log[0].admin_id, adminID);
        assert.equal(
          (await db.query('select status from public.reviews where id=$1', [id])).rows[0].status,
          'approved',
        );
        await db.exec('reset role');
      },
    );
    await t.test('cleanup removes old security hashes and expired rate buckets', async () => {
      await db.query(
        "update public.reviews set created_at = now() - interval '31 days' where id=$1",
        [id],
      );
      await db.exec(
        "update public.review_rate_limits set expires_at=now()-interval '2 days'; select public.wga_cleanup_review_security();",
      );
      assert.equal(
        (await db.query('select ip_hash from public.reviews where id=$1', [id])).rows[0].ip_hash,
        null,
      );
      assert.equal((await db.query('select * from public.review_rate_limits')).rows.length, 0);
    });
    await t.test(
      'summary counts more than 1000 public reviews and excludes rejected rows',
      async () => {
        await db.exec(`insert into public.reviews(name, location, rating, comment)
        select 'Made', 'Bali', 4, 'Contoh ulasan untuk pengujian.' from generate_series(1,1005);
        insert into public.reviews(name, location, rating, comment, status)
        values ('Made', 'Bali', 1, 'Ulasan ditolak untuk pengujian.', 'rejected');
        set role service_role;`);
        const result = (await db.query('select public.wga_review_summary() as summary')).rows[0]
          .summary;
        assert.equal(result.totalReviews, 1008);
        assert.equal(result.averageRating, 4);
        await db.exec('reset role');
      },
    );
  } finally {
    await db.close();
  }
});
