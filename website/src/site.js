/* dotindot.in — one script, no framework. Smooth scroll (Lenis), Dot the mascot, the dot-universe scene,
   the process reel, clocks, and lead forms that post straight into the CRM. Everything degrades to plain HTML. */
(function () {
  "use strict";
  var CFG = window.__DD || {};
  var root = document.documentElement;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var ease = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var store = { get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} } };
  window.__ddReady = true;
  if (reduce) root.classList.add("reduce");

  /* ---------------- smooth scroll ---------------- */
  var lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new window.Lenis({ lerp: .095, wheelMultiplier: 1, smoothWheel: true });
  }
  var scrollY = window.scrollY, vel = 0, svel = 0, lastY = scrollY, dir = 1;
  function scrollTo(target) {
    if (lenis) lenis.scrollTo(target, { offset: -84, duration: 1.3 });
    else if (typeof target === "number") window.scrollTo(0, target);
    else target.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href"); if (id.length < 2) return;
      var t = document.getElementById(id.slice(1)); if (!t) return;
      e.preventDefault(); scrollTo(t); if (t.id === "main") t.focus({ preventScroll: true });
    });
  });

  /* ---------------- header + menu ---------------- */
  var hdr = $(".hdr"), menu = $(".menu"), burger = $(".burger");
  function setMenu(open) {
    if (!menu) return;
    menu.classList.toggle("open", open); burger.setAttribute("aria-expanded", open);
    menu.setAttribute("aria-hidden", !open);
    if (lenis) open ? lenis.stop() : lenis.start();
    document.body.style.overflow = open ? "hidden" : "";
    if (open) setTimeout(function () { var f = $("nav a", menu); f && f.focus(); }, 60); else burger.focus();
  }
  burger && burger.addEventListener("click", function () { setMenu(!menu.classList.contains("open")); });
  menu && $(".menu-close", menu).addEventListener("click", function () { setMenu(false); });
  menu && $$("a", menu).forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });

  /* ---------------- reveals ---------------- */
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: .12 }) : null;
  // only things that start below the fold get hidden for a reveal, so nothing above it waits for this script
  var fold = innerHeight * .92;
  $$("[data-reveal],.split-lines,.vs-row").forEach(function (el) {
    if (!io || reduce || el.getBoundingClientRect().top < fold) { el.classList.add("in"); return; }
    el.classList.add("pre"); io.observe(el);
  });

  /* ---------------- UTM memory (first touch wins) ---------------- */
  var src = {};
  try {
    var q = new URLSearchParams(location.search), keys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "li_fat_id"];
    src = JSON.parse(localStorage.getItem("dd_src") || "null");
    if (!src) {
      src = { landing: location.pathname, referrer: document.referrer || "", at: new Date().toISOString() };
      keys.forEach(function (k) { if (q.get(k)) src[k] = q.get(k); });
      localStorage.setItem("dd_src", JSON.stringify(src));
    }
  } catch (e) { src = src || {}; }

  /* ---------------- where in the world is the visitor? (time zone only, never sent anywhere) ---------------- */
  var tz = "UTC"; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) {}
  var CUR = (function () {
    if (/Kolkata|Calcutta/.test(tz)) return "INR";
    if (/London|Belfast|Guernsey|Jersey|Isle_of_Man/.test(tz)) return "GBP";
    if (/Dubai|Muscat/.test(tz)) return "AED";
    if (/Singapore/.test(tz)) return "SGD";
    if (/^Australia\//.test(tz)) return "AUD";
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
  };
  $$("select[data-budget]").forEach(function (sel) {
    var b = BUDGETS[CUR] || BUDGETS.USD, keep = sel.options[0];
    sel.innerHTML = ""; sel.appendChild(keep);
    b.forEach(function (t, i) { var o = document.createElement("option"); o.textContent = t + " a month"; o.value = t + " /month"; sel.appendChild(o); });
    var o = document.createElement("option"); o.textContent = "a one-off project"; o.value = "One-off project"; sel.appendChild(o);
  });

  /* ---------------- clocks ---------------- */
  var fmtCache = {};
  function timeIn(zone, withSec) {
    var k = zone + (withSec ? "s" : "");
    try { fmtCache[k] = fmtCache[k] || new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: zone }); return fmtCache[k].format(new Date()).replace(" ", " ").toLowerCase(); }
    catch (e) { return ""; }
  }
  function hourIn(zone) { try { return +new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: zone }).format(new Date()); } catch (e) { return 12; } }
  var PLACES = [[/Kolkata|Calcutta/, "in India"], [/London|Belfast/, "in the UK"], [/Dublin/, "in Ireland"], [/Dubai|Muscat/, "in the Gulf"], [/Riyadh/, "in Saudi Arabia"], [/Qatar/, "in Qatar"], [/Singapore/, "in Singapore"], [/Kuala_Lumpur/, "in Malaysia"], [/Hong_Kong/, "in Hong Kong"], [/Tokyo/, "in Japan"],
    [/^Australia\//, "in Australia"], [/Auckland/, "in New Zealand"], [/Toronto|Vancouver|Montreal|Edmonton|Winnipeg|Halifax/, "in Canada"], [/New_York|Detroit|Indiana/, "on the US East Coast"], [/Chicago/, "in the central US"], [/Denver|Phoenix/, "in the mountain states"], [/Los_Angeles/, "on the US West Coast"],
    [/Berlin/, "in Germany"], [/Paris/, "in France"], [/Amsterdam/, "in the Netherlands"], [/Madrid/, "in Spain"], [/Rome/, "in Italy"], [/Zurich/, "in Switzerland"], [/Stockholm/, "in Sweden"], [/Lagos/, "in Nigeria"], [/Nairobi/, "in Kenya"], [/Johannesburg/, "in South Africa"], [/Sao_Paulo/, "in Brazil"], [/Mexico_City/, "in Mexico"], [/Colombo/, "in Sri Lanka"], [/Dhaka/, "in Bangladesh"], [/Karachi/, "in Pakistan"]];
  var place = "where you are"; for (var pi0 = 0; pi0 < PLACES.length; pi0++) { if (PLACES[pi0][0].test(tz)) { place = PLACES[pi0][1]; break; } }
  $$("[data-place]").forEach(function (el) { el.textContent = place; });
  function tickClocks() {
    $$("[data-localtime]").forEach(function (el) { el.textContent = timeIn(tz); });
    $$("[data-tz]").forEach(function (el) {
      var z = el.getAttribute("data-tz"), b = $("b", el); if (b) b.textContent = timeIn(z);
      var h = hourIn(z); el.classList.toggle("awake", h >= 8 && h < 20);
    });
  }
  if ($("[data-localtime],[data-tz]")) { tickClocks(); setInterval(tickClocks, 15000); }
  var t0 = Date.now();
  var stare = $$("[data-stare]");
  if (stare.length) setInterval(function () { var s = Math.round((Date.now() - t0) / 1000); stare.forEach(function (el) { el.textContent = s; }); }, 1000);

  /* ---------------- Dot ---------------- */
  var dot = $("#dot"), bubble = $("#dot-bubble"), slot = $("h1 .dot-slot");
  var mood = { base: "idle", hover: null, temp: null, tempUntil: 0 }, lastInput = Date.now(), sleeping = false;
  var pointer = { x: innerWidth * .5, y: innerHeight * .3, has: false };
  var dotBase = null; // resting rect
  function measureDot() {
    if (!dot) return;
    var tr = dot.style.transform; dot.style.transform = "none";
    var r = dot.getBoundingClientRect(); dotBase = { x: r.left, y: r.top, w: r.width, h: r.height };
    dot.style.transform = tr;
  }
  function setTemp(m, ms) { mood.temp = m; mood.tempUntil = Date.now() + ms; applyMood(); }
  function applyMood() {
    if (!dot) return;
    var now = Date.now();
    if (mood.temp && now > mood.tempUntil) mood.temp = null;
    var m = mood.temp || mood.hover || (sleeping ? "sleep" : null) || mood.base || "idle";
    if (dot.getAttribute("data-mood") !== m) dot.setAttribute("data-mood", m);
  }
  function wake() {
    lastInput = Date.now();
    if (sleeping) { sleeping = false; setTemp("wow", 900); }
  }
  if (dot) {
    measureDot();
    addEventListener("resize", function () { measureDot(); });
    // blink
    (function blink() {
      setTimeout(function () {
        var m = dot.getAttribute("data-mood");
        if (m === "idle" || m === "wow") { dot.classList.add("blink"); setTimeout(function () { dot.classList.remove("blink"); }, 140); }
        blink();
      }, 2200 + Math.random() * 3800);
    })();
    // hover moods
    document.addEventListener("pointerover", function (e) { var t = e.target.closest && e.target.closest("[data-dot]"); mood.hover = t ? t.getAttribute("data-dot") : null; applyMood(); });
    document.addEventListener("focusin", function (e) { var t = e.target.closest && e.target.closest("[data-dot]"); mood.hover = t ? t.getAttribute("data-dot") : null; applyMood(); });
    // section moods
    var sects = $$("[data-mood-sec]");
    if (sects.length && "IntersectionObserver" in window) {
      var vis = new Map();
      var so = new IntersectionObserver(function (es) {
        es.forEach(function (e) { vis.set(e.target, e.intersectionRatio); });
        var best = null, br = 0; vis.forEach(function (r, el) { if (r > br) { br = r; best = el; } });
        mood.base = best && br > .15 ? best.getAttribute("data-mood-sec") : "idle"; applyMood();
      }, { threshold: [0, .15, .3, .5, .7] });
      sects.forEach(function (s) { so.observe(s); });
    }
    ["pointermove", "keydown", "touchstart", "wheel", "scroll"].forEach(function (ev) { addEventListener(ev, wake, { passive: true }); });
    addEventListener("pointermove", function (e) { pointer.x = e.clientX; pointer.y = e.clientY; pointer.has = true; }, { passive: true });
    addEventListener("pointerdown", function (e) { pointer.x = e.clientX; pointer.y = e.clientY; pointer.has = true; }, { passive: true });
    setInterval(function () { if (!sleeping && Date.now() - lastInput > 24000 && !bubble.classList.contains("show")) { sleeping = true; applyMood(); } applyMood(); }, 1000);
  }

  // bubble
  var JOKES = CFG.jokes || [], jokeI = Math.floor(Math.random() * 10);
  function openBubble(msg, opts) {
    if (!bubble) return;
    var p = $("p", bubble); p.innerHTML = msg;
    $(".opts", bubble).style.display = opts === false ? "none" : "";
    bubble.classList.add("show"); bubble.setAttribute("aria-hidden", "false"); dot.setAttribute("aria-expanded", "true");
  }
  function closeBubble(focusDot) {
    if (!bubble || !bubble.classList.contains("show")) return;
    bubble.classList.remove("show"); bubble.setAttribute("aria-hidden", "true"); dot.setAttribute("aria-expanded", "false");
    if (focusDot) dot.focus();
  }
  if (dot && bubble) {
    dot.addEventListener("click", function () {
      if (bubble.classList.contains("show") && $(".opts", bubble).style.display !== "none") { closeBubble(); return; }
      setTemp("happy", 1400);
      openBubble("Hi, I'm Dot. I live here. What can I do for you?");
      setTimeout(function () { var f = $(".opts a,.opts button", bubble); f && f.focus({ preventScroll: true }); }, 80);
    });
    $(".x", bubble).addEventListener("click", function () { closeBubble(true); });
    $("[data-joke]", bubble).addEventListener("click", function () {
      if (!JOKES.length) return;
      jokeI = (jokeI + 1) % JOKES.length;
      $("p", bubble).textContent = JOKES[jokeI];
      setTemp("wink", 2200);
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeBubble(true); if (menu && menu.classList.contains("open")) setMenu(false); } });
    document.addEventListener("pointerdown", function (e) { if (bubble.classList.contains("show") && !bubble.contains(e.target) && !dot.contains(e.target)) closeBubble(); });
    // exit intent, desktop only, once per session
    if (finePointer) {
      document.addEventListener("mouseout", function (e) {
        if (e.relatedTarget || e.clientY > 8 || Date.now() - t0 < 12000 || store.get("dd_exit")) return;
        store.set("dd_exit", "1"); setTemp("wow", 2500);
        openBubble("Leaving already? Fair. Just so you know: the audit is free. Like, <b>actually</b> free.");
      });
    }
    // a hello on the first page of a visit
    if (!store.get("dd_hello") && CFG.hello) {
      setTimeout(function () {
        if (bubble.classList.contains("show")) return;
        store.set("dd_hello", "1"); setTemp("happy", 2000);
        openBubble("Hi! I'm Dot. I follow your cursor around. It's my whole job. Tap me if you need anything.", false);
        setTimeout(function () { if ($(".opts", bubble).style.display === "none") closeBubble(); }, 6500);
      }, 5200);
    }
  }

  /* ---------------- hero confetti ---------------- */
  var confetti = $$(".confetti i");

  /* ---------------- dot universe ---------------- */
  var uni = $(".uni"), U = null;
  function initUniverse() {
    var canvas = $("canvas", uni), ctx = canvas.getContext("2d"), caps = $$(".uni-cap", uni), bar = $(".uni-prog i", uni), you = $(".uni-you", uni);
    U = { ready: false, active: true, p: 0, canvas: canvas, ctx: ctx, caps: caps, bar: bar, you: you };
    var url = uni.getAttribute("data-map");
    fetch(url).then(function (r) { return r.json(); }).then(function (m) {
      var n = m.p.length / 2, extra = Math.round(n * .45);
      U.m = m; U.n = n; U.extra = extra;
      U.tx = new Float32Array(n); U.ty = new Float32Array(n); U.sx = new Float32Array(n + extra); U.sy = new Float32Array(n + extra); U.ph = new Float32Array(n + extra); U.stag = new Float32Array(n);
      for (var i = 0; i < n; i++) { U.tx[i] = m.p[i * 2]; U.ty[i] = m.p[i * 2 + 1]; U.stag[i] = (m.p[i * 2] / m.w) * .55 + Math.random() * .25; }
      for (var j = 0; j < n + extra; j++) { U.sx[j] = Math.random(); U.sy[j] = Math.random(); U.ph[j] = Math.random() * 6.283; }
      // where's "you"? nearest pin to the visitor's time zone
      var Z = { London: /London|Dublin|Lisbon|Belfast/, Berlin: /^Europe\/(?!London|Dublin|Lisbon)/, Dubai: /Dubai|Muscat|Riyadh|Qatar|Bahrain|Kuwait|Africa\//, Chennai: /Kolkata|Calcutta|Colombo|Dhaka|Kathmandu|Karachi/, Singapore: /Singapore|Kuala_Lumpur|Jakarta|Bangkok|Manila|Hong_Kong|Shanghai|Tokyo|Seoul|Taipei|Ho_Chi_Minh/, Sydney: /^Australia\/|Auckland|Pacific\//, Toronto: /Toronto|Montreal|Vancouver|Halifax|Winnipeg|Edmonton/, "New York": /^America\//, };
      var youPin = "New York"; for (var k in Z) { if (Z[k].test(tz)) { youPin = k; break; } }
      U.youPin = youPin;
      var yp = m.pins[youPin], best = 0, bd = 1e9;
      for (var q = 0; q < n; q++) { var dx = U.tx[q] - yp[0], dy = U.ty[q] - yp[1], d = dx * dx + dy * dy; if (d < bd) { bd = d; best = q; } }
      U.youI = best;
      U.others = Object.keys(m.pins).filter(function (k) { return k !== youPin; });
      if (you) you.textContent = youPin === "Chennai" ? "you (and us!)" : "you, probably";
      U.ready = true; sizeUni(); drawUni(reduce ? 1 : U.p, performance.now());
    }).catch(function () {});
    addEventListener("resize", sizeUni);
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { U.active = es[0].isIntersecting; }, { rootMargin: "200px" }).observe(uni);
  }
  function sizeUni() {
    if (!U) return;
    var c = U.canvas, r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    U.W = r.width; U.H = r.height; c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); U.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!U.m) return;
    var mobile = U.W < 760, pad = mobile ? 12 : 40, top = mobile ? .47 : .37;
    var availW = U.W - pad * 2, availH = U.H * (.93 - top);
    U.k = Math.min(availW / U.m.w, availH / U.m.h);
    U.ox = (U.W - U.m.w * U.k) / 2; U.oy = U.H * top + (availH - U.m.h * U.k) / 2;
    if (reduce || root.classList.contains("reduce")) drawUni(1, 0);
  }
  function drawUni(p, now) {
    var c = U.ctx, W = U.W, H = U.H, k = U.k, n = U.n, t = now / 1000;
    c.clearRect(0, 0, W, H);
    var morph = ease(clamp((p - .4) / .32, 0, 1)), grow = clamp((p - .2) / .2, 0, 1), arcs = clamp((p - .72) / .22, 0, 1);
    var r0 = Math.max(1.3, k * .36), fieldR = Math.max(1.2, Math.min(2.1, W / 700));
    // the crowd
    c.beginPath();
    var dim = 1 - grow * .35;
    for (var i = 0; i < n; i++) {
      if (i === U.youI) continue;
      var lp = clamp((morph - U.stag[i] * .5) / .5, 0, 1); lp = ease(lp);
      var fx = U.sx[i] * W + Math.sin(t * .6 + U.ph[i]) * 6 * (1 - lp), fy = U.sy[i] * H + Math.cos(t * .5 + U.ph[i]) * 6 * (1 - lp);
      var x = lerp(fx, U.ox + U.tx[i] * k, lp), y = lerp(fy, U.oy + U.ty[i] * k, lp), rr = lerp(fieldR, r0, lp);
      c.moveTo(x + rr, y); c.arc(x, y, rr, 0, 6.2832);
    }
    c.fillStyle = "rgba(21,23,42," + (0.26 * dim + morph * .1) + ")"; c.fill();
    // the extras that drift off as the map forms
    if (morph < 1) {
      c.beginPath();
      for (var j = n; j < n + U.extra; j++) {
        var ex = U.sx[j] * W + Math.sin(t * .6 + U.ph[j]) * 6, ey = U.sy[j] * H + Math.cos(t * .5 + U.ph[j]) * 6 - morph * 80;
        c.moveTo(ex + fieldR, ey); c.arc(ex, ey, fieldR, 0, 6.2832);
      }
      c.fillStyle = "rgba(21,23,42," + (0.26 * dim * (1 - morph)) + ")"; c.fill();
    }
    // you
    var yi = U.youI, ylp = ease(clamp((morph - .1) / .7, 0, 1));
    var yfx = .5 * W, yfy = (W < 760 ? .62 : .58) * H;
    var yx = lerp(yfx, U.ox + U.tx[yi] * k, ylp), yy = lerp(yfy, U.oy + U.ty[yi] * k, ylp);
    var big = Math.min(W, H) * (W < 760 ? .07 : .05);
    var yr = lerp(fieldR, big, Math.sin(grow * Math.PI / 2)) ; yr = lerp(yr, Math.max(5, r0 * 2.4), ylp);
    // arcs to the world
    if (arcs > 0) {
      c.lineWidth = Math.max(1.4, k * .14); c.lineCap = "round";
      U.others.forEach(function (name, idx) {
        var pin = U.m.pins[name], px = U.ox + pin[0] * k, py = U.oy + pin[1] * k;
        var a = clamp(arcs * 1.6 - idx * .09, 0, 1); if (a <= 0) return;
        var mx = (yx + px) / 2, my = Math.min(yy, py) - Math.abs(px - yx) * .28 - 10;
        c.strokeStyle = "rgba(255,131,31,.85)"; c.beginPath();
        var steps = 28, lim = Math.round(steps * a);
        for (var s = 0; s <= lim; s++) { var u = s / steps, bx = (1 - u) * (1 - u) * yx + 2 * (1 - u) * u * mx + u * u * px, by = (1 - u) * (1 - u) * yy + 2 * (1 - u) * u * my + u * u * py; s ? c.lineTo(bx, by) : c.moveTo(bx, by); }
        c.stroke();
        if (a >= 1) { var pr = Math.max(3, r0 * 1.6) * (1 + .25 * Math.sin(t * 3 + idx)); c.beginPath(); c.arc(px, py, pr, 0, 6.2832); c.fillStyle = "#ff831f"; c.fill(); }
      });
    }
    // glow + the dot itself
    if (grow > 0) {
      var g = c.createRadialGradient(yx, yy, 0, yx, yy, yr * 3.2);
      g.addColorStop(0, "rgba(255,131,31," + (.35 * grow) + ")"); g.addColorStop(1, "rgba(255,131,31,0)");
      c.fillStyle = g; c.beginPath(); c.arc(yx, yy, yr * 3.2, 0, 6.2832); c.fill();
    }
    c.beginPath(); c.arc(yx, yy, yr, 0, 6.2832); c.fillStyle = grow > 0 ? "#ff831f" : "rgba(21,23,42,.26)"; c.fill();
    if (U.you) { U.you.style.left = yx + "px"; U.you.style.top = (yy - yr) + "px"; U.you.classList.toggle("on", p > .78); }
  }
  if (uni) {
    if ("IntersectionObserver" in window) {
      var pre = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { pre.disconnect(); initUniverse(); } }, { rootMargin: "120% 0px" });
      pre.observe(uni);
    } else initUniverse();
  }

  /* ---------------- process reel ---------------- */
  var proc = $(".proc"), track = proc && $(".proc-track", proc);
  if (proc) proc.style.setProperty("--n", $$(".proc-card", proc).length);
  function procOn() { return proc && !reduce && innerWidth >= 1024; }

  /* ---------------- marquee ---------------- */
  var marqs = $$(".marq-track").map(function (tr) { return { el: tr, x: 0, w: 0 }; });
  function sizeMarq() { marqs.forEach(function (m) { var g = $(".marq-group", m.el); m.w = g ? g.getBoundingClientRect().width : 0; }); }
  sizeMarq(); addEventListener("resize", sizeMarq);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { sizeMarq(); measureDot(); });

  /* ---------------- service peek ---------------- */
  var peek = $(".peek"), peekPos = { x: 0, y: 0, tx: 0, ty: 0 };
  if (peek && finePointer) {
    $$(".svc-row").forEach(function (row) {
      row.addEventListener("mouseenter", function () {
        $("b", peek).textContent = row.getAttribute("data-tag"); $("span", peek).textContent = row.getAttribute("data-quip");
        var ico = $(".ico", peek), src = $("template", row); ico.innerHTML = src ? src.innerHTML : "";
        peek.classList.add("on");
      });
      row.addEventListener("mouseleave", function () { peek.classList.remove("on"); });
    });
  }

  /* ---------------- magnetic buttons ---------------- */
  if (finePointer && !reduce) {
    $$("[data-mag]").forEach(function (b) {
      b.addEventListener("pointermove", function (e) { var r = b.getBoundingClientRect(); b.style.transform = "translate(" + (e.clientX - r.left - r.width / 2) * .22 + "px," + (e.clientY - r.top - r.height / 2) * .3 + "px)"; });
      b.addEventListener("pointerleave", function () { b.style.transform = ""; });
    });
  }

  /* ---------------- FAQ: smooth open/close ---------------- */
  $$(".faq details").forEach(function (d) {
    var s = $("summary", d), body = $(".ans", d), anim = null;
    s.addEventListener("click", function (e) {
      if (reduce || !body.animate) return;
      e.preventDefault();
      if (anim) anim.cancel();
      var start = d.offsetHeight;
      if (d.open) {
        var end = s.offsetHeight;
        anim = d.animate({ height: [start + "px", end + "px"] }, { duration: 380, easing: "cubic-bezier(.22,1,.36,1)" });
        anim.onfinish = function () { d.open = false; anim = null; d.style.height = ""; };
      } else {
        d.open = true; var full = d.offsetHeight;
        anim = d.animate({ height: [start + "px", full + "px"] }, { duration: 460, easing: "cubic-bezier(.22,1,.36,1)" });
        anim.onfinish = function () { anim = null; };
        setTemp("wow", 900);
      }
    });
  });

  /* ---------------- the frame loop: all reads first, then writes (no forced layouts) ---------------- */
  var stretch = $$(".stretchy"), heroH = innerHeight, dotP = -1, hdrHidden = false, hdrSolid = null, lastSk = 0, lastPx = 99, lastPy = 99;
  var marqVis = true, procMax = 0, procDirty = true;
  if ($(".marq") && "IntersectionObserver" in window) new IntersectionObserver(function (es) { marqVis = es[0].isIntersecting; }).observe($(".marq"));
  function measureProc() {
    if (!track) return;
    var par = track.parentElement, padL = parseFloat(getComputedStyle(par).paddingLeft) || 0;
    var tr = track.style.transform; track.style.transform = "";
    procMax = Math.max(0, par.getBoundingClientRect().left + padL + track.scrollWidth - innerWidth);
    track.style.transform = tr; procDirty = false;
  }
  function frame(now) {
    if (lenis) lenis.raf(now);
    // ---- reads
    var y = lenis ? lenis.scroll : window.scrollY;
    vel = lenis ? lenis.velocity : y - lastY; dir = y > lastY ? 1 : y < lastY ? -1 : dir; lastY = y; scrollY = y;
    if (Math.abs(vel) > 400) { vel = 0; svel = 0; } // a jump (anchor link, restore), not a flick
    svel += (vel - svel) * .14;
    var av = Math.abs(svel);
    var p = 1, sRect = null;
    if (dot && dotBase && slot && !reduce) { p = clamp(y / (heroH * .55), 0, 1); if (p < 1) sRect = slot.getBoundingClientRect(); }
    var uRect = U && U.ready && U.active && !reduce ? uni.getBoundingClientRect() : null;
    var pRect = null;
    if (procOn() && track) { if (procDirty) measureProc(); pRect = proc.getBoundingClientRect(); }

    // ---- writes
    if (hdr) {
      var solid = y > 24; if (solid !== hdrSolid) { hdrSolid = solid; hdr.classList.toggle("solid", solid); }
      var hide = y > 420 && dir > 0 && av > .6 && !(menu && menu.classList.contains("open"));
      if (hide && !hdrHidden) { hdrHidden = true; hdr.classList.add("hide"); }
      if (hdrHidden && (dir < 0 || y <= 420)) { hdrHidden = false; hdr.classList.remove("hide"); }
    }
    if (!reduce) {
      // headings lean into fast scrolling, then stand back up
      var sk = clamp(-svel * .22, -9, 9); if (Math.abs(sk) < .05) sk = 0;
      if (Math.abs(sk - lastSk) > .02) { lastSk = sk; for (var i = 0; i < stretch.length; i++) stretch[i].style.transform = sk ? "skewX(" + sk.toFixed(2) + "deg)" : ""; }
      if (y < innerHeight * 1.3) for (var c = 0; c < confetti.length; c++) confetti[c].style.transform = "translate3d(0," + (-y * confetti[c].__s).toFixed(1) + "px,0)";
      if (marqVis) for (var mi = 0; mi < marqs.length; mi++) {
        var m = marqs[mi]; if (!m.w) continue;
        m.x -= (.55 + Math.min(av, 40) * .18) * dir;
        if (m.x <= -m.w) m.x += m.w; if (m.x > 0) m.x -= m.w;
        m.el.style.transform = "translate3d(" + m.x.toFixed(1) + "px,0,0)";
      }
    }

    // Dot: rides from the headline's full stop to its corner as you scroll
    if (dot && dotBase) {
      var cx = dotBase.x + dotBase.w / 2, cy = dotBase.y + dotBase.h / 2;
      if (sRect) {
        var fs = slot.__fs || (slot.__fs = parseFloat(getComputedStyle(slot).fontSize) || 60);
        var size = Math.max(sRect.width * 1.05, clamp(fs * .72, 26, 76)), sc0 = size / dotBase.w;
        var x0 = Math.min(sRect.left, innerWidth - size - 6), y0 = sRect.bottom - size; // sit on the baseline like a full stop
        var e = ease(p), sc = lerp(sc0, 1, e), x = lerp(x0, dotBase.x, e), yy = lerp(y0, dotBase.y, e);
        var dist = Math.hypot(dotBase.x - x0, dotBase.y - y0), turns = Math.max(1, Math.round(dist / (Math.PI * dotBase.w * 1.6)));
        var tcx = x + dotBase.w * sc / 2 - cx, tcy = yy + dotBase.h * sc / 2 - cy;
        dot.style.transform = "translate3d(" + tcx.toFixed(1) + "px," + tcy.toFixed(1) + "px,0) rotate(" + (e * turns * 360).toFixed(1) + "deg) scale(" + sc.toFixed(3) + ")";
        if (dotP === 1 || dotP < 0) dot.classList.add("hero-mode");
        if (p > .02 && p < .98 && mood.temp !== "wow") setTemp("wow", 400);
        cx += tcx; cy += tcy; dotP = p;
      } else if (dotP !== 1) { dot.style.transform = ""; dot.classList.remove("hero-mode"); dotP = 1; }
      // eyes follow the pointer (or the scroll direction on touch)
      var tx = 0, ty = 0;
      if (!(p > 0 && p < 1)) {
        if (pointer.has) { var ddx = pointer.x - cx, ddy = pointer.y - cy, dd = Math.hypot(ddx, ddy) || 1, mag = Math.min(5, dd / 40); tx = ddx / dd * mag; ty = ddy / dd * mag; }
        else ty = clamp(svel * .4, -4.5, 4.5);
      }
      if (Math.abs(tx - lastPx) > .05 || Math.abs(ty - lastPy) > .05) {
        lastPx = tx; lastPy = ty;
        var pp = dot.__pupils || (dot.__pupils = $$(".pupils", dot)), t = "translate(" + tx.toFixed(2) + " " + ty.toFixed(2) + ")";
        for (var pi = 0; pi < pp.length; pi++) pp[pi].setAttribute("transform", t);
      }
      if (av > 55 && p >= 1 && !reduce && mood.temp !== "dizzy") setTemp("dizzy", 1300); // too fast? dizzy.
    }

    // universe
    if (uRect) {
      var up = clamp(-uRect.top / ((uRect.height - innerHeight) || 1), 0, 1);
      U.p = up; drawUni(up, now);
      var ci = up < .2 ? 0 : up < .4 ? 1 : up < .72 ? 2 : 3;
      if (ci !== U.ci) { U.ci = ci; for (var k = 0; k < U.caps.length; k++) U.caps[k].classList.toggle("on", k === ci); }
      if (U.bar) U.bar.style.transform = "scaleX(" + up.toFixed(3) + ")";
    }
    // process reel
    if (pRect) {
      var pp2 = clamp(-pRect.top / ((pRect.height - innerHeight) || 1), 0, 1);
      track.style.transform = "translate3d(" + (-procMax * ease(pp2)).toFixed(1) + "px,0,0)";
    } else if (track && track.style.transform) track.style.transform = "";

    requestAnimationFrame(frame);
  }
  confetti.forEach(function (c) { c.__s = +c.getAttribute("data-s") || 0; });
  addEventListener("resize", function () { heroH = innerHeight; procDirty = true; if (slot) slot.__fs = 0; });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { procDirty = true; });
  requestAnimationFrame(frame);

  /* ---------------- lead forms → CRM ---------------- */
  function sourceOf(s) {
    var m = (s.utm_medium || "").toLowerCase(), so = (s.utm_source || "").toLowerCase(), ref = (s.referrer || "").toLowerCase();
    if (s.gclid || /cpc|ppc|paid/.test(m)) return "ads";
    if (s.fbclid || /facebook|instagram|meta/.test(so)) return m ? "ads" : "website";
    if (s.li_fat_id || /linkedin/.test(so) || /linkedin/.test(ref)) return "linkedin";
    if (m === "referral" || so === "referral") return "referral";
    return "website";
  }
  $$("form[data-lead]").forEach(function (form) {
    var status = $(".status", form), btn = $('button[type="submit"]', form);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var hp = $(".hp input", form); if (hp && hp.value) return;
      var fd = new FormData(form), d = {}; fd.forEach(function (v, k) { d[k] = String(v).trim(); });
      if (!d.name || !(d.phone || d.email)) {
        status.textContent = "Dot needs your name and a phone number or email to get back to you."; status.className = "status err";
        setTemp("wow", 1600); (!d.name ? form.elements.name : form.elements.email).focus(); return;
      }
      if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) { status.textContent = "That email looks a little off. Mind checking it?"; status.className = "status err"; form.elements.email.focus(); return; }
      var notes = [
        d.interest ? "Interested in: " + d.interest : "", d.budget ? "Budget: " + d.budget + " (" + CUR + ")" : "", d.message || "",
        d.website ? "Website: " + d.website : "", d.company ? "Company: " + d.company : "", "Time zone: " + tz,
        "Page: " + location.href, src.landing ? "Landed on: " + src.landing : "", src.referrer ? "Referrer: " + src.referrer : "",
        src.utm_source ? "UTM: " + [src.utm_source, src.utm_medium, src.utm_campaign].filter(Boolean).join(" / ") : "",
      ].filter(Boolean);
      var payload = { name: d.name, phone: d.phone || "", email: d.email || "", company: d.company || "", source: sourceOf(src), campaign: src.utm_campaign || form.getAttribute("data-lead") || "website", value: "", message: notes.join("\n") };
      btn.disabled = true; status.textContent = "Sending…"; status.className = "status";
      var done = function () {
        status.textContent = "Got it! A real human will reply within one working day."; status.className = "status ok";
        form.reset(); btn.disabled = false; setTemp("love", 4000);
        try { if (window.gtag) window.gtag("event", "generate_lead", { form: form.getAttribute("data-lead") }); } catch (e) {}
        var next = form.getAttribute("data-next"); if (next) setTimeout(function () { location.href = next; }, 1300);
      };
      var fail = function () {
        btn.disabled = false; status.className = "status err"; setTemp("dizzy", 1600);
        var wa = "https://wa.me/" + CFG.whatsapp + "?text=" + encodeURIComponent("Hi dotindot, I'm " + d.name + (d.company ? " from " + d.company : "") + ". " + (d.message || "I'd like to talk about " + (d.interest || "growing our brand") + "."));
        status.innerHTML = "Our inbox hiccuped. <a href=\"" + wa + "\" target=\"_blank\" rel=\"noopener\">Send it on WhatsApp instead</a> or email <a href=\"mailto:" + CFG.email + "\">" + CFG.email + "</a>.";
      };
      if (CFG.preview) { setTimeout(done, 600); return; }
      var url = CFG.intake || "";
      if (!url || url.indexOf("PASTE_YOUR") > -1) return fail();
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        .then(function (r) { r.ok ? done() : fail(); }).catch(fail);
    });
  });
})();
