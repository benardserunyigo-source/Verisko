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

  /* ---------- Pricing: vertical tabs + Standard/Pro toggle ---------- */
  var vtabs = document.querySelectorAll('.vtab');
  if (vtabs.length) {
    // Camera mixes per vertical × package size. All cameras drawn from the
    // current catalogue: 5MP bullet, 5MP dome, 8MP wide-angle dome, 5MP PTZ.
    var cameraMixes = {
      home: {
        2:  '2× 5MP bullet — gate + drive',
        4:  '3× 5MP bullet + 1× 5MP dome (interior entrance)',
        6:  '4× 5MP bullet + 2× 5MP dome (interior)',
        8:  '5× 5MP bullet + 2× 5MP dome + 1× 5MP PTZ (back yard)',
        12: '7× 5MP bullet + 4× 5MP dome + 1× 5MP PTZ'
      },
      shop: {
        2:  '1× 5MP bullet + 1× 5MP dome (interior)',
        4:  '1× 5MP bullet + 3× 5MP dome (retail floor)',
        6:  '1× 5MP bullet + 4× 5MP dome + 1× 8MP dome (overhead till)',
        8:  '1× 5MP bullet + 5× 5MP dome + 1× 8MP dome (till) + 1× 5MP PTZ',
        12: '2× 5MP bullet + 7× 5MP dome + 1× 8MP dome (till) + 1× 5MP PTZ + 1× 5MP dome (rear)'
      },
      office: {
        2:  '1× 5MP bullet + 1× 5MP dome (reception, close-mount)',
        4:  '1× 5MP bullet + 1× 5MP dome (reception) + 2× 5MP dome (workspace)',
        6:  '2× 5MP bullet + 1× 5MP dome (reception) + 3× 5MP dome (workspace)',
        8:  '2× 5MP bullet + 1× 5MP dome (reception) + 4× 5MP dome + 1× 5MP PTZ (parking)',
        12: '3× 5MP bullet + 2× 5MP dome (reception/lobby) + 5× 5MP dome + 1× 8MP dome + 1× 5MP PTZ'
      },
      pharmacy: {
        2:  '1× 5MP bullet + 1× 5MP dome (dispensary, close-mount)',
        4:  '1× 5MP bullet + 1× 5MP dome (dispensary) + 2× 5MP dome (floor)',
        6:  '1× 5MP bullet + 1× 5MP dome (dispensary) + 3× 5MP dome + 1× 8MP dome (overhead till)',
        8:  '1× 5MP bullet + 2× 5MP dome (dispensary + storage) + 4× 5MP dome + 1× 8MP dome (till)',
        12: '2× 5MP bullet + 2× 5MP dome (dispensary + storage) + 6× 5MP dome + 1× 8MP dome + 1× 5MP PTZ'
      },
      compound: {
        2:  '2× 5MP bullet — main gate + drive',
        4:  '3× 5MP bullet + 1× 5MP dome (interior)',
        6:  '4× 5MP bullet + 2× 5MP dome (interior)',
        8:  '5× 5MP bullet + 2× 5MP dome + 1× 5MP PTZ',
        12: '6× 5MP bullet + 3× 5MP dome + 1× 5MP PTZ + 1× 5MP dome (gate ID) + 1× 8MP dome'
      }
    };

    var verticalDescriptions = {
      home: '<strong>Home —</strong> detached or semi-detached residence with gate and perimeter focus. 5MP bullets at entry, drive, and side passages; discreet 5MP domes at interior entry points; PTZ for back yard tracking at the 8-cam tier and above.',
      shop: '<strong>Shop &amp; Retail —</strong> boutiques, supermarkets, salons, electronics. Interior-heavy with discreet ceiling-mounted 5MP domes through the retail floor; <strong>8MP wide-angle dome overhead at the till</strong> for high-detail transaction capture. Bullet at the entrance for deterrence.',
      office: '<strong>Office &amp; Workspace —</strong> coworking, small/medium offices. <strong>Close-mounted 5MP dome at reception</strong> for ID-grade entry capture (1.5–2m above the desk), domes through workspaces and corridors, bullet at the car park entry, PTZ for larger lots from 8-cam up.',
      pharmacy: '<strong>Pharmacy &amp; Clinic —</strong> pharmacies, clinics, dental, optical. <strong>Close-mounted 5MP dome at the dispensary counter</strong> for compliance and identification-grade capture, <strong>8MP wide-angle dome overhead at the till</strong> from 6-cam up. Domes on the retail floor, bullet at entry. Designed to resolve disputes and meet insurance verification.',
      compound: '<strong>Compound / Mixed Use —</strong> larger residential with multiple buildings, Airbnb compounds, residence + business. Heavy on perimeter 5MP bullets, dome coverage in main interior spaces, PTZ for the drive at 8-cam up, gate ID dome at the 12-cam tier.'
    };

    var mixDetails = document.querySelectorAll('.mix-detail');
    var vertDesc = document.getElementById('vertDesc');

    vtabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        vtabs.forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        var v = btn.dataset.vertical;
        mixDetails.forEach(function (el) {
          var size = el.dataset.mix;
          if (cameraMixes[v] && cameraMixes[v][size]) el.textContent = cameraMixes[v][size];
        });
        if (vertDesc && verticalDescriptions[v]) vertDesc.innerHTML = verticalDescriptions[v];
      });
    });

    var toggleBtns = document.querySelectorAll('.toggle-btn');
    var priceNums = document.querySelectorAll('.price-num');
    toggleBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        toggleBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var tier = btn.dataset.tier;
        priceNums.forEach(function (el) {
          var value = el.dataset[tier === 'pro' ? 'pro' : 'std'];
          if (value === '—') {
            el.classList.add('unavailable');
            el.textContent = 'Pro starts at 4-cam';
          } else {
            el.classList.remove('unavailable');
            el.textContent = value;
          }
        });
      });
    });
  }
})();
