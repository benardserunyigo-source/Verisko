/* =====================================================================
   Verisko — front-end interactions
   - Scroll-reveal (staggered fade/rise) via IntersectionObserver
   - Count-up animation on the About stats
   - Frosted sticky-header state on scroll
   - Cookie consent (remembers the choice in localStorage)
   All motion is progressive enhancement and respects reduced-motion.
   ===================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;

  /* ---------- Scroll reveal ----------
     The .js-reveal flag is set in <head> before first paint. The hero gets a
     dedicated CSS entrance (see styles.css); everything below reveals on scroll. */
  if (!reduceMotion && hasIO) {
    // [selector, per-item stagger in ms] — staggered groups feel choreographed
    var groups = [
      ['.solutions .section-title', 0],
      ['.bento .tile', 80],
      ['.products .section-head > *', 90],
      ['.product-grid .product-card', 90],
      ['.pricing-header > *', 90],
      ['.pricing-grid .card', 80],
      ['.addon-note', 0],
      ['.features-head > *', 90],
      ['.feature-hero', 0],
      ['.feature-grid .feature-card', 100],
      ['.promise-head > *', 90],
      ['.promise-grid .promise-card', 80],
      ['.survey-header > *', 80],
      ['.survey .step', 90]
    ];

    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealIO.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    groups.forEach(function (group) {
      var selector = group[0];
      var step = group[1];
      document.querySelectorAll(selector).forEach(function (el, i) {
        el.classList.add('reveal');
        if (step) el.style.transitionDelay = Math.min(i * step, 520) + 'ms';
        revealIO.observe(el);
      });
    });
  }

  /* ---------- Mobile nav (hamburger drawer) ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var panel = document.getElementById('primary-nav');
  var backdrop = document.querySelector('.nav-backdrop');
  if (toggle && panel) {
    var openNav = function () {
      panel.classList.add('open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
      document.body.classList.add('nav-open');
      if (backdrop) {
        backdrop.hidden = false;
        requestAnimationFrame(function () { backdrop.classList.add('show'); });
      }
    };
    var closeNav = function () {
      panel.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      document.body.classList.remove('nav-open');
      if (backdrop) {
        backdrop.classList.remove('show');
        var hide = function () { backdrop.hidden = true; backdrop.removeEventListener('transitionend', hide); };
        backdrop.addEventListener('transitionend', hide);
      }
    };
    toggle.addEventListener('click', function () {
      if (panel.classList.contains('open')) closeNav(); else openNav();
    });
    if (backdrop) backdrop.addEventListener('click', closeNav);
    panel.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeNav);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('open')) closeNav();
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 900 && panel.classList.contains('open')) closeNav();
    });
  }

  /* ---------- Frosted header on scroll ---------- */
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('scrolled', window.scrollY > 12);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- Cookie consent ---------- */
  var bar = document.getElementById('cookieBar');
  if (bar) {
    var KEY = 'verisko_cookie_consent';
    var stored = null;
    try { stored = localStorage.getItem(KEY); } catch (e) { /* private mode */ }

    if (!stored) {
      bar.hidden = false;
      // double rAF so the slide-in transition runs from the hidden state
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { bar.classList.add('show'); });
      });
    }

    var dismiss = function (choice) {
      try { localStorage.setItem(KEY, choice); } catch (e) { /* ignore */ }
      bar.classList.remove('show');
      var cleanup = function () { bar.hidden = true; bar.removeEventListener('transitionend', cleanup); };
      bar.addEventListener('transitionend', cleanup);
    };

    var accept = bar.querySelector('.cookie-accept');
    var decline = bar.querySelector('.cookie-decline');
    if (accept) accept.addEventListener('click', function () { dismiss('accepted'); });
    if (decline) decline.addEventListener('click', function () { dismiss('declined'); });
  }

  /* ---------- Free site survey: contextual steps + submit -> Google Sheet ---------- */
  var surveyForm = document.getElementById('surveyForm');
  if (surveyForm) {
    var verticalLabels = {
      home: 'Homes', shop: 'Shops', office: 'Offices',
      pharmacy: 'Pharmacies & Clinics', school: 'Schools', rental: 'Rentals'
    };

    var svtabs = surveyForm.querySelectorAll('.vtab');
    var verticalInput = document.getElementById('verticalInput');
    var selectVertical = function (slug) {
      var matched = false;
      svtabs.forEach(function (b) {
        var on = b.dataset.vertical === slug;
        b.classList.toggle('active', on);
        if (on) matched = true;
      });
      if (matched && verticalInput) verticalInput.value = slug;
      return matched;
    };
    svtabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectVertical(btn.dataset.vertical);
      });
    });

    // Read a "#contact?vertical=<slug>" deep link on page load and pre-select the
    // matching Step 01 chip — without scrolling. Chips now carry the same stable
    // slugs as the tile links (home/shop/office/pharmacy/school/rental), so no
    // aliasing is needed. Scoped to the survey form via selectVertical().
    var deepHash = window.location.hash;               // e.g. "#contact?vertical=pharmacy"
    var deepQ = deepHash.indexOf('?');
    if (deepQ !== -1) {
      var deepVertical = new URLSearchParams(deepHash.slice(deepQ + 1)).get('vertical');
      if (deepVertical) selectVertical(deepVertical);
    }

    /* In-page clicks on the "Who we protect" tiles: the browser can't scroll to
       "#contact?vertical=X" (no matching id), so intercept, pre-select the chip,
       and scroll to the form. */
    document.querySelectorAll('.tile[href*="#contact?vertical="]').forEach(function (tile) {
      tile.addEventListener('click', function (e) {
        e.preventDefault();
        var raw = (tile.getAttribute('href').split('vertical=')[1] || '').split('&')[0];
        selectVertical(raw);
        var section = document.getElementById('contact');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // ---- submit: map answers to the Sheet's columns, then POST ----
    var surveyEndpoint = surveyForm.getAttribute('data-endpoint');
    var surveyStatus = surveyForm.querySelector('.form-status');
    var setSurveyStatus = function (msg, kind) {
      if (!surveyStatus) return;
      surveyStatus.textContent = msg;
      surveyStatus.classList.remove('ok', 'err');
      surveyStatus.classList.add('show', kind);
    };

    var buildSummary = function (fd) {
      var get = function (k) { var v = fd.get(k); return v ? String(v).trim() : ''; };
      var lines = [
        'Space type: ' + (verticalLabels[get('vertical')] || get('vertical')),
        'Area: ' + get('propArea'),
        'Size: ' + get('propSize') + ' | Existing CCTV: ' + get('cctvStatus'),
        'Timeline: ' + get('timeline') + ' | Payment: ' + get('payment'),
        'Preferred contact: ' + get('contactPref')
      ];
      if (get('notes')) lines.push('Notes: ' + get('notes'));
      return lines.filter(Boolean).join('\n');
    };

    surveyForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var honey = surveyForm.querySelector('[name="company"]');
      if (honey && honey.value) return;            // bot filled the honeypot — drop silently

      var btn = surveyForm.querySelector('.submit-btn');
      var original = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

      var fd = new FormData(surveyForm);
      fd.set('name', (fd.get('fullName') || '').toString());
      fd.set('phone', (fd.get('whatsapp') || '').toString());
      fd.set('type', 'site-survey');     // lead type — the vertical itself lands in the 'vertical' column
      fd.set('message', buildSummary(fd));

      var showSuccess = function () {
        surveyForm.classList.add('hidden');
        var banner = document.getElementById('successBanner');
        if (banner) banner.classList.add('shown');
        var section = document.getElementById('contact');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };

      if (!surveyEndpoint) { showSuccess(); return; }

      fetch(surveyEndpoint, {
        method: 'POST',
        body: new URLSearchParams(fd),
        mode: 'no-cors'                            // Apps Script doesn't send CORS headers
      })
        .then(function () { showSuccess(); })
        .catch(function () {
          if (btn) { btn.disabled = false; btn.innerHTML = original; }
          setSurveyStatus('Sorry, something went wrong. Please call or WhatsApp us on +256 761 480 347 instead.', 'err');
        });
    });
  }

  /* -------------------------------------------------------------------
     Product features modal — "View features" on each product card opens
     a shared smart-features dialog, personalised with the product name.
     Tap/click only (no hover dependency); Esc + overlay + × all close it.
  ------------------------------------------------------------------- */
  var featureModal = document.getElementById('featureModal');
  if (featureModal) {
    var fmName = featureModal.querySelector('[data-feature-name]');
    var fmCloseBtn = featureModal.querySelector('.fm-close');
    var fmSets = featureModal.querySelectorAll('.fm-set');
    var fmDialog = featureModal.querySelector('.fm-dialog');
    var fmLastFocus = null;

    var openModal = function (product, set) {
      fmLastFocus = document.activeElement;
      if (fmName && product) fmName.textContent = product;
      var want = set || 'camera';
      fmSets.forEach(function (s) {
        s.hidden = (s.getAttribute('data-feature-set') !== want);
      });
      featureModal.hidden = false;
      document.body.style.overflow = 'hidden';
      if (fmDialog) fmDialog.scrollTop = 0;
      if (fmCloseBtn) fmCloseBtn.focus();
    };

    var closeModal = function (restoreFocus) {
      featureModal.hidden = true;
      document.body.style.overflow = '';
      if (restoreFocus !== false && fmLastFocus && fmLastFocus.focus) fmLastFocus.focus();
    };

    document.querySelectorAll('[data-feature-open]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        // nav/footer "Features" are <a> — don't also jump the page
        if (btn.tagName === 'A') e.preventDefault();
        openModal(btn.getAttribute('data-product') || '', btn.getAttribute('data-feature-set') || 'camera');
      });
    });

    featureModal.querySelectorAll('[data-feature-close]').forEach(function (el) {
      el.addEventListener('click', function () {
        // the CTA is a real anchor to #contact — close, but don't steal focus
        // back to the card or it fights the scroll-to-contact.
        var isLink = el.tagName === 'A';
        closeModal(!isLink);
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !featureModal.hidden) closeModal();
    });
  }
})();
