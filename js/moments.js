(() => {
  const grid = document.getElementById('moments-grid');
  const filters = document.getElementById('moment-filters');
  const status = document.getElementById('moments-status');
  const more = document.getElementById('moments-more');
  const dialog = document.getElementById('moment-lightbox');
  const lightboxImage = document.getElementById('moment-lightbox-image');
  const caption = document.getElementById('moment-lightbox-caption');
  let category = '',
    cursor = null,
    loading = false,
    lightboxRequest = 0;
  let loadRequest = 0,
    controller;
  const pager = window.WGAAutoPager({ button: more, load: () => load() });

  function showMessage(text, kind = '') {
    status.textContent = text;
    status.dataset.kind = kind;
  }
  function card(item) {
    const button = document.createElement('button');
    button.className = 'moment-card';
    button.type = 'button';
    button.addEventListener('click', () => {
      const requestId = ++lightboxRequest;
      const preview = item.thumb_url || item.url;
      lightboxImage.classList.remove('is-ready');
      lightboxImage.removeAttribute('src');
      lightboxImage.alt = item.title || `Momen ${item.category}`;
      caption.textContent = item.title ? `${item.title} · ${item.category}` : item.category;
      lightboxImage.onload = () => {
        if (requestId === lightboxRequest) lightboxImage.classList.add('is-ready');
      };
      lightboxImage.src = preview;
      dialog.showModal();
      if (preview !== item.url) {
        const fullImage = new Image();
        fullImage.decoding = 'async';
        fullImage.onload = () => {
          if (requestId === lightboxRequest && dialog.open) lightboxImage.src = item.url;
        };
        fullImage.src = item.url;
      }
    });
    const image = document.createElement('img');
    image.src = item.thumb_url || item.url;
    image.alt = item.title || `Momen ${item.category}`;
    image.loading = 'lazy';
    image.decoding = 'async';
    const body = document.createElement('span');
    body.className = 'moment-card-caption';
    body.innerHTML = `<strong></strong><small></small>`;
    body.querySelector('strong').textContent = item.title || 'Momen WGA Dekorasi';
    body.querySelector('small').textContent = item.category;
    button.append(image, body);
    return button;
  }
  function setFilters(categories) {
    filters.replaceChildren();
    [['', 'Semua'], ...categories.map((item) => [item.name, item.name])].forEach(
      ([value, label]) => {
        const button = document.createElement('button');
        button.className = `filter-chip${value === category ? ' active' : ''}`;
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', () => {
          if (value === category) return;
          category = value;
          cursor = null;
          grid.replaceChildren();
          setFilters(categories);
          load(true);
        });
        filters.append(button);
      },
    );
  }
  async function load(reset = false) {
    if (loading && !reset) return;
    const requestId = ++loadRequest;
    controller?.abort();
    controller = new AbortController();
    const currentController = controller;
    const timeout = setTimeout(() => currentController.abort(), 15000);
    loading = true;
    pager.update({ busy: true, error: false });
    if (!cursor) showMessage('Memuat momen…');
    try {
      const query = category ? `?category=${encodeURIComponent(category)}` : '';
      const page = await fetch(
        `/api/moments${query}${cursor ? `${query ? '&' : '?'}cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal: currentController.signal },
      ).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Momen belum dapat dimuat.');
        return data;
      });
      if (requestId !== loadRequest) return;
      if (!cursor) setFilters(page.categories || []);
      page.items.forEach((item) => grid.append(card(item)));
      cursor = page.nextCursor;
      pager.update({ hasMore: !!cursor });
      showMessage(grid.children.length ? '' : 'Belum ada momen yang ditampilkan.');
    } catch (error) {
      if (requestId !== loadRequest) return;
      pager.update({ error: true });
      showMessage(error.message || 'Momen belum dapat dimuat. Coba lagi nanti.', 'error');
    } finally {
      clearTimeout(timeout);
      if (requestId === loadRequest) {
        loading = false;
        pager.update({ busy: false });
      }
    }
  }
  document.getElementById('moment-lightbox-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    lightboxRequest += 1;
    lightboxImage.classList.remove('is-ready');
    lightboxImage.removeAttribute('src');
  });
  load();
})();
