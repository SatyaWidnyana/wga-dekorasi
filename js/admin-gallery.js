(() => {
  window.WGAAdminGallery = ({ kind, prefix, customPrefix, refreshId }) => {
    const { request, message, el } = window.WGAReviews;
    const get = (suffix) => document.getElementById(`${prefix}-${suffix}`);
    const form = get('form');
    if (!form) return;
    const file = get('file'),
      title = get('title-input'),
      category = get('category');
    const customWrap = document.getElementById(`${customPrefix}-wrap`);
    const custom = document.getElementById(customPrefix);
    const status = get('upload-status'),
      submit = get('upload-button'),
      list = get('admin-list');
    const refresh = document.getElementById(refreshId);
    const more = el('button', 'btn btn-outline', 'Muat lebih banyak');
    more.type = 'button';
    more.hidden = true;
    list.after(more);
    const endpoint = `/api/admin-${kind}`;
    const pendingCards = new Map();
    const pageGap = el(
      'p',
      'field-hint',
      'Foto baru di bawah sudah tersimpan di akhir daftar. Item sebelumnya akan dimuat otomatis saat scroll ke bawah.',
    );
    pageGap.style.gridColumn = '1 / -1';
    pageGap.hidden = true;
    list.append(pageGap);
    let categories = [],
      items = [],
      cursor = null,
      busy = false,
      loading = false;
    const deleting = new Set();
    const pager = window.WGAAutoPager({ button: more, load: () => load(Boolean(cursor)) });
    function updateGap() {
      pageGap.hidden = !cursor || !pendingCards.size;
    }
    function controls() {
      submit.disabled = busy || loading || deleting.size > 0;
      refresh.disabled = busy || loading || deleting.size > 0;
      pager.update({ hasMore: !!cursor, busy: busy || loading || deleting.size > 0 });
    }
    function fillCategories() {
      const selected = category.value;
      category.replaceChildren(
        new Option('Pilih kategori', ''),
        ...categories.map((item) => new Option(item.name, item.name)),
        new Option('+ Tambah kategori baru', '__new'),
      );
      category.value = selected;
    }
    function card(item) {
      const card = el('article', 'moment-admin-card');
      const image = el('img');
      image.src = item.thumb_url || item.url;
      image.alt = item.title || item.category;
      image.loading = 'lazy';
      image.decoding = 'async';
      const body = el('div', 'moment-admin-card-body');
      body.append(
        el('strong', '', item.title || 'Tanpa judul'),
        el(
          'span',
          '',
          item.legacy_page ? `${item.category} · Halaman ${item.legacy_page}` : item.category,
        ),
      );
      const remove = el('button', 'btn reject-button', 'Hapus');
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (
          busy ||
          loading ||
          deleting.has(item.id) ||
          !window.confirm('Hapus foto ini secara permanen?')
        )
          return;
        deleting.add(item.id);
        remove.disabled = true;
        controls();
        try {
          const result = await request(endpoint, {
            method: 'DELETE',
            body: JSON.stringify({ id: item.id }),
          });
          items = items.filter((current) => current.id !== item.id);
          pendingCards.delete(item.id);
          card.remove();
          updateGap();
          if (!items.length && !cursor)
            list.replaceChildren(el('p', 'field-hint', 'Belum ada foto tersimpan.'), pageGap);
          message(status, result.message, 'success');
        } catch (error) {
          message(status, error.message, 'error');
          remove.disabled = false;
        } finally {
          deleting.delete(item.id);
          controls();
        }
      });
      body.append(remove);
      card.append(image, body);
      return card;
    }
    async function load(append = false) {
      if (loading || busy || deleting.size) return;
      loading = true;
      pager.update({ error: false });
      controls();
      try {
        const data = await request(
          `${endpoint}${append && cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        );
        categories = data.categories;
        fillCategories();
        if (!append) {
          items = [];
          pendingCards.clear();
          list.replaceChildren(pageGap);
        }
        const known = new Set(items.map((item) => item.id));
        for (const item of data.items) {
          if (pendingCards.has(item.id)) {
            // Move the existing upload card into its actual page, without duplicating it.
            list.insertBefore(pendingCards.get(item.id), pageGap);
            pendingCards.delete(item.id);
          } else if (!known.has(item.id)) {
            items.push(item);
            known.add(item.id);
            list.insertBefore(card(item), pageGap);
          }
        }
        cursor = data.nextCursor;
        if (!cursor) pendingCards.clear();
        updateGap();
        if (!items.length)
          list.replaceChildren(el('p', 'field-hint', 'Belum ada foto tersimpan.'), pageGap);
      } catch (error) {
        pager.update({ error: true });
        message(status, error.message, 'error');
      } finally {
        loading = false;
        controls();
      }
    }
    category.addEventListener('change', () => {
      const isNew = category.value === '__new';
      customWrap.hidden = !isNew;
      custom.required = isNew;
      if (!isNew) custom.value = '';
    });
    refresh.addEventListener('click', () => load());
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy || loading || deleting.size || !file.files[0]) return;
      const selected = category.value === '__new' ? custom.value.trim() : category.value;
      if (!selected) return message(status, 'Pilih atau isi kategori terlebih dahulu.', 'error');
      if (kind === 'catalog' && !title.value.trim())
        return message(status, 'Nama item wajib diisi.', 'error');
      busy = true;
      controls();
      try {
        message(status, 'Menyiapkan gambar…');
        const [optimized, thumbnail] = await window.WGAAdminMedia.prepare(file.files[0]);
        const body = JSON.stringify({
          data: optimized.data,
          mimeType: optimized.mimeType,
          thumbData: thumbnail.data,
          thumbMimeType: thumbnail.mimeType,
          title: title.value,
          category: selected,
        });
        if (new Blob([body]).size > 4 * 1024 * 1024)
          throw new Error('Gambar terlalu besar untuk dikirim.');
        message(status, 'Mengunggah gambar…');
        const result = await request(endpoint, { method: 'POST', body });
        form.reset();
        customWrap.hidden = true;
        custom.required = false;
        if (!categories.some((item) => item.name === selected)) {
          categories.push({ name: selected });
          categories.sort((a, b) => a.name.localeCompare(b.name, 'id'));
        }
        fillCategories();
        // Show confirmed uploads immediately; older pages are inserted before this tail.
        if (result.item) {
          if (!items.length) list.replaceChildren(pageGap);
          items.push(result.item);
          const uploadedCard = card(result.item);
          if (cursor) pendingCards.set(result.item.id, uploadedCard);
          list.append(uploadedCard);
          updateGap();
        }
        message(
          status,
          result.message +
            (cursor
              ? ' Preview sudah ditampilkan di bawah; masih ada item sebelumnya yang belum dimuat.'
              : ''),
          'success',
        );
      } catch (error) {
        message(status, error.message || 'Upload gagal.', 'error');
      } finally {
        busy = false;
        controls();
      }
    });
    window.addEventListener('wga:admin-ready', () => load());
  };
})();
