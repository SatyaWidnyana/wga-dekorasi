(() => {
  const fallbackRecords = window.WGACatalog?.records || [];
  const grid = document.getElementById('catalogGrid');
  const home = document.getElementById('homeCatalogGrid');
  const search = document.getElementById('q');
  const chips = document.getElementById('chips');
  const count = document.getElementById('count');
  if (!grid && !home) return;
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'btn btn-outline';
  more.textContent = 'Muat lebih banyak';
  more.hidden = true;
  grid?.after(more);
  const status = document.createElement('p');
  status.className = 'field-hint';
  status.setAttribute('role', 'status');
  (grid || home).after(status);
  let nextCursor = null,
    loadId = 0,
    controller,
    offline = false,
    hasLiveData = false,
    searchTimer;
  let loading = false;
  const pager = grid
    ? window.WGAAutoPager({ button: more, load: () => loadCatalog(Boolean(nextCursor)) })
    : null;
  function withLegacyAssets(record) {
    const page = Number(record.legacy_page ?? record.id);
    if (!Number.isInteger(page) || page < 1 || page > 9999) return record;
    const padded = String(page).padStart(2, '0');
    return {
      ...record,
      url: `assets/catalog/pages/page-${padded}.jpg`,
      thumb_url: `assets/catalog/thumbs/page-${padded}-thumb.jpg`,
    };
  }

  let records = fallbackRecords.map((item) => ({
    ...item,
    url: `assets/catalog/pages/page-${String(item.id).padStart(2, '0')}.jpg`,
    thumb_url: `assets/catalog/thumbs/page-${String(item.id).padStart(2, '0')}-thumb.jpg`,
  }));
  let activeCategory = 'Semua';
  const originalCache = new Map();
  const normalize = (value) => value.toLocaleLowerCase('id').trim().replace(/\s+/g, ' ');

  function preloadOriginal(record) {
    if (navigator.connection?.saveData || navigator.connection?.effectiveType === '2g') return;
    if (!record.url || originalCache.has(record.url)) return;
    const image = new Image();
    image.decoding = 'async';
    image.src = record.url;
    originalCache.set(record.url, image);
    if (originalCache.size > 12) originalCache.delete(originalCache.keys().next().value);
  }

  function makeCard(record) {
    const card = document.createElement('a');
    card.className = 'catalog-card';
    card.href = record.url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.setAttribute('aria-label', `Lihat detail ${record.title}`);
    const image = document.createElement('img');
    image.src = record.thumb_url || record.url;
    image.decoding = 'async';
    image.alt = record.title;
    image.className = 'catalog-card-img';
    image.loading = 'lazy';
    image.width = 480;
    image.height = 679;
    const body = document.createElement('div');
    body.className = 'catalog-card-body';
    const title = document.createElement('div');
    title.className = 'catalog-card-title';
    title.textContent = record.title;
    const meta = document.createElement('div');
    meta.className = 'catalog-card-meta';
    const category = document.createElement('span');
    category.textContent = record.category;
    const arrow = document.createElement('span');
    arrow.textContent = '↗';
    meta.append(category, arrow);
    body.append(title, meta);
    card.append(image, body);
    card.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || !window.WGALightbox) return;
      event.preventDefault();
      window.WGALightbox.open(record.url, record.title, record.thumb_url || record.url);
    });
    card.addEventListener('pointerenter', () => preloadOriginal(record), { once: true });
    card.addEventListener('focus', () => preloadOriginal(record), { once: true });
    card.addEventListener('touchstart', () => preloadOriginal(record), {
      once: true,
      passive: true,
    });
    return card;
  }

  function render(container, items) {
    if (!container) return;
    container.replaceChildren(...items.map(makeCard));
  }

  function renderFilters(categories) {
    if (!chips) return;
    chips.replaceChildren();
    ['Semua', ...categories].forEach((category) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'filter-chip';
      button.classList.toggle('active', category === activeCategory);
      button.textContent = category;
      button.setAttribute('aria-pressed', String(category === activeCategory));
      button.addEventListener('click', () => selectCategory(category));
      chips.append(button);
    });
  }

  function selectCategory(category) {
    activeCategory = category;
    chips?.querySelectorAll('button').forEach((button) => {
      const selected = button.textContent === category;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (offline) filter();
    else loadCatalog();
  }

  function filter() {
    const query = normalize(search?.value || '');
    const shown = records.filter(
      (record) =>
        (activeCategory === 'Semua' || record.category === activeCategory) &&
        normalize(record.title + ' ' + record.category).includes(query),
    );
    if (grid) {
      render(grid, shown);
      if (!shown.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML =
          '<h2>Belum ada yang cocok.</h2><p>Coba kata kunci lain atau pilih kategori Semua.</p>';
        grid.append(empty);
      }
    }
    if (count) count.textContent = `${shown.length} dari ${records.length} item katalog`;
  }

  function renderAll(categories) {
    render(home, records.slice(0, 10));
    renderFilters(categories);
    if (grid) filter();
  }

  function hasSameRecords(nextRecords) {
    if (nextRecords.length !== records.length) return false;
    return nextRecords.every((next, index) => {
      const current = records[index];
      return (
        current?.title === next.title &&
        current?.category === next.category &&
        current?.url === next.url &&
        current?.thumb_url === next.thumb_url
      );
    });
  }

  search?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    // Invalidate older results immediately, before the debounced request starts.
    loadId++;
    controller?.abort();
    pager?.update({ hasMore: false, busy: true, error: false });
    searchTimer = setTimeout(() => loadCatalog(), 250);
  });

  async function loadCatalog(append = false) {
    if (append && (loading || !nextCursor)) return;
    if (!append) nextCursor = null;
    loading = true;
    pager?.update({ hasMore: !!nextCursor, busy: true, error: false });
    const requestId = ++loadId;
    controller?.abort();
    controller = new AbortController();
    const currentController = controller;
    const timeout = setTimeout(() => currentController.abort(), 15000);
    more.disabled = true;
    status.textContent = 'Memuat katalog…';
    const query = new URLSearchParams({ limit: home ? '10' : '24' });
    if (activeCategory !== 'Semua') query.set('category', activeCategory);
    if (search?.value.trim()) query.set('q', search.value.trim());
    if (append && nextCursor) query.set('cursor', nextCursor);
    try {
      const response = await fetch(`/api/catalog?${query}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal: currentController.signal,
      });
      if (!response.ok) throw new Error('catalog unavailable');
      const data = await response.json();
      if (requestId !== loadId) return;
      if (!Array.isArray(data.items)) throw new Error('catalog unavailable');
      const nextRecords = data.items.map(withLegacyAssets);
      if (append) {
        const known = new Set(records.map((record) => record.id));
        const added = nextRecords.filter((record) => !known.has(record.id));
        records.push(...added);
        grid.append(...added.map(makeCard));
      } else {
        if (!hasLiveData || !hasSameRecords(nextRecords)) render(grid || home, nextRecords);
        records = nextRecords;
      }
      hasLiveData = true;
      offline = false;
      nextCursor = data.nextCursor;
      pager?.update({ hasMore: !!nextCursor });
      const categories = Array.isArray(data.categories)
        ? data.categories.map((item) => item.name)
        : [...new Set(records.map((record) => record.category))];
      renderFilters(categories);
      if (count)
        count.textContent = `${records.length} item ditampilkan${nextCursor ? ' · masih ada lainnya' : ''}`;
      status.textContent = records.length
        ? grid && nextCursor
          ? 'Scroll ke bawah untuk melihat foto berikutnya.'
          : ''
        : 'Belum ada item katalog yang cocok.';
    } catch (error) {
      if (requestId !== loadId) return;
      pager?.update({ error: true });
      if (!hasLiveData) {
        offline = true;
        renderAll([...new Set(records.map((record) => record.category))]);
      }
      status.textContent = hasLiveData
        ? 'Katalog belum dapat diperbarui. Coba lagi sebentar.'
        : 'Koneksi katalog terganggu. Menampilkan katalog cadangan; ketersediaan perlu dikonfirmasi.';
    } finally {
      clearTimeout(timeout);
      if (requestId === loadId) {
        loading = false;
        pager?.update({ busy: false });
      }
    }
  }
  loadCatalog();
})();
