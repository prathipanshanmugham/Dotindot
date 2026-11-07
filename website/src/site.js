/* dotindot.in — the only script on the site (~4 KB). Menu, lead forms → CRM, hero dots. */
(function () {
  var CFG = window.__DD || {};
  // menu
  var hdr = document.querySelector('.hdr'), burger = document.querySelector('.burger');
  if (burger) burger.addEventListener('click', function () { var o = hdr.classList.toggle('open'); burger.setAttribute('aria-expanded', o); });

  // UTM + referrer memory (first touch wins), so every lead carries its source
  try {
    var q = new URLSearchParams(location.search), keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
    var saved = JSON.parse(localStorage.getItem('dd_src') || 'null');
    if (!saved) {
      saved = { landing: location.pathname, referrer: document.referrer || '', at: new Date().toISOString() };
      keys.forEach(function (k) { if (q.get(k)) saved[k] = q.get(k); });
      localStorage.setItem('dd_src', JSON.stringify(saved));
    }
  } catch (e) { saved = {}; }

  // forms → CRM intake (JSON). Falls back to WhatsApp if the intake isn't configured or fails.
  function sourceOf(s) {
    var m = (s.utm_medium || '').toLowerCase(), src = (s.utm_source || '').toLowerCase(), ref = (s.referrer || '').toLowerCase();
    if (s.gclid || m === 'cpc' || m === 'ppc' || m === 'paid') return 'ads';
    if (s.fbclid || src.indexOf('facebook') > -1 || src.indexOf('instagram') > -1 || src.indexOf('meta') > -1) return m ? 'ads' : 'website';
    if (src.indexOf('linkedin') > -1 || ref.indexOf('linkedin') > -1) return 'linkedin';
    if (m === 'referral' || src === 'referral') return 'referral';
    return 'website';
  }
  document.querySelectorAll('form[data-lead]').forEach(function (form) {
    var status = form.querySelector('.status'), btn = form.querySelector('button[type=submit]');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (form.querySelector('.hp input') && form.querySelector('.hp input').value) return; // bot
      var fd = new FormData(form), data = {};
      fd.forEach(function (v, k) { data[k] = String(v).trim(); });
      if (!data.name || !(data.phone || data.email)) { status.textContent = 'Please add your name and a phone number or email.'; status.className = 'status err'; return; }
      var interest = data.interest ? data.interest + ' — ' : '';
      var parts = [interest + (data.message || ''), data.company ? 'Company: ' + data.company : '', data.website ? 'Website: ' + data.website : '', data.budget ? 'Budget: ' + data.budget : '',
        'Page: ' + location.href, saved.landing ? 'Landed: ' + saved.landing : '', saved.referrer ? 'Referrer: ' + saved.referrer : '', saved.utm_source ? 'UTM: ' + [saved.utm_source, saved.utm_medium, saved.utm_campaign].filter(Boolean).join(' / ') : ''].filter(Boolean);
      var payload = { name: data.name, phone: data.phone || '', email: data.email || '', company: data.company || '', source: sourceOf(saved), campaign: saved.utm_campaign || form.getAttribute('data-lead') || 'website',
        value: data.budget_value || '', message: parts.join('\n') };
      btn.disabled = true; status.textContent = 'Sending…'; status.className = 'status';
      var url = CFG.intake || '';
      var done = function () {
        status.textContent = 'Thank you — we’ll reach out within one working day.'; status.className = 'status ok'; form.reset(); btn.disabled = false;
        try { if (window.gtag) gtag('event', 'generate_lead', { form: form.getAttribute('data-lead') }); } catch (e) {}
        var next = form.getAttribute('data-next'); if (next) location.href = next;
      };
      var fail = function () {
        btn.disabled = false; status.className = 'status err';
        var wa = 'https://wa.me/' + CFG.whatsapp + '?text=' + encodeURIComponent('Hi dotindot, I’m ' + data.name + (data.company ? ' from ' + data.company : '') + '. ' + (data.message || 'I’d like to talk about ' + (data.interest || 'growing my business') + '.'));
        status.innerHTML = 'We couldn’t send that just now. <a href="' + wa + '" target="_blank" rel="noopener">Message us on WhatsApp instead</a> or call ' + CFG.phone + '.';
      };
      if (!url || url.indexOf('PASTE_YOUR') > -1) return fail();
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { return r.ok ? done() : fail(); }).catch(fail);
    });
  });

  // hero dots: a growth curve drawn out of individual dots; pointer nudges them; one run on load.
  var box = document.querySelector('.dots'), cv = box && box.querySelector('canvas');
  if (!cv) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, dark = matchMedia('(prefers-color-scheme: dark)').matches;
  var ctx = cv.getContext('2d'), W, H, dpr = Math.min(2, devicePixelRatio || 1), pts = [], mouse = { x: -1e4, y: -1e4 }, t0 = performance.now(), raf;
  var COLS = 22, ROWS = 22;
  function size() {
    var r = box.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pts = [];
    var cols = W > 400 ? COLS : 16, rows = Math.max(8, Math.round(cols * H / W)), gx = W / cols, gy = H / rows;
    for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
      var x = gx * (i + .5), y = gy * (j + .5), u = i / (cols - 1), v = 1 - j / (rows - 1);
      var curve = Math.pow(u, 1.9) * .82 + .05;               // the growth line
      var below = v <= curve + .02 && v > curve - .06;          // dots on the line
      var under = v < curve - .06;                              // area under it
      pts.push({ x: x, y: y, ox: x, oy: y, on: below, under: under, d: Math.random() * 600 + u * 1400 });
    }
  }
  function draw(now) {
    var el = now - t0; ctx.clearRect(0, 0, W, H);
    var base = dark ? 'rgba(245,241,236,' : 'rgba(29,25,21,';
    for (var k = 0; k < pts.length; k++) {
      var p = pts[k], a = reduce ? 1 : Math.max(0, Math.min(1, (el - p.d) / 500));
      var dx = p.x - mouse.x, dy = p.y - mouse.y, dist = Math.sqrt(dx * dx + dy * dy), push = dist < 90 ? (90 - dist) / 90 : 0;
      var x = p.ox + (push ? dx / dist * push * 14 : 0), y = p.oy + (push ? dy / dist * push * 14 : 0);
      var r = p.on ? 4.2 : p.under ? 2.2 : 1.4;
      ctx.beginPath(); ctx.arc(x, y, r * (reduce ? 1 : .4 + .6 * a), 0, 6.283);
      ctx.fillStyle = p.on ? 'rgba(255,131,31,' + (0.95 * a) + ')' : base + ((p.under ? .34 : .13) * a) + ')';
      ctx.fill();
    }
    if (!reduce && (el < 2600 || mouse.x > -1e3)) raf = requestAnimationFrame(draw); else raf = null;
  }
  size(); draw(t0);
  addEventListener('resize', function () { size(); if (!raf) draw(performance.now()); });
  box.addEventListener('pointermove', function (e) { var r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; if (!raf) raf = requestAnimationFrame(draw); });
  box.addEventListener('pointerleave', function () { mouse.x = mouse.y = -1e4; if (!raf) raf = requestAnimationFrame(draw); });
})();
