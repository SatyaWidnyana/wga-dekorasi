(() => {
  const { request, message, reviewCard, el } = window.WGAReviews;
  const $ = (id) => document.getElementById(id);
  let cursor = null;
  let generation = 0;
  const adminMessage = $('admin-status');

  function sendToLogin() {
    window.location.replace('admin.html?redirect=admin-reviews.html');
  }

  function handleError(error) {
    if (error.status === 401 || error.status === 403) return sendToLogin();
    message(adminMessage, error.message || 'Permintaan gagal. Coba kembali.', 'error');
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
        `/api/admin-reviews?status=all${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      if (current !== generation) return;
      data.items.forEach((item) => $('admin-list').append(moderationCard(item)));
      cursor = data.nextCursor;
      $('more-admin').hidden = !cursor;
      message(
        adminMessage,
        $('admin-list').children.length ? '' : 'Belum ada ulasan yang masuk.',
      );
    } catch (error) {
      if (current === generation) handleError(error);
    } finally {
      if (current === generation) $('more-admin').disabled = false;
    }
  }

  $('refresh-reviews').addEventListener('click', () => load(true));
  $('more-admin').addEventListener('click', () => load());
  window.addEventListener('wga:admin-ready', () => load(true));
})();
