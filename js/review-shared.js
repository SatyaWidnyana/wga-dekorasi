/* Small shared helpers; all user content is rendered with textContent. */
(() => {
  async function request(url, options = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 55000);
    try {
      const response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers },
        signal: options.signal || controller.signal,
      });
      const data = await response
        .json()
        .catch(() => ({
          error:
            response.status === 413
              ? 'Gambar terlalu besar. Muat ulang halaman agar optimasi upload terbaru digunakan.'
              : 'Server belum dapat merespons. Coba lagi sebentar.',
        }));
      if (!response.ok) {
        const error = new Error(data.error || 'Permintaan gagal. Silakan coba lagi.');
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError')
        throw new Error('Koneksi terlalu lama. Periksa daftar sebelum mengulangi upload.');
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }
  function message(element, text, kind = '') {
    element.textContent = text;
    element.dataset.kind = kind;
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function reviewCard(review) {
    const card = el('article', 'client-review');
    const stars = el(
      'div',
      'review-stars',
      '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating),
    );
    stars.setAttribute('aria-label', `${review.rating} dari 5 bintang`);
    const date = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(
      new Date(review.created_at),
    );
    card.append(
      stars,
      el('blockquote', '', review.comment),
      el('p', 'review-author', review.name),
      el('p', 'review-meta', `${review.location} · ${date}`),
    );
    return card;
  }
  function captcha(siteKey, action, onChange, onError) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onerror = () => {
        onError();
        reject(
          new Error(
            'Verifikasi keamanan tidak dapat dimuat. Periksa koneksi lalu muat ulang halaman.',
          ),
        );
      };
      script.onload = () => {
        const id = window.turnstile.render('#captcha', {
          sitekey: siteKey,
          action,
          theme: 'light',
          size: 'flexible',
          callback: (token) => onChange(token),
          'expired-callback': () => onChange(''),
          'error-callback': () => {
            onChange('');
            onError();
          },
        });
        resolve({
          reset: () => {
            onChange('');
            window.turnstile.reset(id);
          },
        });
      };
      document.head.append(script);
    });
  }
  window.WGAReviews = { request, message, el, reviewCard, captcha };
})();
