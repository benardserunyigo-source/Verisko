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
      ['.trust-bar', 0],
      ['.why-more', 0],
      ['.features-head > *', 90],
      ['.feature-hero', 0],
      ['.feature-grid .feature-card', 100],
      ['.about-text > *', 90],
      ['.about-stats .stat', 90],
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

  /* ---------- Free site survey: contextual steps + submit -> Google Sheet ---------- */
  var surveyForm = document.getElementById('surveyForm');
  if (surveyForm) {
    // Contextual sub-questions + concern checkboxes per vertical.
    var contextualQuestions = {
      home: {
        subFields: '' +
          '<label class="field-label">Quick property details</label>' +
          '<div class="input-row">' +
            '<div class="field"><input class="input-text" name="floors" type="text" placeholder="Number of floors (e.g. 2)"></div>' +
            '<div class="field"><input class="input-text" name="gates" type="text" placeholder="Number of gates / entrances (e.g. 2)"></div>' +
          '</div>' +
          '<div class="input-row" style="margin-top:14px;">' +
            '<div class="field" style="margin:0;"><input class="input-text" name="boundary" type="text" placeholder="Boundary wall (yes / no / partial)"></div>' +
            '<div class="field" style="margin:0;"><input class="input-text" name="staff" type="text" placeholder="Domestic staff (housekeeper, guard, gardener…)"></div>' +
          '</div>',
        concerns: [
          'After-hours intrusion', 'Domestic staff accountability', 'Front gate access',
          'Driveway / parking', 'Back yard or perimeter', 'Children safety monitoring',
          'Recent specific incident', 'Remote viewing while travelling'
        ]
      },
      shop: {
        subFields: '' +
          '<label class="field-label">Quick shop details</label>' +
          '<div class="input-row">' +
            '<div class="field"><input class="input-text" name="shopType" type="text" placeholder="Type of shop (supermarket, salon, electronics…)"></div>' +
            '<div class="field"><input class="input-text" name="staffCount" type="text" placeholder="Number of staff at peak"></div>' +
          '</div>' +
          '<div class="input-row" style="margin-top:14px;">' +
            '<div class="field" style="margin:0;"><input class="input-text" name="tills" type="text" placeholder="Number of till / cash points"></div>' +
            '<div class="field" style="margin:0;"><input class="input-text" name="hours" type="text" placeholder="Operating hours (e.g. 8am–8pm)"></div>' +
          '</div>',
        concerns: [
          'Customer shoplifting', 'Staff shrinkage (internal theft)', 'Till transaction disputes',
          'After-hours break-in', 'Front window / display protection', 'Stockroom / back-of-house theft',
          'Customer disputes & refund claims', 'Insurance verification requirement'
        ]
      },
      office: {
        subFields: '' +
          '<label class="field-label">Quick office details</label>' +
          '<div class="input-row">' +
            '<div class="field"><input class="input-text" name="employees" type="text" placeholder="Number of employees"></div>' +
            '<div class="field"><input class="input-text" name="reception" type="text" placeholder="Reception staffed? (yes / no)"></div>' +
          '</div>' +
          '<div class="input-row" style="margin-top:14px;">' +
            '<div class="field" style="margin:0;"><input class="input-text" name="serverRoom" type="text" placeholder="Server / IT room? (yes / no)"></div>' +
            '<div class="field" style="margin:0;"><input class="input-text" name="parking" type="text" placeholder="Car park? (yes / no / shared)"></div>' +
          '</div>',
        concerns: [
          'Visitor management at reception', 'After-hours building access', 'Workspace and corridor coverage',
          'Server room / IT closet protection', 'Parking lot incidents', 'Equipment theft tracking',
          'Employee accountability monitoring', 'Compliance / audit requirement'
        ]
      },
      pharmacy: {
        subFields: '' +
          '<label class="field-label">Quick pharmacy / clinic details</label>' +
          '<div class="input-row">' +
            '<div class="field"><input class="input-text" name="pharmType" type="text" placeholder="Type (community pharmacy, clinic, dental, optical…)"></div>' +
            '<div class="field"><input class="input-text" name="cdStorage" type="text" placeholder="Controlled drug storage? (yes / no)"></div>' +
          '</div>' +
          '<div class="input-row" style="margin-top:14px;">' +
            '<div class="field" style="margin:0;"><input class="input-text" name="dispensary" type="text" placeholder="Number of dispensary counters"></div>' +
            '<div class="field" style="margin:0;"><input class="input-text" name="staffCount" type="text" placeholder="Number of staff"></div>' +
          '</div>',
        concerns: [
          'Dispensary counter dispute resolution', 'Staff shrinkage and accountability',
          'Controlled drug storage monitoring', 'Till / cash point coverage', 'Customer ID at dispensary',
          'Insurance verification requirement', 'After-hours break-in', 'Patient safety monitoring'
        ]
      },
      compound: {
        subFields: '' +
          '<label class="field-label">Quick compound details</label>' +
          '<div class="input-row">' +
            '<div class="field"><input class="input-text" name="buildings" type="text" placeholder="Number of buildings"></div>' +
            '<div class="field"><input class="input-text" name="gates" type="text" placeholder="Number of gates / entrances"></div>' +
          '</div>' +
          '<div class="input-row" style="margin-top:14px;">' +
            '<div class="field" style="margin:0;"><input class="input-text" name="mixedUse" type="text" placeholder="Mixed use? (residence + business / Airbnb / single family)"></div>' +
            '<div class="field" style="margin:0;"><input class="input-text" name="guard" type="text" placeholder="Security guard on duty? (yes / no / day-only)"></div>' +
          '</div>',
        concerns: [
          'Perimeter wall and boundary', 'Main gate ID and access', 'Drive and parking coverage',
          'Multiple building blind spots', 'Visitor / tenant tracking', 'Domestic staff accountability',
          'Mixed-use separation (residence vs business)', 'Remote viewing while travelling'
        ]
      }
    };
    var verticalLabels = {
      home: 'Home', shop: 'Shop / Retail', office: 'Office',
      pharmacy: 'Pharmacy / Clinic', compound: 'Compound'
    };

    var contextualBlock = document.getElementById('contextualBlock');
    var concernsList = document.getElementById('concernsList');

    var escapeHtml = function (s) {
      return String(s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    };

    var renderContextual = function (vertical) {
      var data = contextualQuestions[vertical];
      if (!data) return;
      contextualBlock.innerHTML = data.subFields;
      concernsList.innerHTML = data.concerns.map(function (c, i) {
        return '' +
          '<div class="check-item">' +
            '<input type="checkbox" id="concern-' + i + '" name="concerns[]" value="' + escapeHtml(c) + '">' +
            '<label for="concern-' + i + '">' +
              '<span class="box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>' +
              '<span>' + escapeHtml(c) + '</span>' +
            '</label>' +
          '</div>';
      }).join('');
    };
    renderContextual('home');

    var svtabs = surveyForm.querySelectorAll('.vtab');
    var verticalInput = document.getElementById('verticalInput');
    svtabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        svtabs.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var v = btn.dataset.vertical;
        if (verticalInput) verticalInput.value = v;
        renderContextual(v);
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
      var concerns = fd.getAll('concerns[]').join(', ');
      var lines = [
        'Space type: ' + (verticalLabels[get('vertical')] || get('vertical')),
        'Property: ' + get('propName') + (get('propArea') ? ' (' + get('propArea') + ')' : ''),
        'Size: ' + get('propSize') + ' | Existing CCTV: ' + get('cctvStatus'),
        'Timeline: ' + get('timeline') + ' | Preferred contact: ' + get('contactPref'),
        concerns ? 'Concerns: ' + concerns : ''
      ];
      var ctxKeys = ['floors','gates','boundary','staff','shopType','staffCount','tills','hours',
        'employees','reception','serverRoom','parking','pharmType','cdStorage','dispensary',
        'buildings','mixedUse','guard'];
      var ctx = ctxKeys.map(function (k) { var v = get(k); return v ? k + ': ' + v : ''; })
        .filter(Boolean).join(' | ');
      if (ctx) lines.push('Details: ' + ctx);
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
      fd.set('type', verticalLabels[fd.get('vertical')] || (fd.get('vertical') || '').toString());
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
})();
