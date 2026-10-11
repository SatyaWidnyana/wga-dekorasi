(() => {
  const { request, message, reviewCard, el, captcha } = window.WGAReviews;
  const $ = (id) => document.getElementById(id);
  let token = '',
    widget,
    busy = false,
    status = 'all',
    cursor = null,
    generation = 0;
  const loginMessage = $('login-status');
  const adminMessage = $('admin-status');

  function showLogin() {
    document.body.classList.remove('is-authenticated');
    $('dashboard').hidden = true;
    $('login-panel').hidden = false;
    $('logout').hidden = true;
    $('admin-list').replaceChildren();
    window.dispatchEvent(new CustomEvent('wga:admin-logged-out'));
  }
  function showDashboard(admin) {
    document.body.classList.add('is-authenticated');
    $('login-panel').hidden = true;
    $('dashboard').hidden = false;
    $('logout').hidden = false;
    window.dispatchEvent(new CustomEvent('wga:admin-ready'));
    load(true);
    const target = location.hash ? document.getElementById(location.hash.slice(1)) : null;
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  }

  function moderationCard(review) {
    const card = reviewCard(review);
    const controls = el('div', 'moderation-controls');
    const actions = el('div', 'moderation-actions');
    const deleteButton = el('button', 'btn reject-button', 'Hapus ulasan');
    deleteButton.type = 'button';
    deleteButton.addEventListener('click', async () => {
      if (!window.confirm('Hapus ulasan ini secara permanen?')) return;
      deleteButton.disabled = true;
      try {
        await request('/api/admin-reviews', {
          method: 'DELETE',
          body: JSON.stringify({ id: review.id }),
        });
        await load(true);
        message(adminMessage, 'Ulasan dihapus.', 'success');
      } catch (error) {
        handleError(error);
        deleteButton.disabled = false;
      }
    });
    actions.append(deleteButton);
    controls.append(actions);
    card.append(controls);
    return card;
  }
  function handleError(error) {
    if (error.status === 401 || error.status === 403) {
      showLogin();
      message(loginMessage, error.message, 'error');
    } else message(adminMessage, error.message || 'Permintaan gagal. Coba kembali.', 'error');
  }
  async function load(reset = false) {
    if (reset) {
      cursor = null;
      $('admin-list').replaceChildren();
    }
    const current = ++generation;
    $('more-admin').disabled = true;
    message(adminMessage, 'Memuat ulasan…');
    try {
      const data = await request(
        `/api/admin-reviews?status=${status}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      if (current !== generation) return;
      data.items.forEach((item) => $('admin-list').append(moderationCard(item)));
      cursor = data.nextCursor;
      $('more-admin').hidden = !cursor;
      message(
        adminMessage,
        $('admin-list').children.length ? '' : 'Belum ada ulasan pada kategori ini.',
      );
    } catch (error) {
      if (current === generation) handleError(error);
    } finally {
      if (current === generation) $('more-admin').disabled = false;
    }
  }

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !token || !$('login-form').reportValidity()) return;
    const values = new FormData(event.currentTarget);
    busy = true;
    $('login-button').disabled = true;
    message(loginMessage, 'Memeriksa akun…');
    try {
      const data = await request('/api/admin-session', {
        method: 'POST',
        body: JSON.stringify({
          email: values.get('email'),
          password: values.get('password'),
          token,
        }),
      });
      $('login-form').reset();
      showDashboard(data.admin);
    } catch (error) {
      message(loginMessage, error.message || 'Login gagal. Coba kembali.', 'error');
    } finally {
      busy = false;
      widget?.reset();
    }
  });
  $('logout').addEventListener('click', async () => {
    $('logout').disabled = true;
    try {
      await request('/api/admin-session', { method: 'DELETE' });
      generation++;
      showLogin();
      message(loginMessage, 'Anda sudah keluar.');
    } catch (error) {
      handleError(error);
    } finally {
      $('logout').disabled = false;
    }
  });
  $('refresh-reviews').addEventListener('click', () => load(true));
  $('more-admin').addEventListener('click', () => load());
  async function init() {
    try {
      const cfg = await request('/api/config');
      if (!cfg.configured) {
        message(
          loginMessage,
          'Login admin belum tersedia. Pengaturan layanan perlu diselesaikan dahulu.',
        );
        return;
      }
      $('login-fields').disabled = false;
      message(loginMessage, '');
      try {
        const data = await request('/api/admin-session');
        showDashboard(data.admin);
      } catch (error) {
        if (error.status !== 401) message(loginMessage, error.message, 'error');
      }
      widget = await captcha(
        cfg.turnstileSiteKey,
        'admin_login',
        (value) => {
          token = value;
          $('login-button').disabled = !token || busy;
        },
        () =>
          message(
            loginMessage,
            'Verifikasi keamanan gagal. Muat ulang halaman untuk mencoba lagi.',
            'error',
          ),
      );
    } catch {
      message(loginMessage, 'Layanan belum dapat dihubungi. Silakan coba lagi nanti.', 'error');
    }
  }
  init();
})();
