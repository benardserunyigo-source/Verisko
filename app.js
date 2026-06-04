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
      ['.pkg-rows .pkg-row', 80],
      ['.addon-note', 0],
      ['.trust-bar', 0],
      ['.why-more', 0],
      ['.features-head > *', 90],
      ['.feature-hero', 0],
      ['.feature-grid .feature-card', 100],
      ['.about-text > *', 90],
      ['.about-stats .stat', 90],
      ['.contact-text > *', 80],
      ['.contact-form', 0]
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

  /* ---------- Count-up on the About stats ---------- */
  var statNums = document.querySelectorAll('.about-stats .stat-num');
  if (statNums.length && hasIO && !reduceMotion) {
    var runCount = function (el) {
      var raw = el.textContent;
      var match = raw.match(/(\d[\d,]*)/);
      if (!match) return;
      var target = parseInt(match[1].replace(/,/g, ''), 10);
      var prefix = raw.slice(0, match.index);
      var suffix = raw.slice(match.index + match[1].length);
      var duration = 1500;
      var startTime = null;
      var tick = function (now) {
        if (startTime === null) startTime = now;
        var p = Math.min((now - startTime) / duration, 1);
        var eased = 1 - Math.pow(1 - p, 3);           // easeOutCubic
        var val = Math.round(eased * target);
        el.textContent = prefix + val.toLocaleString() + suffix;
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = prefix + target.toLocaleString() + suffix;
      };
      requestAnimationFrame(tick);
    };

    var statIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          runCount(entry.target);
          statIO.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });
    statNums.forEach(function (el) { statIO.observe(el); });
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

  /* ---------- Contact form -> Google Sheet (Apps Script web app) ---------- */
  var form = document.querySelector('.contact-form');
  if (form) {
    var endpoint = form.getAttribute('data-endpoint');
    var status = form.querySelector('.form-status');
    var setStatus = function (msg, kind) {
      if (!status) return;
      status.textContent = msg;
      status.classList.remove('ok', 'err');
      status.classList.add('show', kind);
    };
    form.addEventListener('submit', function (e) {
      if (!endpoint) return;                       // no endpoint -> native submit
      e.preventDefault();

      var honey = form.querySelector('[name="company"]');
      if (honey && honey.value) return;            // bot filled the honeypot — drop silently

      var btn = form.querySelector('button[type="submit"]');
      var original = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

      fetch(endpoint, {
        method: 'POST',
        body: new URLSearchParams(new FormData(form)),
        mode: 'no-cors'                            // Apps Script doesn't send CORS headers
      })
        .then(function () {
          form.reset();
          setStatus('Thanks! We’ve got your details and will be in touch shortly.', 'ok');
        })
        .catch(function () {
          setStatus('Sorry, something went wrong. Please call or WhatsApp us instead.', 'err');
        })
        .then(function () {
          if (btn) { btn.disabled = false; btn.innerHTML = original; }
        });
    });
  }
})();
