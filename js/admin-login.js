(() => {
  const { request, message, captcha } = window.WGAReviews;
  const $ = (id) => document.getElementById(id);
  let token = '';
  let widget;
  let busy = false;

  function destination() {
    const target = new URLSearchParams(window.location.search).get('redirect');
    return ['admin-moments.html', 'admin-reviews.html', 'admin-catalog.html'].includes(target)
      ? target
      : 'admin-moments.html';
  }

  function goToAdminPage() {
    window.location.replace(destination());
  }

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !token || !$('login-form').reportValidity()) return;
    const values = new FormData(event.currentTarget);
    busy = true;
    $('login-button').disabled = true;
    message($('login-status'), 'Memeriksa akun…');
    try {
      await request('/api/admin-session', {
        method: 'POST',
        body: JSON.stringify({
          email: values.get('email'),
          password: values.get('password'),
          token,
        }),
      });
      goToAdminPage();
    } catch (error) {
      message($('login-status'), error.message || 'Login gagal. Coba kembali.', 'error');
    } finally {
      busy = false;
      widget?.reset();
    }
  });

  async function init() {
    try {
      const cfg = await request('/api/config');
      if (!cfg.configured) {
        message(
          $('login-status'),
          'Login admin belum tersedia. Pengaturan layanan perlu diselesaikan dahulu.',
        );
        return;
      }
      try {
        await request('/api/admin-session');
        goToAdminPage();
        return;
      } catch (error) {
        if (error.status !== 401) message($('login-status'), error.message, 'error');
      }
      $('login-fields').disabled = false;
      message($('login-status'), '');
      widget = await captcha(
        cfg.turnstileSiteKey,
        'admin_login',
        (value) => {
          token = value;
          $('login-button').disabled = !token || busy;
        },
        () =>
          message(
            $('login-status'),
            'Verifikasi keamanan gagal. Muat ulang halaman untuk mencoba lagi.',
            'error',
          ),
      );
    } catch {
      message(
        $('login-status'),
        'Layanan belum dapat dihubungi. Silakan coba lagi nanti.',
        'error',
      );
    }
  }

  init();
})();
