/* Shared interactions, grouped by responsibility. */
(function () {
  const byId = (id) => document.getElementById(id);

  function initNavigation() {
    const header = byId('header');
    const updateHeader = () => header?.classList.toggle('scrolled', window.scrollY > 10);
    window.addEventListener('scroll', updateHeader, { passive: true });
    updateHeader();

    const menuBtn = byId('menuBtn');
    const menu = byId('mobileMenu');
    function setMenu(isOpen, restoreFocus = false) {
      if (!menuBtn || !menu) return;
      menu.hidden = !isOpen;
      menu.classList.toggle('open', isOpen);
      menuBtn.setAttribute('aria-expanded', String(isOpen));
      menuBtn.setAttribute('aria-label', isOpen ? 'Tutup menu' : 'Buka menu');
      if (restoreFocus) menuBtn.focus();
    }
    menuBtn?.addEventListener('click', () =>
      setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'),
    );
    menu?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('click', (e) => {
      if (menu && !menu.hidden && !header.contains(e.target)) setMenu(false);
    });
    window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => {
      if (e.matches) setMenu(false);
    });
    document.addEventListener('keydown', (e) => {
      const modal = byId('lightbox');
      if (e.key === 'Escape' && menu && !menu.hidden && (!modal || modal.hidden)) {
        setMenu(false, true);
      }
    });
  }

  function initFooterYear() {
    const year = byId('year');
    if (year) year.textContent = new Date().getFullYear();
  }

  function initMarkerHighlight() {
    const markerText = document.querySelector('.marker-text');
    if (markerText) {
      const revealMarker = () => markerText.classList.add('is-visible');
      if ('IntersectionObserver' in window) {
        const markerObserver = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              revealMarker();
              markerObserver.disconnect();
            }
          },
          { threshold: 0.35 },
        );
        markerObserver.observe(markerText);
      } else {
        revealMarker();
      }
    }
  }

  function initServiceCardReveal() {
    const cards = [...document.querySelectorAll('#layanan .service-card')];
    if (!cards.length) return;

    cards.forEach((card) => card.classList.add('card-reveal-ready'));
    const showCard = (card) => card.classList.add('is-visible');

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cards.forEach(showCard);
      return;
    }

    if (!('IntersectionObserver' in window)) {
      cards.forEach(showCard);
      return;
    }

    const cardObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          showCard(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -8% 0px' },
    );

    cards.forEach((card) => cardObserver.observe(card));
  }

  function initLightbox() {
    const modal = byId('lightbox');
    const modalImg = byId('lightboxImg');
    const closeBtn = byId('lightboxClose');
    let returnFocus = null;
    const previouslyInert = new Map();
    function open(src, alt, preview) {
      if (!modal || !modalImg || !src) return;
      if (modal.hidden) returnFocus = document.activeElement;
      modalImg.dataset.lightboxSource = src;
      modalImg.src = preview || src;
      modalImg.alt = alt || 'Preview katalog';
      modal.hidden = false;
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      for (const element of document.body.children) {
        if (element !== modal && element.tagName !== 'SCRIPT') {
          if (!previouslyInert.has(element)) previouslyInert.set(element, element.inert);
          element.inert = true;
        }
      }
      if (preview && preview !== src) {
        const fullImage = new Image();
        fullImage.decoding = 'async';
        fullImage.onload = () => {
          if (!modal.hidden && modalImg.dataset.lightboxSource === src) {
            modalImg.src = src;
            delete modalImg.dataset.lightboxSource;
          }
        };
        fullImage.src = src;
      }
      closeBtn?.focus();
    }
    function close() {
      if (!modal || modal.hidden) return;
      modal.classList.remove('open');
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      modalImg.removeAttribute('src');
      delete modalImg.dataset.lightboxSource;
      document.body.classList.remove('modal-open');
      for (const [element, wasInert] of previouslyInert) element.inert = wasInert;
      previouslyInert.clear();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    }
    closeBtn?.addEventListener('click', close);
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    document.addEventListener('keydown', (e) => {
      if (modal && !modal.hidden) {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          closeBtn.focus();
        }
      }
    });
    // Public interface consumed by catalog.js.
    window.WGALightbox = { open, close };
  }

  initNavigation();
  initFooterYear();
  initMarkerHighlight();
  initServiceCardReveal();
  initLightbox();
})();
