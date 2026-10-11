(() => {
  const { request, message, reviewCard, captcha } = window.WGAReviews;
  const form = document.getElementById('review-form');
  const fields = document.getElementById('review-fields');
  const submit = document.getElementById('submit-review');
  const formStatus = document.getElementById('form-status');
  const feedStatus = document.getElementById('feed-status');
  const list = document.getElementById('review-list');
  const more = document.getElementById('more-reviews');
  const summary = document.getElementById('review-summary');
  const average = document.getElementById('review-average');
  const total = document.getElementById('review-total');
  let token = '',
    widget,
    cursor = null,
    busy = false;

  async function loadReviews() {
    more.disabled = true;
    try {
      const data = await request(
        '/api/reviews' + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''),
      );
      if (data.summary && !cursor) {
        const value = Number(data.summary.averageRating || 0);
        average.textContent = value.toLocaleString('id-ID', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
        total.textContent = `${data.summary.totalReviews} ulasan`;
        summary.hidden = false;
      }
      data.items.forEach((item) => list.append(reviewCard(item)));
      cursor = data.nextCursor;
      more.hidden = !cursor;
      message(
        feedStatus,
        list.children.length
          ? ''
          : 'Belum ada ulasan yang ditampilkan. Jadilah yang pertama berbagi cerita.',
      );
    } catch {
      message(
        feedStatus,
        'Ulasan belum dapat dimuat. Silakan muat ulang halaman beberapa saat lagi.',
        'error',
      );
    } finally {
      more.disabled = false;
    }
  }
  more.addEventListener('click', loadReviews);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !token || !form.reportValidity()) return;
    const values = new FormData(form);
    busy = true;
    submit.disabled = true;
    fields.disabled = true;
    message(formStatus, 'Mengirim ulasan…');
    try {
      const data = await request('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          name: values.get('name'),
          location: values.get('location'),
          rating: Number(values.get('rating')),
          comment: values.get('comment'),
          consent: values.get('consent') === 'on',
          website: values.get('website'),
          token,
        }),
      });
      form.reset();
      message(formStatus, data.message, 'success');
    } catch (error) {
      message(formStatus, error.message || 'Koneksi terputus. Coba lagi nanti.', 'error');
    } finally {
      busy = false;
      fields.disabled = false;
      widget?.reset();
    }
  });

  async function init() {
    try {
      const cfg = await request('/api/config');
      if (!cfg.configured || !cfg.reviewsEnabled) {
        message(formStatus, 'Form ulasan belum dibuka. Terima kasih sudah ingin berbagi cerita.');
        message(feedStatus, 'Cerita klien akan hadir di sini.');
        return;
      }
      fields.disabled = false;
      message(formStatus, '');
      loadReviews();
      widget = await captcha(
        cfg.turnstileSiteKey,
        'review',
        (value) => {
          token = value;
          submit.disabled = !token || busy;
        },
        () =>
          message(
            formStatus,
            'Verifikasi keamanan belum berhasil. Periksa koneksi atau muat ulang halaman.',
            'error',
          ),
      );
    } catch {
      message(formStatus, 'Form belum dapat dimuat. Silakan coba lagi nanti.', 'error');
      message(feedStatus, 'Ulasan belum dapat dimuat.');
    }
  }
  init();
})();
