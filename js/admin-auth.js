(() => {
  const { request, message } = window.WGAReviews;
  const logout = document.getElementById('logout');

  function goToLogin() {
    const current = window.location.pathname.split('/').pop();
    const query = ['admin-moments.html', 'admin-reviews.html', 'admin-catalog.html'].includes(
      current,
    )
      ? `?redirect=${encodeURIComponent(current)}`
      : '';
    window.location.replace(`admin.html${query}`);
  }

  async function init() {
    try {
      const data = await request('/api/admin-session');
      document.body.classList.add('is-authenticated');
      if (logout) logout.hidden = false;
      window.dispatchEvent(new CustomEvent('wga:admin-ready', { detail: { admin: data.admin } }));
    } catch (error) {
      if (error.status === 401) return goToLogin();
      const status = document.getElementById('admin-page-status');
      if (status) message(status, error.message || 'Sesi admin tidak dapat diperiksa.', 'error');
    }
  }

  logout?.addEventListener('click', async () => {
    logout.disabled = true;
    try {
      await request('/api/admin-session', { method: 'DELETE' });
      goToLogin();
    } catch (error) {
      const status = document.getElementById('admin-page-status');
      if (status) message(status, error.message || 'Logout gagal. Coba lagi.', 'error');
      logout.disabled = false;
    }
  });

  init();
})();
