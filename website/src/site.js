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
  var lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new window.Lenis({ lerp: .1, wheelMultiplier: 1, smoothWheel: true });
    (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(performance.now());
  }
  function scrollToEl(el) {
    var y = el.getBoundingClientRect().top + window.scrollY - (parseInt(getComputedStyle(root).getPropertyValue("--hdr")) || 76) - 8;
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
    var HUB = "Chennai", MARKETS = ["London", "New York", "Dubai", "Singapore", "Sydney"], LABEL = { London: "London", "New York": "New York", Dubai: "Dubai", Singapore: "Singapore", Sydney: "Sydney", Chennai: "India (HQ)" };
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
        var c = arc(hub, P(m)), st = 1.1 + k * .22, prog = clamp((t - st) / 1.2, 0, 1); if (prog <= 0) return;
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
        var p = P(m), on = clamp((t - (m === HUB ? .9 : 2 + k * .22)) / .5, 0, 1); if (on <= 0) return;
        if (!reduce) { var pulse = ((t * .6 + k * .3) % 1); cx.strokeStyle = "rgba(255,122,26," + ((1 - pulse) * .35 * on).toFixed(2) + ")"; cx.lineWidth = 1; cx.beginPath(); cx.arc(p[0], p[1], 4 + pulse * 14, 0, 6.283); cx.stroke(); }
        cx.globalAlpha = on; cx.fillStyle = m === HUB ? "#0e1b33" : "#ff7a1a"; cx.beginPath(); cx.arc(p[0], p[1], m === HUB ? 4.6 : 4, 0, 6.283); cx.fill();
        cx.fillStyle = "#fff"; cx.beginPath(); cx.arc(p[0], p[1], 1.5, 0, 6.283); cx.fill();
        if (W > 420) { cx.font = "600 12px " + font; cx.fillStyle = "#26324a"; var right = m === "London" || m === "New York" ? -1 : 1; cx.textAlign = right < 0 ? "right" : "left"; cx.fillText(LABEL[m], p[0] + right * 10, p[1] + (m === "Dubai" ? -8 : m === "Singapore" ? 14 : 4)); }
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
