/* dotindot.in — one small script, no framework. Smooth scroll (Lenis), header and menus, restrained reveals,
   the world map in the hero, testimonials, clocks, the free tools, and lead forms that post straight into the CRM.
   Everything works as plain HTML without it. */
(function () {
  "use strict";
  var CFG = window.__DD || {};
  var root = document.documentElement;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
  window.__ddReady = true;

  /* ---------------- smooth scroll ---------------- */
  var lenis = null, story = []; // story: functions run on every scroll frame (the home page scroll story)
  if (!reduce && window.Lenis) {
    lenis = new window.Lenis({ lerp: .1, wheelMultiplier: 1, smoothWheel: true });
    (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(performance.now());
  }
  function scrollToEl(el) {
    var y = el.getBoundingClientRect().top + window.scrollY - (el.classList.contains("on") ? 0 : (parseInt(getComputedStyle(root).getPropertyValue("--hdr")) || 76) + 8);
    if (lenis) lenis.scrollTo(y, { duration: 1.1 }); else window.scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
    var id = a.getAttribute("href").slice(1), el = id && document.getElementById(id); if (!el) return;
    e.preventDefault(); closeMenu(); scrollToEl(el);
    if (history.replaceState) history.replaceState(null, "", "#" + id);
  });

  /* ---------------- header ---------------- */
  var hdr = $("[data-hdr]"), lastY = window.scrollY, hidden = false;
  function onScroll() {
    var y = window.scrollY;
    if (hdr) {
      hdr.classList.toggle("scrolled", y > 8);
      var down = y > lastY + 4, up = y < lastY - 4;
      if (down && y > 480 && !hidden && !$(".has-mega.open")) { hdr.classList.add("hide"); hidden = true; }
      else if ((up || y < 120) && hidden) { hdr.classList.remove("hide"); hidden = false; }
    }
    lastY = y;
    steps();
    for (var k = 0; k < story.length; k++) story[k](y);
  }
  addEventListener("scroll", onScroll, { passive: true });

  /* mega menu: CSS opens it on hover/focus; this keeps aria-expanded honest and adds Esc / click-away */
  $$(".has-mega").forEach(function (li) {
    var link = $(".nav-link", li), t = null;
    function set(open) { li.classList.toggle("open", open); li.classList.remove("closed"); link.setAttribute("aria-expanded", open ? "true" : "false"); }
    li.addEventListener("mouseenter", function () { clearTimeout(t); set(true); });
    li.addEventListener("mouseleave", function () { t = setTimeout(function () { set(false); }, 120); });
    li.addEventListener("focusin", function () { set(true); });
    li.addEventListener("focusout", function (e) { if (!li.contains(e.relatedTarget)) set(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && li.classList.contains("open")) { link.focus(); set(false); li.classList.add("closed"); } });
    $$(".mega a", li).forEach(function (a) { a.addEventListener("click", function () { set(false); li.classList.add("closed"); }); });
  });

  /* mobile menu */
  var menu = $("#mnav"), burger = $(".burger"), lastFocus = null;
  function openMenu() {
    if (!menu) return; lastFocus = document.activeElement;
    menu.classList.add("open"); menu.setAttribute("aria-hidden", "false"); burger.setAttribute("aria-expanded", "true");
    root.style.overflow = "hidden"; if (lenis) lenis.stop();
    setTimeout(function () { var f = $(".mnav-close", menu); f && f.focus(); }, 50);
  }
  function closeMenu() {
    if (!menu || !menu.classList.contains("open")) return;
    menu.classList.remove("open"); menu.setAttribute("aria-hidden", "true"); burger.setAttribute("aria-expanded", "false");
    root.style.overflow = ""; if (lenis) lenis.start(); if (lastFocus) lastFocus.focus();
  }
  if (burger) burger.addEventListener("click", openMenu);
  if (menu) {
    $(".mnav-close", menu).addEventListener("click", closeMenu);
    $$("a", menu).forEach(function (a) { a.addEventListener("click", closeMenu); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
  }

  /* ---------------- reveals: only things below the fold, once ---------------- */
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
    var fold = innerHeight * .92;
    $$("[data-reveal]").forEach(function (el) {
      if (el.getBoundingClientRect().top < fold) return;
      var g = el.parentElement && el.parentElement.closest("[data-reveal-group]");
      if (g) el.style.setProperty("--i", Array.prototype.indexOf.call(g.children, el) % 3);
      el.classList.add("pre"); io.observe(el);
    });
  }

  /* ---------------- process line fills as you scroll ---------------- */
  var stepBoxes = $$("[data-steps]");
  function steps() {
    stepBoxes.forEach(function (b) {
      var r = b.getBoundingClientRect(), p = clamp((innerHeight * .85 - r.top) / (r.height + innerHeight * .35), 0, 1);
      b.style.setProperty("--p", reduce ? 1 : p.toFixed(3));
    });
  }
  steps();

  /* ---------------- testimonials ---------------- */
  $$(".quotes[data-n]").forEach(function (box) {
    var items = $$(".quote", box), i = 0, timer = null;
    function show(n) { items[i].classList.remove("on"); i = (n + items.length) % items.length; items[i].classList.add("on"); }
    function auto() { clearInterval(timer); if (!reduce) timer = setInterval(function () { show(i + 1); }, 9000); }
    $(".next", box).addEventListener("click", function () { show(i + 1); auto(); });
    $(".prev", box).addEventListener("click", function () { show(i - 1); auto(); });
    box.addEventListener("mouseenter", function () { clearInterval(timer); });
    box.addEventListener("mouseleave", auto);
    auto();
  });

  /* ---------------- where in the world is the visitor? (time zone only, never sent anywhere) ---------------- */
  var tz = "UTC"; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) {}
  var CUR = (function () {
    if (/Kolkata|Calcutta/.test(tz)) return "INR";
    if (/London|Belfast|Guernsey|Jersey|Isle_of_Man/.test(tz)) return "GBP";
    if (/Dubai|Muscat/.test(tz)) return "AED";
    if (/Singapore/.test(tz)) return "SGD";
    if (/^Australia\//.test(tz)) return "AUD";
    if (/Bangkok/.test(tz)) return "THB";
    if (/Tokyo/.test(tz)) return "JPY";
    if (/Toronto|Vancouver|Edmonton|Winnipeg|Halifax|Regina|St_Johns|Montreal/.test(tz)) return "CAD";
    if (/^Europe\//.test(tz)) return "EUR";
    return "USD";
  })();
  var BUDGETS = {
    USD: ["Under $1,500", "$1,500 – $5,000", "$5,000 – $15,000", "$15,000+"],
    GBP: ["Under £1,200", "£1,200 – £4,000", "£4,000 – £12,000", "£12,000+"],
    EUR: ["Under €1,400", "€1,400 – €4,500", "€4,500 – €14,000", "€14,000+"],
    AED: ["Under AED 5,500", "AED 5,500 – 18,000", "AED 18,000 – 55,000", "AED 55,000+"],
    SGD: ["Under S$2,000", "S$2,000 – 6,500", "S$6,500 – 20,000", "S$20,000+"],
    AUD: ["Under A$2,300", "A$2,300 – 7,500", "A$7,500 – 23,000", "A$23,000+"],
    CAD: ["Under C$2,000", "C$2,000 – 7,000", "C$7,000 – 20,000", "C$20,000+"],
    INR: ["Under ₹1 lakh", "₹1 – 4 lakh", "₹4 – 12 lakh", "₹12 lakh+"],
    THB: ["Under ฿50,000", "฿50,000 – 170,000", "฿170,000 – 500,000", "฿500,000+"],
    JPY: ["Under ¥230,000", "¥230,000 – 750,000", "¥750,000 – 2,300,000", "¥2,300,000+"],
  };
  $$("select[data-budget]").forEach(function (sel) {
    var b = BUDGETS[CUR] || BUDGETS.USD, keep = sel.options[0];
    sel.innerHTML = ""; sel.appendChild(keep);
    b.forEach(function (t) { var o = document.createElement("option"); o.textContent = t + " a month"; o.value = t + " /month"; sel.appendChild(o); });
    var o = document.createElement("option"); o.textContent = "A one-off project"; o.value = "One-off project"; sel.appendChild(o);
  });

  /* ---------------- clocks ---------------- */
  var fmt = {};
  function timeIn(zone) {
    try { fmt[zone] = fmt[zone] || new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: zone }); return fmt[zone].format(new Date()).toLowerCase(); }
    catch (e) { return ""; }
  }
  function hourIn(zone) { try { return +new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: zone }).format(new Date()); } catch (e) { return 12; } }
  function tick() {
    $$("[data-tz]").forEach(function (el) {
      var z = el.getAttribute("data-tz"), b = $(".tm", el) || $("b", el); if (b) b.textContent = timeIn(z);
      var h = hourIn(z); el.classList.toggle("awake", h >= 9 && h < 19);
    });
  }
  if ($("[data-tz]")) { tick(); setInterval(tick, 20000); }

  /* ---------------- hero: the world in dots, arcs out to every market ---------------- */
  var mapBox = $(".hero-map");
  if (mapBox && window.fetch) {
    var cv = $("canvas", mapBox), cx = cv.getContext("2d"), M = null, W = 0, H = 0, K = 1, OX = 0, OY = 0, t0 = 0, visible = true, running = false, base = null, dprS = 1;
    var HUB = "Chennai", MARKETS = ["London", "Amsterdam", "Berlin", "New York", "Toronto", "Dubai", "Singapore", "Bangkok", "Tokyo", "Sydney"];
    // label: [text, side (-1 left / 1 right), vertical offset]; Amsterdam sits between London and Berlin, so it has no label
    var LABEL = { London: ["London", -1, -6], Berlin: ["Berlin", 1, -8], "New York": ["New York", -1, 14], Toronto: ["Toronto", -1, -6], Dubai: ["Dubai", 1, -8],
      Singapore: ["Singapore", 1, 14], Bangkok: ["Bangkok", 1, 4], Tokyo: ["Tokyo", 1, 4], Sydney: ["Sydney", 1, 4], Chennai: ["India (HQ)", -1, 16] };
    var font = getComputedStyle(document.body).fontFamily;
    function size() {
      var r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      W = r.width; H = r.height; dprS = dpr; base = null; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!M) return;
      var pad = W < 600 ? 14 : 24; K = Math.min((W - pad * 2) / M.w, (H - pad * 2) / M.h);
      OX = (W - M.w * K) / 2; OY = (H - M.h * K) / 2;
      if (!running) draw(performance.now());
    }
    function P(name) { var p = M.pins[name]; return [OX + p[0] * K, OY + p[1] * K]; }
    function arc(a, b) { var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, d = Math.hypot(b[0] - a[0], b[1] - a[1]); return [a, [mx, my - d * .32], b]; }
    function q(c, t) { var u = 1 - t; return [u * u * c[0][0] + 2 * u * t * c[1][0] + t * t * c[2][0], u * u * c[0][1] + 2 * u * t * c[1][1] + t * t * c[2][1]]; }
    function draw(now) {
      var t = reduce ? 99 : (now - t0) / 1000;
      cx.clearRect(0, 0, W, H);
      var reveal = clamp(t / 1.4, 0, 1);
      if (reveal >= 1) { // the dotted world never changes once drawn: paint it once, then copy it
        if (!base) { base = document.createElement("canvas"); base.width = cv.width; base.height = cv.height; var bx = base.getContext("2d"); bx.setTransform(dprS, 0, 0, dprS, 0, 0); dotsTo(bx, 1); }
        cx.drawImage(base, 0, 0, W, H);
      } else dotsTo(cx, reveal);
      var hub = P(HUB);
      MARKETS.forEach(function (m, k) {
        var c = arc(hub, P(m)), st = 1.1 + k * .14, prog = clamp((t - st) / 1.2, 0, 1); if (prog <= 0) return;
        prog = ease(prog);
        cx.strokeStyle = "rgba(255,122,26,.75)"; cx.lineWidth = 1.4; cx.beginPath(); cx.moveTo(c[0][0], c[0][1]);
        for (var j = 1; j <= 40; j++) { var pt = q(c, prog * j / 40); cx.lineTo(pt[0], pt[1]); }
        cx.stroke();
        if (prog >= 1 && !reduce) { // a packet travelling the arc
          var ph = ((t - st - 1.2) * .22 + k * .17) % 1, pk = q(c, ph);
          cx.fillStyle = "rgba(255,122,26," + (Math.sin(ph * Math.PI) * .9).toFixed(2) + ")"; cx.beginPath(); cx.arc(pk[0], pk[1], 2.2, 0, 6.283); cx.fill();
        }
      });
      [HUB].concat(MARKETS).forEach(function (m, k) {
        var p = P(m), on = clamp((t - (m === HUB ? .9 : 2 + k * .14)) / .5, 0, 1); if (on <= 0) return;
        if (!reduce) { var pulse = ((t * .6 + k * .3) % 1); cx.strokeStyle = "rgba(255,122,26," + ((1 - pulse) * .35 * on).toFixed(2) + ")"; cx.lineWidth = 1; cx.beginPath(); cx.arc(p[0], p[1], 4 + pulse * 14, 0, 6.283); cx.stroke(); }
        cx.globalAlpha = on; cx.fillStyle = m === HUB ? "#0e1b33" : "#ff7a1a"; cx.beginPath(); cx.arc(p[0], p[1], m === HUB ? 4.6 : 4, 0, 6.283); cx.fill();
        cx.fillStyle = "#fff"; cx.beginPath(); cx.arc(p[0], p[1], 1.5, 0, 6.283); cx.fill();
        var L = LABEL[m];
        if (W > 420 && L) { cx.font = "600 12px " + font; cx.fillStyle = "#26324a"; cx.textAlign = L[1] < 0 ? "right" : "left"; cx.fillText(L[0], p[0] + L[1] * 10, p[1] + L[2]); }
        cx.globalAlpha = 1;
      });
    }
    function dotsTo(c, reveal) {
      var n = M.p.length / 2, r = Math.max(.9, K * .32);
      c.fillStyle = "#c7cdd7";
      for (var i = 0; i < n; i++) {
        var x = M.p[i * 2], y = M.p[i * 2 + 1];
        var s = clamp(reveal * 1.6 - (x / M.w) * .6, 0, 1); if (s <= 0) continue;
        c.globalAlpha = s * .9; c.beginPath(); c.arc(OX + x * K, OY + y * K, r, 0, 6.283); c.fill();
      }
      c.globalAlpha = 1;
    }
    function loop(now) { if (!visible || document.hidden) { running = false; return; } draw(now); requestAnimationFrame(loop); }
    function start() { if (!running && M && !reduce) { running = true; requestAnimationFrame(loop); } }
    var go = function () {
      fetch(mapBox.getAttribute("data-map")).then(function (r) { return r.json(); }).then(function (m) {
        M = m; size(); t0 = performance.now(); if (reduce) draw(0); else start();
      }).catch(function () {});
    };
    // after the page has loaded, so the map never competes with the first paint
    if (document.readyState === "complete") setTimeout(go, 150); else addEventListener("load", function () { setTimeout(go, 150); });
    addEventListener("resize", size);
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) start(); }).observe(mapBox);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) start(); });
    size();
  }

  /* ================= the scroll story (home) =================
     1. the hero's last full stop swells until the screen is orange,
     2. the statement lights up word by word, then its own full stop grows into white: a dot in a dot,
     3. the services reel: one field of dots reshapes itself into a picture of each service as you scroll. */
  var fine = matchMedia("(hover: hover) and (pointer: fine)").matches, VH = innerHeight, onOrange = false;
  var fsDot = $(".h-hero [data-fs]"), stmt = $("[data-statement]");
  if (fsDot && stmt && !reduce) {
    var veil = document.createElement("div"); veil.className = "fs-veil"; veil.setAttribute("aria-hidden", "true"); document.body.appendChild(veil);
    stmt.classList.add("on");
    var words = $$(".w", stmt), endDot = $("[data-st-end]", stmt), white = $(".st-white", stmt), stage = $(".st-stage", stmt), lit = -1;
    var circle = function (el, r, x, y) { el.style.clipPath = "circle(" + r.toFixed(1) + "px at " + x.toFixed(1) + "px " + y.toFixed(1) + "px)"; };
    story.push(function (y) {
      var st = stmt.getBoundingClientRect(), stTop = st.top + y;
      // 1. the full stop: fills the screen within ~60% of a screen of scrolling; the statement then rises over it
      var p = clamp(y / Math.max(1, Math.min(stTop, VH * .6)), 0, 1);
      if (p <= 0 || st.top <= 0) { if (veil.style.visibility !== "hidden") veil.style.visibility = "hidden"; onOrange = st.top <= 0 && st.bottom > VH * .5; }
      else {
        var d = fsDot.getBoundingClientRect(), cx = d.left + d.width / 2, cy = d.top + d.height / 2, r0 = d.width / 2;
        var R = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, VH - cy)) + 4;
        veil.style.visibility = "visible"; circle(veil, r0 + (R - r0) * Math.pow(p, 1.7), cx, cy); onOrange = p > .5;
      }
      // 2. word by word, then the white dot
      var total = st.height - VH; if (total <= 0) return;
      if (st.top < VH * 1.05 && !stmt.classList.contains("armed")) stmt.classList.add("armed"); // dim the words just before they're seen
      var q = clamp(-st.top / total, 0, 1), n = Math.round(clamp(q / .6, 0, 1) * words.length);
      if (n !== lit) { lit = n; for (var k = 0; k < words.length; k++) words[k].classList.toggle("lit", k < n); }
      var g = clamp((q - .68) / .3, 0, 1);
      if (g <= 0) { if (white.style.visibility !== "hidden") white.style.visibility = "hidden"; return; }
      var e = endDot.getBoundingClientRect(), s0 = stage.getBoundingClientRect(), ex = e.left + e.width / 2 - s0.left, ey = e.top + e.height / 2 - s0.top, w0 = e.width / 2;
      var RW = Math.hypot(Math.max(ex, s0.width - ex), Math.max(ey, s0.height - ey)) + 4;
      white.style.visibility = "visible"; circle(white, w0 + (RW - w0) * g * g, ex, ey);
      if (g > .5) onOrange = false;
    });
  }

  var reelEl = $("[data-reel]"), rc = reelEl && $(".reel-art canvas", reelEl);
  if (reelEl && rc && rc.getContext && !reduce) {
    reelEl.classList.add("on");
    var items = $$(".reel-item", reelEl), idx = $$(".reel-index button", reelEl), art = $(".reel-art", reelEl), rx = rc.getContext("2d");
    var kinds = items.map(function (it) { return it.getAttribute("data-art"); });
    var INK = "#0e1b33", OR = "#ff7a1a", LT = "#c9cfd9", COL = [LT, INK, OR], GRID = 30;
    var SH = {}, N = 0, DL, SW, scatter, AW = 0, gridC = null, curI = -1, inView = false, rafOn = false;
    var ptr = { x: 0, y: 0, tx: 0, ty: 0, s: 0, on: false };
    var seed = 7; var rnd = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    var rrect = function (g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    var disc = function (g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); };
    // each service as a simple picture on a 300 × 300 canvas; it is read back as a 30 × 30 grid of dots
    var PICT = {
      perf: function (g) { // results climbing
        g.fillStyle = INK; [56, 88, 118, 150, 186, 222].forEach(function (h, k) { g.fillRect(30 + k * 42, 266 - h, 28, h); });
        g.strokeStyle = OR; g.lineWidth = 20; g.lineCap = g.lineJoin = "round"; g.beginPath(); g.moveTo(34, 168); g.lineTo(104, 116); g.lineTo(156, 138); g.lineTo(242, 56); g.stroke();
        g.fillStyle = OR; g.beginPath(); g.moveTo(276, 22); g.lineTo(206, 40); g.lineTo(258, 92); g.closePath(); g.fill();
      },
      social: function (g) { // a conversation
        g.fillStyle = INK; rrect(g, 24, 46, 252, 176, 52); g.fill();
        g.beginPath(); g.moveTo(66, 200); g.lineTo(44, 276); g.lineTo(132, 214); g.closePath(); g.fill();
        g.fillStyle = OR; disc(g, 96, 134, 21); disc(g, 150, 134, 21); disc(g, 204, 134, 21);
      },
      seo: function (g) { // search, with AI inside
        g.strokeStyle = INK; g.lineWidth = 28; g.beginPath(); g.arc(126, 126, 84, 0, 6.2832); g.stroke();
        g.lineCap = "round"; g.lineWidth = 38; g.beginPath(); g.moveTo(192, 192); g.lineTo(262, 262); g.stroke();
        g.fillStyle = OR; g.beginPath(); g.moveTo(126, 72); g.quadraticCurveTo(132, 120, 180, 126); g.quadraticCurveTo(132, 132, 126, 180); g.quadraticCurveTo(120, 132, 72, 126); g.quadraticCurveTo(120, 120, 126, 72); g.fill();
      },
      web: function (g) { // a site in a browser
        g.strokeStyle = INK; g.lineWidth = 18; rrect(g, 24, 44, 252, 216, 20); g.stroke();
        g.fillStyle = INK; g.fillRect(24, 44, 252, 46);
        g.fillStyle = OR; disc(g, 56, 67, 11); disc(g, 88, 67, 11); disc(g, 120, 67, 11);
        g.fillStyle = LT; g.fillRect(56, 116, 188, 54); g.fillRect(56, 192, 84, 40); g.fillRect(160, 192, 84, 40);
      },
      brand: function (g) { // brand and film
        g.strokeStyle = INK; g.lineWidth = 28; g.beginPath(); g.arc(150, 150, 118, 0, 6.2832); g.stroke();
        g.fillStyle = OR; g.beginPath(); g.moveTo(116, 86); g.lineTo(116, 214); g.lineTo(222, 150); g.closePath(); g.fill();
      },
      ai: function (g) { // agents, connected
        var nodes = []; for (var k = 0; k < 6; k++) { var a = -Math.PI / 2 + k * Math.PI / 3; nodes.push([150 + Math.cos(a) * 110, 150 + Math.sin(a) * 110]); }
        g.lineWidth = 10; g.strokeStyle = LT; g.beginPath(); nodes.forEach(function (p, k) { var q2 = nodes[(k + 1) % 6]; g.moveTo(p[0], p[1]); g.lineTo(q2[0], q2[1]); }); g.stroke();
        g.strokeStyle = INK; g.beginPath(); nodes.forEach(function (p) { g.moveTo(150, 150); g.lineTo(p[0], p[1]); }); g.stroke();
        g.fillStyle = INK; nodes.forEach(function (p) { disc(g, p[0], p[1], 25); });
        g.fillStyle = OR; disc(g, 150, 150, 38);
      }
    };
    var byAngle = function (a, b) { return Math.atan2(a[1] - .5, a[0] - .5) - Math.atan2(b[1] - .5, b[0] - .5); };
    function sample(kind) {
      var c = document.createElement("canvas"); c.width = c.height = 300; var g = c.getContext("2d"); (PICT[kind] || PICT.perf)(g);
      var d = g.getImageData(0, 0, 300, 300).data, pts = [], step = 300 / GRID;
      for (var yy = 0; yy < GRID; yy++) for (var xx = 0; xx < GRID; xx++) {
        var o = (Math.floor((yy + .5) * step) * 300 + Math.floor((xx + .5) * step)) * 4; if (d[o + 3] < 140) continue;
        var cl = d[o] > 200 && d[o + 1] < 175 && d[o + 2] < 110 ? 2 : d[o] > 150 ? 0 : 1;
        pts.push([(xx + .5) / GRID, (yy + .5) / GRID, cl]);
      }
      return pts.sort(byAngle);
    }
    function pack(pts) { // spread over N slots in angle order; smaller pictures repeat dots, which split apart as they move
      var out = new Float32Array(N * 3), m = pts.length;
      for (var j = 0; j < N; j++) { var p = pts[Math.floor(j * m / N)]; out[j * 3] = p[0]; out[j * 3 + 1] = p[1]; out[j * 3 + 2] = p[2]; }
      return out;
    }
    var ready = false;
    function footNote() { // once we can reach them, no need to ask for a number again
      var cc = panel && $(".cc", panel); if (st.lead && cc) cc.parentNode.innerHTML = 'A specialist will reply within one working day · <a href="' + CH.privacy + '">Privacy</a>';
    }
    function build() {
      if (ready) return; ready = true;
      var raw = {}; kinds.forEach(function (k) { if (!raw[k]) { raw[k] = sample(k); N = Math.max(N, raw[k].length); } });
      Object.keys(raw).forEach(function (k) { SH[k] = pack(raw[k]); });
      var cloud = []; for (var j0 = 0; j0 < N; j0++) { var a0 = rnd() * 6.2832, d0 = Math.sqrt(rnd()) * .47; cloud.push([.5 + Math.cos(a0) * d0, .5 + Math.sin(a0) * d0, 0]); }
      scatter = pack(cloud.sort(byAngle));
      DL = new Float32Array(N); SW = new Float32Array(N);
      for (var j1 = 0; j1 < N; j1++) { DL[j1] = rnd() * .35; SW[j1] = (rnd() - .5) * .5; }
      rsize();
    }

    function rsize() {
      var r = art.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); AW = r.width; if (!AW) return;
      rc.width = rc.height = Math.round(AW * dpr); rx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gridC = document.createElement("canvas"); gridC.width = gridC.height = rc.width; var gx = gridC.getContext("2d"); gx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gx.fillStyle = "#e3e6ec"; var cell = AW / GRID;
      for (var a = 0; a < GRID; a++) for (var b = 0; b < GRID; b++) { gx.beginPath(); gx.arc((a + .5) * cell, (b + .5) * cell, Math.max(.7, cell * .06), 0, 6.2832); gx.fill(); }
    }
    function setCur(i) {
      curI = i;
      items.forEach(function (it, k) { it.classList.toggle("cur", k === i); });
      idx.forEach(function (b, k) { b.classList.toggle("cur", k === i); });
    }
    function draw(A, B, mt, now) {
      rx.clearRect(0, 0, AW, AW); if (gridC) rx.drawImage(gridC, 0, 0, AW, AW);
      var cell = AW / GRID, rad = cell * .36, ts = now / 1000, PR = cell * 4.5, PR2 = PR * PR;
      ptr.s += ((ptr.on ? 1 : 0) - ptr.s) * .1; ptr.x += (ptr.tx - ptr.x) * .25; ptr.y += (ptr.ty - ptr.y) * .25;
      for (var c = 0; c < 3; c++) {
        rx.fillStyle = COL[c]; rx.beginPath();
        for (var j = 0; j < N; j++) {
          var t = clamp((mt - DL[j]) / .65, 0, 1); t = t * t * (3 - 2 * t);
          if ((t < .5 ? A[j * 3 + 2] : B[j * 3 + 2]) !== c) continue;
          var ax = A[j * 3], ay = A[j * 3 + 1], dx = B[j * 3] - ax, dy = B[j * 3 + 1] - ay, sw = Math.sin(t * Math.PI) * SW[j];
          var x = (ax + dx * t - dy * sw) * AW, y = (ay + dy * t + dx * sw) * AW;
          if (ptr.s > .01) { var px = x - ptr.x, py = y - ptr.y, d2 = px * px + py * py; if (d2 < PR2) { var dd = Math.sqrt(d2) || 1, f = 1 - dd / PR; f = f * f * ptr.s * cell * 1.8; x += px / dd * f; y += py / dd * f; } }
          var rr = rad * (.84 + .16 * Math.sin(ts * 1.7 + j * .73));
          rx.moveTo(x + rr, y); rx.arc(x, y, rr, 0, 6.2832);
        }
        rx.fill();
      }
    }
    function frame(now) {
      if (!inView || document.hidden) { rafOn = false; return; }
      var r = reelEl.getBoundingClientRect(), total = r.height - VH, n = items.length;
      var p = clamp(-r.top / Math.max(1, total), 0, 1), seg = Math.min(p * n, n - 1e-4), i = Math.floor(seg), local = seg - i, A, B, mt;
      if (i !== curI) setCur(i);
      if (i === 0) { A = scatter; B = SH[kinds[0]]; mt = ease(clamp(((VH - r.top) / VH - .2) / .8, 0, 1)); }
      else { A = SH[kinds[i - 1]]; B = SH[kinds[i]]; mt = clamp(local / .45, 0, 1); }
      for (var k = 0; k < idx.length; k++) idx[k].style.setProperty("--f", k < i ? 1 : k > i ? 0 : local.toFixed(3));
      draw(A, B, mt, now);
      requestAnimationFrame(frame);
    }
    function kick() { if (!rafOn && inView) { build(); rafOn = true; requestAnimationFrame(frame); } }
    function jump(i) { // to the point where service i is fully formed
      var top = reelEl.getBoundingClientRect().top + scrollY, total = reelEl.offsetHeight - VH, y = top + (i + .5) / items.length * total;
      if (lenis) lenis.scrollTo(y, { duration: 1.2 }); else scrollTo({ top: y });
    }
    idx.forEach(function (b, k) { b.addEventListener("click", function () { jump(k); }); });
    items.forEach(function (it, k) { it.addEventListener("focusin", function () { if (curI !== k) jump(k); }); });
    if (fine) {
      art.addEventListener("pointermove", function (e) { var r = art.getBoundingClientRect(); ptr.tx = e.clientX - r.left; ptr.ty = e.clientY - r.top; if (!ptr.on) { ptr.x = ptr.tx; ptr.y = ptr.ty; } ptr.on = true; });
      art.addEventListener("pointerleave", function () { ptr.on = false; });
    }
    setCur(0);
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { inView = es[0].isIntersecting; kick(); }, { rootMargin: "60% 0px" }).observe(reelEl);
    else { inView = true; kick(); }
    document.addEventListener("visibilitychange", kick);
    addEventListener("resize", function () { if (ready) rsize(); });
  }
  // Dot steps aside while the services reel fills a phone screen, and turns ink on orange so it stays visible
  if (reelEl || stmt) story.push(function () {
    var fb = document.querySelector(".dot-fab"); if (!fb) return;
    fb.classList.toggle("on-orange", onOrange);
    var narrow = innerWidth < 900, away = narrow && scrollY < 140; // on phones it waits until the hero's buttons have scrolled up
    if (reelEl && reelEl.classList.contains("on")) { var r = reelEl.getBoundingClientRect(); away = away || (narrow && r.top < VH * .5 && r.bottom > VH * .5); }
    fb.classList.toggle("away", away);
  });
  addEventListener("resize", function () { VH = innerHeight; onScroll(); });
  if (story.length) onScroll();

  /* ---------------- a dot that follows the mouse ---------------- */
  if (fine && !reduce) {
    var dot = document.createElement("div"); dot.className = "cursor"; dot.setAttribute("aria-hidden", "true"); document.body.appendChild(dot);
    var mx = 0, my = 0, fx = 0, fy = 0, following = false;
    var follow = function () {
      fx += (mx - fx) * .2; fy += (my - fy) * .2;
      dot.style.transform = "translate3d(" + fx.toFixed(1) + "px," + fy.toFixed(1) + "px,0)";
      if (Math.abs(mx - fx) + Math.abs(my - fy) > .4) requestAnimationFrame(follow); else following = false;
    };
    addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      mx = e.clientX; my = e.clientY;
      if (!dot.classList.contains("on")) { fx = mx; fy = my; dot.classList.add("on"); }
      var t = e.target.closest ? e.target : null;
      dot.classList.toggle("big", !!(t && t.closest("a,button,summary,label,select,input,textarea")) && !(t && t.closest(".reel-art")));
      dot.classList.toggle("ink", onOrange || !!(t && t.closest(".statement")));
      if (!following) { following = true; requestAnimationFrame(follow); }
    }, { passive: true });
    root.addEventListener("mouseleave", function () { dot.classList.remove("on"); });
    addEventListener("scroll", function () { dot.classList.toggle("ink", onOrange); }, { passive: true });
  }

  /* ---------------- page to page: remember where the click was, so the next page opens out of it ---------------- */
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || a.origin !== location.origin || a.hash && a.pathname === location.pathname) return;
    var x = e.clientX, y = e.clientY;
    if (!e.detail) { var r = a.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
    try { sessionStorage.setItem("dd_vt", JSON.stringify([Math.round(x), Math.round(y)])); } catch (er) {}
  }, true);

  /* ---------------- marketing health check ---------------- */
  $$(".quiz").forEach(function (qz) {
    var data; try { data = JSON.parse($(".qz-data", qz).textContent); } catch (e) { return; }
    var body = $(".qz-body", qz), bar = $(".qz-bar i", qz), count = $(".qz-count", qz), ans = [], id = qz.getAttribute("data-quiz");
    var escq = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); };
    function show(i) {
      bar.style.width = (i / data.length * 100) + "%"; count.textContent = (i + 1) + " of " + data.length;
      body.innerHTML = '<div class="qz-step"><p class="qz-q">' + escq(data[i].q) + '</p><div class="qz-opts">' + data[i].a.map(function (a, k) { return '<button type="button" data-k="' + k + '">' + escq(a[0]) + "</button>"; }).join("") + "</div></div>";
      $$("button", body).forEach(function (b) {
        b.addEventListener("click", function () {
          var k = +b.getAttribute("data-k");
          ans[i] = { q: data[i].q, a: data[i].a[k][0], p: data[i].a[k][1], fix: data[i].fix };
          b.classList.add("picked");
          setTimeout(function () { i + 1 < data.length ? show(i + 1) : result(); }, 320);
        });
      });
      if (i > 0) { var f = $("button", body); f && f.focus({ preventScroll: true }); }
    }
    function result() {
      bar.style.width = "100%"; count.textContent = "Complete";
      var sum = ans.reduce(function (a, x) { return a + x.p; }, 0), score = Math.round(sum / (data.length * 3) * 100);
      var verdict = score >= 80 ? "Strong foundations. The gains are in the details." : score >= 50 ? "Solid, with clear room to grow." : "Real upside. The first fixes are usually the fastest.";
      var fixes = ans.filter(function (x) { return x.p < 3; }).sort(function (a, b) { return a.p - b.p; }).slice(0, 3);
      var col = score >= 80 ? "#16a34a" : score >= 50 ? "#ff7a1a" : "#dc2626", C2 = 2 * Math.PI * 52;
      body.innerHTML = '<div class="qz-step qz-result"><div class="qz-gauge"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" fill="none" stroke="#eceef2" stroke-width="10"/><circle class="arc" cx="60" cy="60" r="52" fill="none" stroke="' + col + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="0 ' + C2 + '"/></svg><b>0</b><small>out of 100</small></div>' +
        '<div><p class="qz-verdict">' + verdict + "</p>" + (fixes.length ? '<p class="muted">The changes that would make the biggest difference:</p><ol class="qz-fixes">' + fixes.map(function (x) { return "<li>" + escq(x.fix) + "</li>"; }).join("") + "</ol>" : '<p class="muted" style="margin-bottom:20px">Nothing obvious to fix. Want a second opinion anyway?</p>') +
        '<form class="inline-form" data-lead="health-check-' + id + '" data-mini novalidate><label class="sr" for="qz-mail-' + id + '">Your email</label><input id="qz-mail-' + id + '" name="contact" type="email" inputmode="email" autocomplete="email" placeholder="you@company.com"><input type="hidden" name="interest" value="Marketing health check: ' + score + '/100"><input type="hidden" name="answers" value="' + escq(ans.map(function (x) { return x.q + " → " + x.a; }).join(" | ")) + '"><button class="btn" type="submit">Send me the full plan</button><p class="status" role="status" aria-live="polite"></p></form>' +
        '<p class="fine" style="margin-top:14px"><button type="button" class="qz-again">Start again</button></p></div></div>';
      var arcEl = $(".arc", body), num = $(".qz-gauge b", body), t1 = performance.now();
      (function count2(now) { var k = Math.min(1, (now - t1) / 1200), e = ease(k); num.textContent = Math.round(score * e); arcEl.setAttribute("stroke-dasharray", (C2 * score / 100 * e).toFixed(1) + " " + C2); if (k < 1) requestAnimationFrame(count2); })(t1);
      $(".qz-again", body).addEventListener("click", function () { ans = []; show(0); });
    }
    show(0);
  });

  /* ---------------- website speed test (Google PageSpeed Insights) ---------------- */
  var LOADING = ["Requesting a test from Google…", "Loading your site on a mid-range phone…", "Measuring how long the main content takes to appear…", "Checking layout stability…", "Reviewing the SEO basics…", "Almost done…"];
  $$("[data-speed]").forEach(function (box) {
    var form = $(".sp-form", box), out = $(".sp-out", box);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var raw = form.elements.url.value.trim(); if (!raw) { form.elements.url.focus(); return; }
      var url = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
      try { url = new URL(url).href; } catch (er) { out.innerHTML = '<p class="sp-load">That doesn\'t look like a web address. Try something like yourbrand.com</p>'; return; }
      var btn = $("button", form); btn.disabled = true;
      var li = 0; out.innerHTML = '<p class="sp-load"><i></i><span>' + LOADING[0] + "</span></p>";
      var tickL = setInterval(function () { li = (li + 1) % LOADING.length; var sp = $(".sp-load span", out); if (sp) sp.textContent = LOADING[li]; }, 3200);
      var api = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?strategy=mobile&category=performance&category=accessibility&category=best-practices&category=seo&url=" + encodeURIComponent(url) + (CFG.psiKey ? "&key=" + encodeURIComponent(CFG.psiKey) : "");
      var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { ctl && ctl.abort(); }, 70000);
      var finish = function () { clearInterval(tickL); clearTimeout(to); btn.disabled = false; };
      var capture = function (label, extra) {
        return '<form class="inline-form" data-lead="speed-test" data-mini novalidate style="margin-top:20px"><label class="sr" for="sp-mail">Your email</label><input id="sp-mail" name="contact" type="email" inputmode="email" autocomplete="email" placeholder="you@company.com"><input type="hidden" name="interest" value="Website speed fixes"><input type="hidden" name="website" value="' + url.replace(/"/g, "&quot;") + '">' + (extra || "") + '<button class="btn" type="submit">' + label + '</button><p class="status" role="status" aria-live="polite"></p></form>';
      };
      fetch(api, ctl ? { signal: ctl.signal } : {}).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
        finish();
        var L = j.lighthouseResult, c = L.categories, au = L.audits;
        var cats = [["performance", "Performance"], ["seo", "SEO"], ["accessibility", "Accessibility"], ["best-practices", "Best practices"]];
        var sc = cats.map(function (x) { return [x[1], Math.round((c[x[0]] && c[x[0]].score || 0) * 100)]; });
        var perf = sc[0][1], R = 2 * Math.PI * 52;
        var met = [["largest-contentful-paint", "Largest paint"], ["cumulative-layout-shift", "Layout shift"], ["total-blocking-time", "Blocking time"], ["speed-index", "Speed index"]].map(function (x) { return au[x[0]] ? "<span>" + x[1] + ": <b>" + au[x[0]].displayValue + "</b></span>" : ""; }).join("");
        out.innerHTML = '<div class="sp-scores">' + sc.map(function (x) { var col = x[1] >= 90 ? "#16a34a" : x[1] >= 50 ? "#ff7a1a" : "#dc2626"; return '<div class="sp-score"><div class="sp-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" fill="none" stroke="#eceef2" stroke-width="9"/><circle class="arc" cx="60" cy="60" r="52" fill="none" stroke="' + col + '" stroke-width="9" stroke-linecap="round" stroke-dasharray="0 ' + R + '" data-v="' + x[1] + '"/></svg><b>' + x[1] + "</b></div><span>" + x[0] + "</span></div>"; }).join("") + "</div>" +
          '<div class="sp-metrics">' + met + "</div>" +
          '<p class="sp-verdict">' + (perf >= 90 ? "Fast. Want to make sure the rest of your marketing performs as well?" : perf >= 50 ? "Room to improve. Sites at this score usually lose enquiries before the page finishes loading." : "Slow. Visitors are leaving before the page loads, and it's very fixable.") + "</p>" +
          capture("Send me the fix list", '<input type="hidden" name="scores" value="' + sc.map(function (x) { return x[0] + " " + x[1]; }).join(", ") + '">');
        requestAnimationFrame(function () { $$(".arc", out).forEach(function (a) { a.style.transition = "stroke-dasharray 1.4s cubic-bezier(.22,1,.36,1)"; a.setAttribute("stroke-dasharray", (R * a.getAttribute("data-v") / 100).toFixed(1) + " " + R); }); });
      }).catch(function () {
        finish();
        out.innerHTML = '<p class="sp-verdict">Google\'s test is busy right now. Leave your email and we\'ll run it for you and send the results, with the fixes.</p>' + capture("Send me the results");
      });
    });
  });

  /* ---------------- AI automation: the example conversation plays once it's in view ---------------- */
  $$("[data-demo]").forEach(function (fig) {
    if (reduce || !("IntersectionObserver" in window)) return;
    var items = $$(".b, .ph-crm", fig), chat = $(".ph-chat", fig), again = $(".ph-replay", fig), timers = [];
    var dots = function (on) {
      var t = $(".ph-typing", chat); if (t) t.remove();
      if (on) { t = document.createElement("div"); t.className = "ph-typing"; t.innerHTML = "<i></i><i></i><i></i>"; chat.appendChild(t); }
    };
    var reset = function () { timers.forEach(clearTimeout); timers = []; dots(false); items.forEach(function (b) { b.classList.add("wait"); b.classList.remove("show"); }); };
    var play = function () {
      reset(); var at = 500;
      items.forEach(function (b) {
        var ai = b.classList.contains("out");
        if (ai) { timers.push(setTimeout(function () { dots(true); }, at)); at += 1300; }
        timers.push(setTimeout(function () { dots(false); b.classList.remove("wait"); b.classList.add("show"); }, at));
        at += ai ? 1500 : 1200;
      });
      timers.push(setTimeout(function () { again.hidden = false; }, at));
    };
    fig.classList.add("armed"); reset();
    new IntersectionObserver(function (es, o) { if (es[0].isIntersecting) { o.disconnect(); play(); } }, { threshold: .4 }).observe(fig);
    again.addEventListener("click", function () { again.hidden = true; play(); });
  });

  /* ---------------- Dot, the chat assistant ----------------
     The logo's D, with its hole as an eye that follows the pointer and blinks. It answers questions through
     /api/chat (the app: AI when connected, a short guided conversation otherwise) and hands the visitor to a
     specialist as a lead. If the app can't be reached it carries on as a guided form and sends the lead the same
     way the contact forms do. The conversation survives page changes for the rest of the visit. */
  var CH = CFG.chat;
  if (CH && window.fetch) {
    var CK = "dd_chat", st0 = function () { return { sid: "", msgs: [], chips: [], card: false, local: false, at: 0, lead: false, slots: {} }; }, st = st0();
    try { var saved = JSON.parse(sessionStorage.getItem(CK) || "null"); if (saved) st = Object.assign(st, saved); } catch (e) {}
    var keep = function () { st.at = Date.now(); try { sessionStorage.setItem(CK, JSON.stringify(Object.assign({}, st, { msgs: st.msgs.slice(-40) }))); } catch (e) {} };
    var bot = CH.name || "Dot", LINKS = CH.links || {};
    var greet = CH.greeting || "Ask me anything about marketing, websites or AI automation, or tell me what you're working on. I reply in seconds.";
    var face = function (cls) {
      return '<svg class="dface ' + (cls || "") + '" viewBox="0 0 140 179" aria-hidden="true"><path class="d-body" d="M0 0H50.5A89.5 89.5 0 0 1 50.5 179H0Z"/>' +
        '<g class="d-eye"><circle class="d-white" cx="52.5" cy="89.5" r="36"/><g class="d-look"><circle class="d-pupil" cx="52.5" cy="89.5" r="15.5"/><circle class="d-glint" cx="58.5" cy="83" r="4.6"/></g>' +
        '<path class="d-smile" d="M33 95 Q52.5 70 72 95"/></g></svg>';
    };
    var ICON = {
      leads: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>',
      web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/></svg>',
      seo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
      ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7z"/></svg>',
      go: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
      reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
      x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
    };
    var STARTERS = [["leads", "Get more leads", "Ads that pay for themselves", "I want more leads from ads"], ["web", "Build a website", "Fast sites that convert", "We need a new website"],
      ["seo", "Rank on Google & AI", "SEO and AI search", "How do we rank on Google and in AI assistants?"], ["ai", "Automate with AI", "Chat, follow-up, reports", "Can you automate our lead follow-up with AI?"]];
    var fab, hint, panel, log, chipBox, ta, sendBtn, busy = false;
    var escH = function (t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };

    /* --- the eye: looks at the pointer (or at what's happening), blinks now and then --- */
    var look = { x: innerWidth / 2, y: innerHeight / 2, pinned: null };
    var aim = function () {
      var faces = document.querySelectorAll(".dface");
      for (var k = 0; k < faces.length; k++) {
        var f = faces[k], r = f.getBoundingClientRect(); if (!r.width) continue;
        var ex = r.left + r.width * .375, ey = r.top + r.height * .5, tx = look.pinned ? look.pinned[0] : look.x, ty = look.pinned ? look.pinned[1] : look.y;
        var dx = tx - ex, dy = ty - ey, d = Math.hypot(dx, dy) || 1, m = Math.min(12, d / 18);
        var g = f.querySelector(".d-look"); if (g) g.style.transform = "translate(" + (dx / d * m).toFixed(1) + "px," + (dy / d * m).toFixed(1) + "px)";
      }
    };
    var aimSoon = (function () { var q = false; return function () { if (!q) { q = true; requestAnimationFrame(function () { q = false; aim(); }); } }; })();
    if (!reduce) {
      addEventListener("pointermove", function (e) { look.x = e.clientX; look.y = e.clientY; aimSoon(); }, { passive: true });
      addEventListener("scroll", aimSoon, { passive: true });
      (function blink() {
        setTimeout(function () {
          var faces = document.querySelectorAll(".dface"); for (var k = 0; k < faces.length; k++) faces[k].classList.add("blink");
          setTimeout(function () { for (var k = 0; k < faces.length; k++) faces[k].classList.remove("blink"); blink(); }, 150);
        }, 2600 + Math.random() * 3800);
      })();
    }
    var mood = function (cls, ms) { var a = panel && $(".chat-av .dface", panel); if (a) { a.classList.add(cls); if (ms) setTimeout(function () { a.classList.remove(cls); }, ms); } };

    /* --- messages --- */
    var linkFor = function (u) {
      try { var url = new URL(u, location.href), path = url.pathname.replace(/index\.html$/, ""); if (LINKS[path] && (url.host === location.host || /dotindot\.in$/.test(url.host))) return LINKS[path]; } catch (e) {}
      return null;
    };
    function render(text) { // internal links become buttons under the message; others stay inline
      var cards = [];
      var html = escH(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, function (u) {
        var L = linkFor(u.replace(/&amp;/g, "&"));
        if (L) { if (!cards.some(function (c) { return c[1] === L[1]; })) cards.push(L); return ""; }
        return '<a href="' + u + '" target="_blank" rel="noopener">' + u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") + "</a>";
      }).replace(/\s+([.,!?])/g, "$1").replace(/:\s*$/, ".").replace(/\n/g, "<br>").trim();
      return { html: html, cards: cards };
    }
    function addCards(cards) {
      if (!cards.length) return;
      var w = document.createElement("div"); w.className = "chat-links";
      w.innerHTML = cards.map(function (c) { return '<a href="' + c[1] + '"><span>' + escH(c[0]) + "</span>" + ICON.go + "</a>"; }).join("");
      log.appendChild(w);
    }
    function addMsg(role, text, opts) {
      opts = opts || {};
      var el = document.createElement("div"); el.className = "msg " + role;
      if (opts.instant) el.style.animation = "none";
      log.appendChild(el);
      if (role === "me") { el.innerHTML = escH(text).replace(/\n/g, "<br>"); }
      else if (role === "ok") { el.textContent = text; }
      else {
        var R = render(text);
        if (opts.instant || reduce) { el.innerHTML = R.html; addCards(R.cards); }
        else { // word by word, like it's being written
          var words = R.html.split(/(\s+)/), n = 0, step = Math.max(12, Math.min(38, 1100 / Math.max(1, words.length)));
          (function tick() { n += 2; el.innerHTML = words.slice(0, n).join(""); log.scrollTop = log.scrollHeight; if (n < words.length) setTimeout(tick, step); else { el.innerHTML = R.html; addCards(R.cards); log.scrollTop = log.scrollHeight; } })();
        }
      }
      log.scrollTop = log.scrollHeight; return el;
    }
    function setChips(list) {
      chipBox.innerHTML = ""; st.chips = list || [];
      (list || []).forEach(function (c, k) {
        var b = document.createElement("button"); b.type = "button"; b.textContent = c; b.style.animationDelay = (k * 70) + "ms";
        b.addEventListener("click", function () { send(c); }); chipBox.appendChild(b);
      });
    }
    function typing(on) {
      var t = $(".typing", log); if (t) t.remove();
      mood("think"); if (!on) { var a = panel && $(".chat-av .dface", panel); if (a) a.classList.remove("think"); }
      if (on) { t = document.createElement("div"); t.className = "typing"; t.setAttribute("aria-label", bot + " is typing"); t.innerHTML = face("think") + "<i></i><i></i><i></i>"; log.appendChild(t); log.scrollTop = log.scrollHeight; }
    }
    function burst(el) { // a little shower of dots when someone leaves their details
      if (reduce) return;
      var b = document.createElement("span"); b.className = "burst";
      for (var k = 0; k < 18; k++) {
        var a = Math.random() * 6.283, d = 40 + Math.random() * 90, i = document.createElement("i");
        i.style.cssText = "--x:" + (Math.cos(a) * d).toFixed(0) + "px;--y:" + (Math.sin(a) * d - 20).toFixed(0) + "px;--s:" + (5 + Math.random() * 7).toFixed(0) + "px;--c:" + (k % 3 ? "#ff831f" : "#0e1b33") + ";animation-delay:" + (Math.random() * 80).toFixed(0) + "ms";
        b.appendChild(i);
      }
      el.appendChild(b); setTimeout(function () { b.remove(); }, 1200);
    }
    function card() {
      if ($(".chat-card", log)) return;
      var f = document.createElement("form"); f.className = "chat-card"; f.noValidate = true;
      f.innerHTML = '<p>Leave your details and a specialist will reply within one working day.</p><label class="sr" for="cc-n">Your name</label><input id="cc-n" name="n" autocomplete="name" placeholder="Your name"><label class="sr" for="cc-v">Email or WhatsApp number</label><input id="cc-v" name="v" autocomplete="email" placeholder="Email or WhatsApp number"><span class="err" role="alert"></span><div class="row"><button class="btn sm" type="submit">Send</button><button class="btn sm ghost" type="button">Not now</button></div>';
      log.appendChild(f); log.scrollTop = log.scrollHeight; st.card = true; keep();
      $(".ghost", f).addEventListener("click", function () { f.remove(); });
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var n = f.n.value.trim(), v = f.v.value.trim(), er = $(".err", f);
        if (!/@/.test(v) && v.replace(/\D/g, "").length < 8) { er.textContent = "Add an email address, or a phone number with the country code."; f.v.focus(); return; }
        f.remove(); send(null, { name: n, value: v });
      });
      setTimeout(function () { f.n.focus(); }, 50);
    }
    // the app can't be reached: a short guided conversation, sent like the contact forms
    function local(text, contact) {
      var sl = st.slots, reply;
      if (contact) { sl.name = sl.name || contact.name; sl.contact = contact.value; }
      else if (!sl.interest) sl.interest = text;
      else if (!sl.name) sl.name = text.slice(0, 60);
      else if (!sl.contact) { if (/@/.test(text) || text.replace(/\D/g, "").length >= 8) sl.contact = text; }
      else sl.extra = ((sl.extra || "") + " " + text).trim();
      if (!sl.name) reply = "Happy to help with that. Who am I speaking with?";
      else if (!sl.contact) reply = "Thanks, " + sl.name.split(" ")[0] + ". What's the best email or WhatsApp number for a specialist to reach you?";
      else if (!st.lead) {
        var c = sl.contact, d = { name: sl.name || "Chat visitor", email: /@/.test(c) ? c : "", phone: /@/.test(c) ? "" : c, source: "website", campaign: "chat",
          message: "Chat on the website (" + location.pathname + ")\nInterested in: " + (sl.interest || "") + "\n\n" + st.msgs.map(function (m) { return (m.r === "me" ? "Visitor: " : bot + ": ") + m.t; }).join("\n") };
        if (!CFG.preview && CFG.intake) fetch(CFG.intake, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).catch(function () {});
        try { if (window.gtag) window.gtag("event", "generate_lead", { form: "chat" }); } catch (e) {}
        return { reply: "Perfect — a specialist will reply within one working day. Meanwhile, a free growth audit is the quickest way to see where you'd grow first: " + (LINKS["/free-audit/"] ? location.origin + "/free-audit/" : ""), saved: true };
      } else reply = "Noted — I've added that for the team.";
      return { reply: reply };
    }
    function done(reply, chips, saved, ask) {
      typing(false); addMsg("bot", reply); st.msgs.push({ r: "bot", t: reply });
      if (saved) {
        var ok = "Your details are with the team. A specialist will reply within one working day.";
        var el = addMsg("ok", ok); st.msgs.push({ r: "ok", t: ok }); st.lead = true; burst(el); mood("happy", 2600);
      }
      setChips(chips); keep(); busy = false; sendBtn.disabled = false; footNote();
      if (ask && !st.lead) setTimeout(card, 700);
    }
    function send(text, contact) {
      if (busy) return;
      text = text && text.trim(); if (!text && !contact) return;
      busy = true; sendBtn.disabled = true; setChips([]); panel.classList.add("started");
      var shown = contact ? (contact.name ? contact.name + " — " : "") + contact.value : text;
      addMsg("me", shown); st.msgs.push({ r: "me", t: shown }); keep();
      setTimeout(function () { if (busy) typing(true); }, 280);
      var t0 = Date.now(), finish = function (a, b, c, d) { setTimeout(function () { done(a, b, c, d); }, Math.max(0, 750 - (Date.now() - t0))); };
      if (st.local || CFG.preview) { var l = local(text, contact); finish(l.reply, [], l.saved); return; }
      fetch(CH.api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: st.sid, message: text || "", contact: contact || null, page: location.pathname, tz: tz }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
        .then(function (x) {
          if (x.status === 429 || x.status === 400) { finish((x.j && x.j.detail) || "Sorry, could you try that again?", st.chips); return; }
          if (!x.ok) throw new Error(x.status);
          st.sid = x.j.session_id || st.sid;
          try { if (x.j.lead_saved && window.gtag) window.gtag("event", "generate_lead", { form: "chat" }); } catch (e) {}
          finish(x.j.reply, x.j.chips, x.j.lead_saved, x.j.ask_contact);
        })
        .catch(function () { st.local = true; var l = local(text, contact); finish(l.reply, [], l.saved); });
    }
    function footNote() { // once we can reach them, no need to ask for a number again
      var f = panel && $(".chat-foot", panel); if (!f) return;
      f.innerHTML = st.lead ? 'A specialist will reply within one working day · <a href="' + CH.privacy + '">Privacy</a>'
        : '<button type="button" class="cc">Leave your number</button> for a call back · <a href="' + CH.privacy + '">Privacy</a>';
      var cc = $(".cc", f); if (cc) cc.addEventListener("click", card);
    }
    function hello() {
      var h = document.createElement("div"); h.className = "chat-hello";
      h.innerHTML = face() + "<h3>Hi, I'm " + escH(bot) + '<span>.</span></h3><p>' + escH(greet) + '</p><div class="starters">' +
        STARTERS.map(function (s, k) { return '<button type="button" data-q="' + escH(s[3]) + '" style="animation-delay:' + (120 + k * 70) + 'ms"><span class="ic">' + ICON[s[0]] + "</span><b>" + s[1] + "</b><small>" + s[2] + "</small></button>"; }).join("") +
        (LINKS["/free-audit/"] ? '<a class="wide" href="' + LINKS["/free-audit/"][1] + '" style="animation-delay:420ms"><span><b>Get a free growth audit</b><br><small>Website, search, social and ads, reviewed by a specialist</small></span>' + ICON.go + "</a>" : "") + "</div>";
      $$("button[data-q]", h).forEach(function (b) { b.addEventListener("click", function () { send(b.getAttribute("data-q")); }); });
      return h;
    }
    function build() {
      panel = document.createElement("div"); panel.className = "chat"; panel.id = "chat"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Chat with " + bot);
      panel.innerHTML = '<div class="chat-top"><span class="chat-av">' + face() + '</span><div class="chat-id"><b>' + escH(bot) + '</b><small><i class="live"></i>AI assistant · replies in seconds</small></div>' +
        '<button class="chat-icon chat-new" type="button" aria-label="Start a new conversation" title="New conversation">' + ICON.reset + '</button><button class="chat-icon chat-x" type="button" aria-label="Close chat">' + ICON.x + "</button></div>" +
        '<div class="chat-log" aria-live="polite" data-lenis-prevent></div><div class="chips"></div>' +
        '<form class="chat-form" novalidate><label class="sr" for="chat-in">Message</label><textarea id="chat-in" rows="1" maxlength="1000" placeholder="Ask ' + escH(bot) + ' anything…"></textarea><button class="chat-send" type="submit" aria-label="Send">' + ICON.go + "</button></form>" +
        '<p class="chat-foot"></p>';
      document.body.appendChild(panel);
      log = $(".chat-log", panel); chipBox = $(".chips", panel); ta = $("textarea", panel); sendBtn = $(".chat-send", panel);
      $(".chat-x", panel).addEventListener("click", closeChat);
      $(".chat-new", panel).addEventListener("click", function () { st = st0(); keep(); fill(); ta.focus({ preventScroll: true }); });
      $(".chat-form", panel).addEventListener("submit", function (e) { e.preventDefault(); var v = ta.value; ta.value = ""; ta.style.height = ""; send(v); });
      ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); var v = ta.value; ta.value = ""; ta.style.height = ""; send(v); } });
      ta.addEventListener("input", function () { ta.style.height = "auto"; ta.style.height = Math.min(120, ta.scrollHeight) + "px"; });
      ta.addEventListener("focus", function () { var r = ta.getBoundingClientRect(); look.pinned = [r.left + 40, r.top]; aimSoon(); });
      ta.addEventListener("blur", function () { look.pinned = null; aimSoon(); });
      panel.addEventListener("keydown", function (e) { if (e.key === "Escape") closeChat(); });
      fill();
    }
    function fill() {
      log.innerHTML = ""; log.appendChild(hello()); panel.classList.toggle("started", st.msgs.length > 0);
      st.msgs.forEach(function (m) { addMsg(m.r === "me" ? "me" : m.r === "ok" ? "ok" : "bot", m.t, { instant: true }); });
      setChips(st.msgs.length ? st.chips : []); footNote(); aimSoon();
    }
    function openChat(q) {
      if (!panel) build();
      if (hint) hint.classList.remove("in");
      try { sessionStorage.setItem("dd_chat_hint", "1"); } catch (e) {}
      fab.classList.add("open"); fab.setAttribute("aria-expanded", "true"); panel.classList.add("open"); st.open = true; keep();
      log.scrollTop = st.msgs.length ? log.scrollHeight : 0; setTimeout(aim, 400);
      if (q) setTimeout(function () { send(q); }, 500);
      else if (fine) setTimeout(function () { ta.focus({ preventScroll: true }); }, 400);
      try { if (window.gtag) window.gtag("event", "chat_open"); } catch (e) {}
    }
    function closeChat() { panel.classList.remove("open"); fab.classList.remove("open"); fab.setAttribute("aria-expanded", "false"); st.open = false; keep(); fab.focus({ preventScroll: true }); }
    function hop() { if (reduce || !fab) return; fab.classList.remove("hop"); void fab.offsetWidth; fab.classList.add("hop"); }
    function mountChat() {
      if (fab) return;
      fab = document.createElement("button"); fab.type = "button"; fab.className = "dot-fab"; fab.setAttribute("aria-expanded", "false"); fab.setAttribute("aria-controls", "chat");
      fab.setAttribute("aria-label", "Chat with " + bot); fab.innerHTML = '<span class="dot-say">Ask ' + escH(bot) + '</span><span class="dot-body">' + face() + '</span><span class="dot-shadow" aria-hidden="true"></span>';
      document.body.appendChild(fab); fab.addEventListener("click", function () { panel && panel.classList.contains("open") ? closeChat() : openChat(); });
      if (story.length) onScroll(); // start stepped aside if the page needs it
      requestAnimationFrame(function () { requestAnimationFrame(function () { fab.classList.add("in"); aim(); }); });
      setTimeout(hop, 1200);
      if (st.open && Date.now() - st.at < 6e5) { openChat(); return; }
      var seen = false; try { seen = !!sessionStorage.getItem("dd_chat_hint"); } catch (e) {}
      if (!seen && CH.hint && !/\/(contact|free-audit|thanks)\//.test(location.pathname)) setTimeout(function sayHi() {
        if (panel && panel.classList.contains("open")) return;
        if (fab.classList.contains("away")) { setTimeout(sayHi, 2000); return; } // not while Dot is stepped aside
        hint = document.createElement("div"); hint.className = "dot-hint"; hint.setAttribute("role", "status");
        hint.innerHTML = '<div class="typing"><i></i><i></i><i></i></div><button class="x" type="button" aria-label="Dismiss">×</button>';
        document.body.appendChild(hint); requestAnimationFrame(function () { hint.classList.add("in"); hop(); });
        setTimeout(function () { var t = $(".typing", hint); if (t) t.outerHTML = "<span>" + escH(CH.hint) + "</span>"; }, 1100);
        hint.addEventListener("click", function (e) { if (e.target.closest(".x")) hint.classList.remove("in"); else openChat(); try { sessionStorage.setItem("dd_chat_hint", "1"); } catch (er) {} });
        setTimeout(function () { if (hint) hint.classList.remove("in"); }, 15000);
      }, 7000);
    }
    // every link or button marked data-chat opens Dot (with an optional first question)
    document.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest("[data-chat]"); if (!t) return;
      e.preventDefault(); mountChat(); openChat(t.getAttribute("data-chat") || "");
    });
    // after the page has loaded, so it never competes with the first paint
    var startChat = function () { setTimeout(mountChat, 900); };
    if (document.readyState === "complete") startChat(); else addEventListener("load", startChat);
  }

  /* ---------------- UTM memory (first touch wins) ---------------- */
  var src = {};
  try {
    var qs = new URLSearchParams(location.search), keys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "li_fat_id"];
    src = JSON.parse(localStorage.getItem("dd_src") || "null");
    if (!src) {
      src = { landing: location.pathname, referrer: document.referrer || "", at: new Date().toISOString() };
      keys.forEach(function (k) { if (qs.get(k)) src[k] = qs.get(k); });
      localStorage.setItem("dd_src", JSON.stringify(src));
    }
  } catch (e) { src = src || {}; }

  /* ---------------- lead forms → CRM ---------------- */
  function sourceOf(s) {
    var m = (s.utm_medium || "").toLowerCase(), so = (s.utm_source || "").toLowerCase(), ref = (s.referrer || "").toLowerCase();
    if (s.gclid || /cpc|ppc|paid/.test(m)) return "ads";
    if (s.fbclid || /facebook|instagram|meta/.test(so)) return m ? "ads" : "website";
    if (s.li_fat_id || /linkedin/.test(so) || /linkedin/.test(ref)) return "linkedin";
    if (m === "referral" || so === "referral") return "referral";
    return "website";
  }
  var KNOWN = { name: 1, email: 1, phone: 1, company: 1, interest: 1, budget: 1, message: 1, website: 1, contact: 1, website_url_hp: 1 };
  document.addEventListener("submit", function (ev) {
    var form = ev.target.closest && ev.target.closest("form[data-lead]"); if (!form) return;
    ev.preventDefault();
    var status = $(".status", form), btn = $('button[type="submit"]', form);
    var hp = form.querySelector('[name="website_url_hp"]'); if (hp && hp.value) return;
    var fd = new FormData(form), d = {}; fd.forEach(function (v, k) { d[k] = String(v).trim(); });
    var miniForm = form.hasAttribute("data-mini");
    var err = function (msg, field) { status.textContent = msg; status.className = "status err"; if (field) field.focus(); };
    if (miniForm) {
      var c = d.contact || "";
      if (/@/.test(c)) d.email = c; else d.phone = c;
      d.name = d.name || ("Visitor " + c + (form.getAttribute("data-lead") ? " (" + form.getAttribute("data-lead").replace(/-/g, " ") + ")" : ""));
      if (!c || (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) || (d.phone && c.replace(/\D/g, "").length < 7)) return err("Please enter a valid email address.", form.elements.contact);
    } else {
      if (!d.name) return err("Please add your name.", form.elements.name);
      if (!(d.phone || d.email)) return err("Please add an email address or phone number so we can reply.", form.elements.email);
      if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return err("Please check the email address.", form.elements.email);
    }
    var extras = Object.keys(d).filter(function (k) { return !KNOWN[k] && d[k]; }).map(function (k) { return k[0].toUpperCase() + k.slice(1) + ": " + d[k]; });
    var notes = [
      d.interest ? "Interested in: " + d.interest : "", d.budget ? "Budget: " + d.budget + " (" + CUR + ")" : "", d.message || "",
      d.website ? "Website: " + d.website : "", d.company ? "Company: " + d.company : ""].concat(extras, ["Time zone: " + tz,
      "Page: " + location.href, src.landing ? "Landed on: " + src.landing : "", src.referrer ? "Referrer: " + src.referrer : "",
      src.utm_source ? "UTM: " + [src.utm_source, src.utm_medium, src.utm_campaign].filter(Boolean).join(" / ") : ""]).filter(Boolean);
    var payload = { name: d.name, phone: d.phone || "", email: d.email || "", company: d.company || "", source: sourceOf(src), campaign: src.utm_campaign || form.getAttribute("data-lead") || "website", value: "", message: notes.join("\n") };
    btn.disabled = true; status.textContent = "Sending…"; status.className = "status";
    var done = function () {
      status.textContent = miniForm ? "Thank you. We'll be in touch shortly." : "Thank you. A specialist will reply within one working day."; status.className = "status ok";
      form.reset(); btn.disabled = false;
      try { if (window.gtag) window.gtag("event", "generate_lead", { form: form.getAttribute("data-lead") }); } catch (e) {}
      var next = form.getAttribute("data-next"); if (next) setTimeout(function () { location.href = next; }, 900);
    };
    var fail = function () {
      btn.disabled = false; status.className = "status err";
      var waUrl = "https://wa.me/" + CFG.whatsapp + "?text=" + encodeURIComponent("Hello Dotindot, I'm " + d.name + (d.company ? " from " + d.company : "") + ". " + (d.message || "I'd like to talk about " + (d.interest || "growing our business") + "."));
      status.innerHTML = "We couldn't send that just now. <a href=\"" + waUrl + "\" target=\"_blank\" rel=\"noopener\">Send it on WhatsApp</a> or email <a href=\"mailto:" + CFG.email + "\">" + CFG.email + "</a>.";
    };
    if (CFG.preview) { setTimeout(done, 500); return; }
    var url = CFG.intake || "";
    if (!url || url.indexOf("PASTE_YOUR") > -1) return fail();
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { r.ok ? done() : fail(); }).catch(fail);
  });
})();
