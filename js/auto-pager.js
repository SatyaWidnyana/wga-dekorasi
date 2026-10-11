/* One page at a time; manual retry on failure and a button fallback for older browsers. */
(() => {
  window.WGAAutoPager = ({ button, load }) => {
    const sentinel = document.createElement('div');
    sentinel.className = 'auto-page-sentinel';
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.height = '1px';
    button.before(sentinel);
    const label = button.textContent;
    let state = { hasMore: false, busy: false, error: false },
      running = false;
    const observer =
      'IntersectionObserver' in window
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting) && state.hasMore && !state.error)
                run();
            },
            { rootMargin: '0px 0px 350px 0px' },
          )
        : null;
    function update(next = {}) {
      state = { ...state, ...next };
      button.hidden = !(state.error || (!observer && state.hasMore));
      button.disabled = state.busy || running;
      button.textContent = state.error ? 'Coba lagi' : label;
      sentinel.hidden = !state.hasMore || state.error;
      observer?.disconnect();
      if (state.hasMore && !state.busy && !state.error && !running) observer?.observe(sentinel);
    }
    async function run() {
      if (running || state.busy || (!state.hasMore && !state.error)) return;
      running = true;
      update();
      try {
        await load();
      } catch {
        state.error = true;
      } finally {
        running = false;
        update();
      }
    }
    button.addEventListener('click', run);
    update();
    return { update };
  };
})();
