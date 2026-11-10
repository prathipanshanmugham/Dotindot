// dotindot.in static site builder — `node build.mjs` → dist/. No framework. PREVIEW=1 builds relative links for a preview host.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { services, steps, aiHuman, values, faqs, whyUs, expertise, industries, insights as INSIGHTS0, careers, tools, markets, quiz, seoTitles } from "./src/content.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const C = JSON.parse(readFileSync(join(ROOT, "site.config.json"), "utf8"));
if (process.env.INTAKE_URL) C.leadIntakeUrl = process.env.INTAKE_URL; // for local end-to-end tests
// What the website editor (employee app → Website) publishes overrides site.config.json: clients, testimonials,
// team, case studies, key numbers and contact details. The backend writes this file, then rebuilds.
const CONTENT_FILE = process.env.CONTENT_FILE || join(ROOT, "content.json");
let X = {};
if (existsSync(CONTENT_FILE)) {
  try {
    X = JSON.parse(readFileSync(CONTENT_FILE, "utf8"));
    for (const k of ["clients", "testimonials", "team", "caseStudies", "proof"]) if (Array.isArray(X[k])) C[k] = X[k];
    for (const k of ["email", "phone", "phoneDisplay", "whatsapp"]) if (typeof X[k] === "string") C[k] = X[k];
    if (X.social && typeof X.social === "object") C.social = X.social;
  } catch (e) { X = {}; console.warn("content.json ignored:", e.message); }
}
// offices, certifications, articles, SEO, legal pages and the chat assistant — also from the editor
const locations = (X.locations || C.locations || []).filter((l) => l && l.name && l.address);
const certs = (X.certifications || C.certifications || []).filter((c) => c && c.name);
const SEO = X.seo || {};
C.verify = { ...(C.verify || {}), ...(SEO.google ? { google: SEO.google } : {}), ...(SEO.bing ? { bing: SEO.bing } : {}) };
if (SEO.ga4) C.ga4 = SEO.ga4;
const PG = X.pages || {};
const PAGES0 = JSON.parse(readFileSync(join(ROOT, "src/pages.json"), "utf8"));
const CHAT = X.chat || { enabled: true, name: "Dot", greeting: "" };
const readMins = (body) => Math.max(1, Math.round(String(Array.isArray(body) ? body.join(" ") : body || "").split(/\s+/).filter(Boolean).length / 220));
const insights = (Array.isArray(X.insights) ? X.insights : INSIGHTS0).filter((a) => a && a.slug && a.title)
  .map((a) => ({ ...a, minutes: readMins(a.body) })).sort((a, b) => String(b.date).localeCompare(String(a.date)));
const CURS = [...new Set(["USD", ...markets.map((m) => m.cur)])];
const curList = CURS.slice(0, -1).join(", ") + " or " + CURS[CURS.length - 1];
const MEDIA = process.env.WEBSITE_MEDIA_DIR || join(ROOT, "media");
const OUT = process.env.OUT_DIR ? resolve(process.env.OUT_DIR) : join(ROOT, "dist"); // deploy builds into a temp folder, then swaps
const PREVIEW = !!process.env.PREVIEW;
// links into the app (/app/...). A preview build points at the app preview copied to app/ (hash routes).
const appHref = (u) => (PREVIEW && u.startsWith("/app/") ? (process.env.APP_ORIGIN ? process.env.APP_ORIGIN + u : `{{R}}app/index.html#${u.slice(4)}`) : u);
const CSS = readFileSync(join(ROOT, "src/styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\n\s*/g, "").replace(/\s*([{};,>])\s*/g, "$1").replace(/;}/g, "}");
let JS = readFileSync(join(ROOT, "src/site.js"), "utf8");
try { const { execFileSync } = await import("node:child_process"); JS = execFileSync("esbuild", ["--minify", "--target=es2017", "--loader=js"], { input: JS, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }); } catch (e) { /* esbuild not installed: ship it unminified */ }
const hash = (s) => createHash("sha1").update(s).digest("hex").slice(0, 8);
const SITE_JS = `assets/site.${hash(JS)}.js`;
const LENIS = readFileSync(join(ROOT, "assets/vendor/lenis.min.js"), "utf8");
const LENIS_JS = `assets/lenis.${hash(LENIS)}.js`;
const MAP = readFileSync(join(ROOT, "assets/vendor/worldmap.json"), "utf8");
const MAP_JSON = `assets/worldmap.${hash(MAP)}.json`;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
const inline = (t) => esc(t)
  .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|\/)[^\s)]+)\)/g, (m, x, u) => `<a class="link" href="${u}"${/^https?:/.test(u) ? ' target="_blank" rel="noopener"' : ""}>${x}</a>`)
  .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
const mdHtml = (src, vars = {}) => String(Array.isArray(src) ? src.join("\n\n") : src || "").replace(/\r/g, "")
  .replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m)).split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => {
    const h = b.match(/^(#{2,4})\s+(.+)$/);
    if (h && !b.includes("\n")) return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
    const lines = b.split("\n");
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>`).join("")}</ol>`;
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>`).join("")}</ul>`;
    return `<p>${lines.map(inline).join("<br>")}</p>`;
  }).join("\n");
const lc = (s) => s.split(" ").map((w) => (/^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase())).join(" ");
const abs = (p) => C.domain.replace(/\/$/, "") + p;
const tel = (C.phone || "").replace(/[^\d+]/g, "");
const wa = (t) => `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(t || "Hello Dotindot, I'd like to talk about growing our business.")}`;
const today = new Date().toISOString().slice(0, 10);
const year = new Date().getFullYear();
const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
const clients = (C.clients || []).filter((c) => c && c.name);
const testimonials = (C.testimonials || []).filter((t) => t && t.quote && t.name);
const cases = (C.caseStudies || []).filter((c) => c && c.title);
const team = (C.team || []).filter((p) => p && p.name);
const PROOF_LABELS = { clientsServed: "Clients served", countries: "Countries", adSpendManaged: "Ad spend managed", leadsGenerated: "Leads generated" };
const proof = (Array.isArray(C.proof) ? C.proof : Object.entries(C.proof || {}).filter(([k, v]) => !k.startsWith("_") && v).map(([k, v]) => ({ value: v, label: PROOF_LABELS[k] || k })))
  .filter((p) => p && p.value && p.label);

const I = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>',
};
const go = (t) => `<span class="go">${esc(t)} ${I.arrow}</span>`;
// headings end with the logo's orange full stop
const stop = '<span class="stop">.</span>';
const withStop = (t) => (/[.?!]$/.test(t) ? esc(t.replace(/\.$/, "")) + (t.endsWith(".") ? stop : "") : esc(t) + stop);
const H1 = (t, cls = "h-page") => `<h1 class="${cls}">${withStop(t)}</h1>`;
const H2 = (t, cls = "h-sec") => `<h2 class="${cls}">${withStop(t)}</h2>`;
const crumbs = (items) => `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a>${items.map(([n, u]) => (u ? `<span><a href="${u}">${esc(n)}</a></span>` : `<span aria-current="page">${esc(n)}</span>`)).join("")}</nav>`;
const phero = ({ h, lead, trail = [], btns = "", cls = "" }) => `<section class="phero ${cls}"><div class="wrap">${trail.length ? crumbs(trail) : ""}${H1(h)}${lead ? `<p class="lead">${lead}</p>` : ""}${btns ? `<div class="btns">${btns}</div>` : ""}</div></section>`;

// ---------- schema ----------
const postal = (l) => (l ? { "@type": "PostalAddress", streetAddress: l.address.replace(/\s*\n\s*/g, ", "), ...(l.city ? { addressLocality: l.city } : {}), addressCountry: l.country || "IN" } : { "@type": "PostalAddress", addressCountry: "IN" });
const ORG = {
  "@context": "https://schema.org", "@type": "Organization", "@id": abs("/#org"), name: C.name, alternateName: C.shortName, url: abs("/"), logo: abs("/assets/icon-512.png"), image: abs("/assets/og.png"),
  description: "AI-first growth agency for brands worldwide: performance marketing, social media and content, SEO and AI search, websites and apps, brand and video, AI agents and automation.",
  email: C.email, telephone: C.phone, areaServed: "Worldwide", address: postal(locations.find((l) => l.hq) || locations[0]),
  ...(locations.length ? { location: locations.map((l) => ({ "@type": "Place", name: `${C.name}, ${l.name}`, address: postal(l), ...(l.phone ? { telephone: l.phone } : {}) })) } : {}),
  sameAs: Object.values(C.social).filter(Boolean), knowsAbout: services.map((s) => s.name).concat(["Generative engine optimisation", "Conversion rate optimisation"]),
  slogan: "Marketing that performs. Technology that scales.",
  ...(team.length ? { founder: team.filter((p) => /founder/i.test(p.role)).map((p) => ({ "@type": "Person", name: p.name, jobTitle: p.role })) } : {}),
  contactPoint: { "@type": "ContactPoint", contactType: "sales", email: C.email, telephone: C.phone, areaServed: "Worldwide", availableLanguage: ["English"] },
};
const SITE = { "@context": "https://schema.org", "@type": "WebSite", "@id": abs("/#site"), url: abs("/"), name: C.name, publisher: { "@id": abs("/#org") }, inLanguage: "en" };
const crumbsLd = (items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map(([name, url], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(url) })) });
const faqLd = (qa) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });
const reviewLd = () => (testimonials.length ? [{ "@context": "https://schema.org", "@type": "ItemList", name: "Client testimonials", itemListElement: testimonials.map((t, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "Review", reviewBody: t.quote, author: { "@type": "Person", name: t.name }, itemReviewed: { "@id": abs("/#org") } } })) }] : []);

// ---------- layout ----------
const NAV = [["/", "Home"], ["/services/", "Services"], ["/about/", "About"], ["/insights/", "Insights"], ["/contact/", "Contact"]];
const current = (path, p) => (p === "/" ? path === "/" : path.startsWith(p));
function header(path) {
  const items = NAV.map(([p, l]) => {
    const cur = current(path, p) ? ' aria-current="page"' : "";
    if (p !== "/services/") return `<li><a class="nav-link" href="${p}"${cur}>${l}</a></li>`;
    return `<li class="has-mega"><a class="nav-link" href="/services/"${cur} aria-haspopup="true" aria-expanded="false" aria-controls="mega">Services ${I.chev}</a>
<div class="mega" id="mega"><div class="mega-in"><div class="mega-intro"><h2>What we do</h2><p>Six disciplines under one roof, planned together and measured on the same numbers.</p><a class="go" href="/services/">All services ${I.arrow}</a></div>
<div class="mega-grid">${services.map((s) => `<a href="/services/${s.slug}/"><b>${esc(s.name)}</b><span>${esc(s.short)}</span></a>`).join("")}</div></div></div></li>`;
  }).join("");
  return `<header class="hdr" data-hdr><div class="wrap hdr-in">
<a class="logo" href="/" aria-label="${esc(C.name)} home"><img src="/assets/wordmark-color.svg" alt="dotindot." width="128" height="25"></a>
<nav class="nav" aria-label="Main"><ul>${items}</ul></nav>
<div class="hdr-act"><button class="ask-dot" type="button" data-chat>${dotMark}<span>Ask Dot</span></button><a class="btn sm" href="/free-audit/">Get a free audit</a></div>
<button class="burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mnav">${I.menu}</button>
</div></header>
<div class="mnav" id="mnav" aria-hidden="true">
<div class="mnav-top"><a class="logo" href="/" aria-label="${esc(C.name)} home"><img src="/assets/wordmark-color.svg" alt="dotindot." width="128" height="25"></a><button class="mnav-close" type="button" aria-label="Close menu">×</button></div>
<nav aria-label="Menu">${NAV.map(([p, l]) => (p === "/services/" ? `<details><summary>Services ${I.chev}</summary><div><a href="/services/">All services</a>${services.map((s) => `<a href="/services/${s.slug}/">${esc(s.name)}</a>`).join("")}</div></details>` : `<a href="${p}"${current(path, p) ? ' aria-current="page"' : ""}>${l}</a>`)).join("")}</nav>
<div class="mnav-foot"><a class="btn" href="/free-audit/">Get a free growth audit</a><p><a href="mailto:${C.email}">${C.email}</a><a href="${wa()}" target="_blank" rel="noopener">WhatsApp</a><a href="#" data-chat>Ask Dot</a></p></div>
</div>`;
}

function footer() {
  const soc = Object.entries(C.social).filter(([, v]) => v).map(([k, v]) => `<li><a href="${v}" target="_blank" rel="noopener me">${({ x: "X", linkedin: "LinkedIn", youtube: "YouTube", instagram: "Instagram" })[k] || k[0].toUpperCase() + k.slice(1)}</a></li>`).join("");
  return `<footer class="ftr"><div class="wrap">
<div class="ftr-grid">
<div class="ftr-brand"><img src="/assets/wordmark-color.svg" alt="dotindot." width="150" height="29"><p>${esc(C.name)} is an AI-first growth agency for brands worldwide: marketing that performs and technology that scales.</p>
<div class="contact"><a href="mailto:${C.email}">${C.email}</a><a href="tel:${tel}">${esc(C.phoneDisplay)}</a><a href="${wa()}" target="_blank" rel="noopener">WhatsApp</a></div>
${locations.length ? `<p class="ftr-offices"><a href="/contact/#offices">Offices</a>: ${locations.map((l) => esc(l.name)).join(", ")}</p>` : ""}</div>
<div><h3>Services</h3><ul>${services.map((s) => `<li><a href="/services/${s.slug}/">${esc(s.name)}</a></li>`).join("")}</ul></div>
<div><h3>Company</h3><ul><li><a href="/about/">About</a></li><li><a href="/clients/">Clients</a></li><li><a href="/process/">How we work</a></li><li><a href="/insights/">Insights</a></li><li><a href="/careers/">Careers</a></li><li><a href="/contact/">Contact</a></li></ul></div>
<div><h3>Resources</h3><ul><li><a href="/free-audit/">Free growth audit</a></li><li><a href="/speed-test/">Website speed test</a></li><li><a href="/growth-score/">Marketing health check</a></li></ul><h3 style="margin-top:28px">Follow</h3><ul>${soc}</ul></div>
<div><h3>Markets</h3><ul>${markets.map((m) => `<li><a href="/markets/${m.slug}/">${esc(m.country)}</a></li>`).join("")}</ul></div>
</div>
<div class="ftr-bot">
<span>© ${year} ${esc(C.name)}</span>
<nav aria-label="Legal"><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="/llms.txt">llms.txt</a></nav>
<span class="logins"><a href="${appHref(C.clientLogin)}" rel="nofollow">${I.user} Client login</a></span>
</div>
</div></footer>`;
}

const INDEX = [];
const href = (p) => "{{R}}" + p.replace(/^\//, "") + (PREVIEW && p.endsWith("/") ? "index.html" : "");
const CHAT_LINKS = Object.fromEntries([["/free-audit/", "Get a free growth audit"], ["/contact/", "Talk to a specialist"], ["/services/", "All services"], ["/process/", "How we work"],
  ["/speed-test/", "Test your website speed"], ["/growth-score/", "Take the marketing health check"], ["/insights/", "Read our insights"], ["/clients/", "Who we work with"], ["/markets/", "Markets we serve"], ["/about/", "About Dotindot"],
  ...services.map((x) => [`/services/${x.slug}/`, x.name]), ...markets.map((m) => [`/markets/${m.slug}/`, `Working with brands in ${m.name}`]),
  ...insights.map((a) => [`/insights/${a.slug}/`, a.title])].map(([p, t]) => [p, [t, href(p)]]));
const chatHint = (path) => {
  const sv = services.find((x) => path === `/services/${x.slug}/`), mk = markets.find((m) => path === `/markets/${m.slug}/`);
  if (sv) return `Questions about ${lc(sv.name)}? Ask me — I reply in seconds.`;
  if (mk) return `Growing in ${mk.name}? Ask me how we work with brands there.`;
  if (/^\/insights\/[^/]+\/$/.test(path)) return "Want this applied to your business? Ask me how.";
  if (path === "/speed-test/") return "Slow site? Ask me what we'd fix first.";
  if (path === "/growth-score/") return "Want help improving your score? Ask me.";
  return "Hi, I'm Dot! Want a few quick ideas to grow your brand? Ask me anything.";
};
function layout({ path, title, desc, body, ld = [], noindex = false, type = "website", fullTitle, og = "", ogImage = "", crumbs: trail = null }) {
  const url = abs(path);
  const t0 = fullTitle || `${title} — ${C.name}`, ov = (SEO.pages || {})[path] || {};
  if (!noindex) INDEX.push({ path, title: t0, description: desc, kind: type === "article" ? "article" : "page" });
  const t = ov.title || t0;
  desc = ov.description || desc;
  const ogImg = ogImage ? `/${ogImage.replace(/^\//, "")}` : og && existsSync(join(ROOT, `assets/og/${og}.jpg`)) ? `/assets/og/${og}.jpg` : "/assets/og.png";
  const page = { "@context": "https://schema.org", "@type": path.startsWith("/contact") ? "ContactPage" : path.startsWith("/about") ? "AboutPage" : "WebPage", "@id": url + "#webpage", url, name: t, description: desc, inLanguage: "en", isPartOf: { "@id": abs("/#site") }, about: { "@id": abs("/#org") }, primaryImageOfPage: abs(ogImg), speakable: { "@type": "SpeakableSpecification", cssSelector: ["h1", ".lead"] }, ...(trail ? { breadcrumb: crumbsLd(trail) } : {}) };
  const verify = [C.verify && C.verify.google ? `<meta name="google-site-verification" content="${esc(C.verify.google)}">` : "", C.verify && C.verify.bing ? `<meta name="msvalidate.01" content="${esc(C.verify.bing)}">` : ""].join("");
  const ga = C.ga4 ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${C.ga4}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${C.ga4}',{anonymize_ip:true})</script>` : "";
  const cfg = { intake: C.leadIntakeUrl, whatsapp: C.whatsapp, email: C.email, preview: PREVIEW, psiKey: C.pageSpeedApiKey || "",
    chat: CHAT.enabled ? { api: "/api/chat", name: CHAT.name || "Dot", greeting: CHAT.greeting || "", privacy: href("/privacy/"), hint: chatHint(path), links: CHAT_LINKS } : null };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(t)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="${noindex ? "noindex,follow" : "index,follow,max-image-preview:large,max-snippet:-1"}">
<meta name="color-scheme" content="light only"><meta name="theme-color" content="#ffffff">
<link rel="icon" href="/favicon.ico?v=3" sizes="48x48"><link rel="icon" href="/assets/favicon.svg?v=3" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3"><link rel="manifest" href="/manifest.webmanifest">
<link rel="alternate" hreflang="en" href="${url}"><link rel="alternate" hreflang="x-default" href="${url}"><link rel="alternate" type="text/plain" title="LLM summary" href="/llms.txt">${verify}
<meta property="og:type" content="${type}"><meta property="og:site_name" content="${esc(C.name)}"><meta property="og:title" content="${esc(t)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${abs(ogImg)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(C.name)}: ${esc(title || "Marketing that performs. Technology that scales.")}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(t)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${abs(ogImg)}"><meta property="og:locale" content="en_GB">
<link rel="preload" href="/assets/fonts/schibsted.woff2" as="font" type="font/woff2" crossorigin>
<script>document.documentElement.classList.add("js");setTimeout(function(){if(!window.__ddReady)document.documentElement.classList.remove("js")},4000)</script>
<script>addEventListener("pagereveal",function(e){if(!e.viewTransition)return;try{var p=JSON.parse(sessionStorage.getItem("dd_vt")||"null");sessionStorage.removeItem("dd_vt");if(p){var s=document.documentElement.style;s.setProperty("--vx",p[0]+"px");s.setProperty("--vy",p[1]+"px")}}catch(x){}})</script>
<style>${CSS}</style>
${[ORG, SITE, ...(noindex ? [] : [page]), ...ld].map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n")}
${ga}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${header(path)}
<main id="main" tabindex="-1">
${body}
</main>
${footer()}
<script>window.__DD=${JSON.stringify(cfg)}</script>
<script defer src="/${LENIS_JS}"></script>
<script defer src="/${SITE_JS}"></script>
</body></html>`;
}

// ---------- shared blocks ----------
const interestOpts = (pre) => services.map((s) => [s.name, s.slug]).concat([["Not sure yet", ""]])
  .map(([l, s]) => `<option${pre && pre === s ? " selected" : ""}>${esc(l)}</option>`).join("");
const budgetSel = `<select name="budget" data-budget><option value="">Prefer not to say</option><option>Under $1,500 a month</option><option>$1,500 – $5,000 a month</option><option>$5,000 – $15,000 a month</option><option>$15,000+ a month</option><option>A one-off project</option></select>`;
const leadForm = (id, { pre = "", next = "/thanks/", button = "Send enquiry", website = false } = {}) => `<form class="form" data-lead="${id}" data-next="${next}" novalidate>
<label>Name<input name="name" autocomplete="name" required></label>
<label>Company<input name="company" autocomplete="organization"></label>
<label>Work email<input name="email" type="email" inputmode="email" autocomplete="email"></label>
<label>Phone or WhatsApp<input name="phone" type="tel" inputmode="tel" autocomplete="tel"></label>
${website ? '<label class="full">Website or main social account<input name="website" inputmode="url" placeholder="https://"></label>' : ""}
<label>What do you need?<select name="interest">${interestOpts(pre)}</select></label>
<label><span>Monthly budget</span>${budgetSel}</label>
<label class="full"><span>Tell us about your goals <small>(optional)</small></span><textarea name="message" rows="4"></textarea></label>
<label class="hp" aria-hidden="true">Leave this empty<input name="website_url_hp" tabindex="-1" autocomplete="off"></label>
<div class="full form-foot"><button class="btn" type="submit">${esc(button)}</button><span class="fine">A specialist replies within one working day.</span><p class="status" role="status" aria-live="polite"></p></div>
</form>`;
const dotMark = '<svg class="dface" viewBox="0 0 140 179" aria-hidden="true"><path class="d-body" d="M0 0H50.5A89.5 89.5 0 0 1 50.5 179H0Z"/><g class="d-eye"><circle class="d-white" cx="52.5" cy="89.5" r="36"/><g class="d-look"><circle class="d-pupil" cx="52.5" cy="89.5" r="15.5"/><circle class="d-glint" cx="58.5" cy="83" r="4.6"/></g></g></svg>';
const talk = (id, { title = "Let's talk about your growth", text = "Tell us where you want your business to be in twelve months. A senior specialist replies within one working day, in your time zone.", pre = "", cls = "" } = {}) => `<section class="sec rule ${cls}" id="talk"><div class="wrap talk">
<div class="talk-aside">${H2(title)}<p class="lead">${esc(text)}</p>
<div class="direct"><a href="mailto:${C.email}">${C.email}<span>Email</span></a><a href="${wa()}" target="_blank" rel="noopener">WhatsApp<span>Chat now</span></a><a href="tel:${tel}">${esc(C.phoneDisplay)}<span>Call</span></a></div>
${CHAT.enabled ? `<p class="talk-dot"><button class="ask-dot" type="button" data-chat>${dotMark}<span>Or ask Dot, our assistant — answers in seconds</span></button></p>` : ""}</div>
<div data-reveal>${leadForm(id, { pre })}</div>
</div></section>`;
const faqBlock = (qa) => `<div class="faq">${qa.map(([q, a]) => `<details><summary>${esc(q)}<i aria-hidden="true"></i></summary><div class="ans"><p>${esc(a)}</p></div></details>`).join("")}</div>`;
const faqSec = (title, qa, cls = "") => `<section class="sec ${cls}"><div class="wrap two"><div>${H2(title)}</div><div data-reveal>${faqBlock(qa)}</div></div></section>`;
const svcGrid = (n = 4) => `<div class="svc-grid" data-reveal-group>${services.map((s) => `<article class="svc" data-reveal><h3><a href="/services/${s.slug}/">${esc(s.name)}</a></h3><p class="tag">${esc(s.tagline)}</p><p>${esc(s.short)}</p><ul>${s.highlights.slice(0, n).map((d) => `<li>${esc(d)}</li>`).join("")}</ul>${go("Explore")}</article>`).join("")}</div>`;
const logoWall = () => {
  if (!clients.length) return PREVIEW ? `<div class="ph"><b>Client logos</b>Add real clients in the app → Website → Clients. They appear here with their logo and a short description.</div>` : "";
  const rest = (4 - (clients.length % 4)) % 4 || 4;
  return `<ul class="logos" data-reveal>${clients.map((c) => `<li>${c.logo ? `<img src="/${esc(c.logo.replace(/^\//, ""))}" alt="${esc(c.name)}" loading="lazy">` : `<b>${esc(c.name)}</b>`}${c.industry ? `<span>${esc(c.industry)}</span>` : ""}${c.description ? `<p>${esc(c.description)}</p>` : ""}</li>`).join("")}
<li class="cta-cell" style="--span:${rest}"><b>Your brand</b><span><a class="link" href="/contact/">Start a project</a></span></li></ul>`;
};
const certStrip = () => (certs.length ? `<div class="certs" data-reveal><p class="label">Certifications and partnerships</p><ul>${certs.map((c) => {
  const inner = c.logo ? `<img src="/${esc(c.logo.replace(/^\//, ""))}" alt="${esc(c.name)}" loading="lazy">` : `<b>${esc(c.name)}</b>`;
  return `<li title="${esc(c.name)}">${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${inner}</a>` : inner}</li>`;
}).join("")}</ul></div>` : "");
const mapsUrl = (l) => l.map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([C.name, l.address.replace(/\n/g, ", "), l.city, l.country].filter(Boolean).join(", "))}`;
const officesBlock = () => (locations.length ? `<section class="sec" id="offices"><div class="wrap"><div class="shead">${H2(locations.length > 1 ? "Our offices" : "Our office")}<p data-reveal>Visit us, call the office nearest you, or write to any of us: every office works with brands worldwide.</p></div>
<div class="offices" data-reveal-group>${locations.map((l) => `<article class="office" data-reveal><h3>${esc(l.name)}${l.hq ? '<span class="hq">Head office</span>' : ""}</h3>
<address>${esc(l.address).replace(/\n/g, "<br>")}${l.city || l.country ? `<br>${esc([l.city, l.country].filter(Boolean).join(", "))}` : ""}</address>
<p class="o-links">${l.phone ? `<a href="tel:${esc(l.phone.replace(/[^\d+]/g, ""))}">${esc(l.phone)}</a>` : ""}${l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : ""}</p>
${l.hours ? `<p class="o-hours">${esc(l.hours)}</p>` : ""}<a class="go" href="${esc(mapsUrl(l))}" target="_blank" rel="noopener">Directions ${I.arrow}</a></article>`).join("")}</div></div></section>` : "");
const quoteBlock = () => {
  if (!testimonials.length) return PREVIEW ? `<div class="quotes"><div class="ph"><b>Client testimonials</b>Real quotes appear here once added in the app → Website → Testimonials, with the client's permission. Nothing is shown until then.</div></div>` : "";
  const many = testimonials.length > 1;
  return `<div class="quotes"${many ? ` data-n="${testimonials.length}"` : ""} aria-roledescription="carousel" aria-label="Client testimonials">${testimonials.map((t, i) => `<figure class="quote${i ? "" : " on"}"><blockquote>${esc(t.quote)}</blockquote><figcaption>${t.photo ? `<img class="mono" src="/${esc(t.photo.replace(/^\//, ""))}" alt="" loading="lazy" width="48" height="48">` : `<span class="mono" aria-hidden="true">${initials(t.name)}</span>`}<span><b>${esc(t.name)}</b><span>${esc([t.role, t.company].filter(Boolean).join(", "))}</span></span></figcaption></figure>`).join("")}
${many ? `<div class="q-nav"><button class="prev" type="button" aria-label="Previous testimonial">${I.arrow}</button><button class="next" type="button" aria-label="Next testimonial">${I.arrow}</button></div>` : ""}</div>`;
};
const caseList = () => (cases.length ? `<div class="cases" data-reveal>${cases.map((c) => `<article class="case"><div><b>${esc(c.client)}</b></div><div class="res">${esc(c.result || "")}</div><div><h3 class="h-mid">${esc(c.title)}</h3><p class="muted">${esc(c.summary || "")}</p></div></article>`).join("")}</div>` : "");
const teamGrid = () => (team.length ? `<div class="team" data-reveal>${team.map((p) => `<article class="person"><div class="pic">${p.photo ? `<img src="/${esc(p.photo.replace(/^\//, ""))}" alt="${esc(p.name)}" loading="lazy">` : `<span aria-hidden="true">${initials(p.name)}</span>`}</div><h3>${esc(p.name)}</h3><p>${esc(p.role)}</p>${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ""}${p.linkedin ? `<a class="link" href="${esc(p.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ""}</article>`).join("")}</div>` : "");
const whyGrid = () => `<div class="why" data-reveal>${whyUs.map(([h, p]) => `<div><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("")}</div>`;
const stepsBlock = () => `<div class="steps" data-steps><div class="steps-line" aria-hidden="true"><i></i></div>${steps.map((s) => `<article class="step" data-reveal><span class="n">${s.n}</span><h3>${esc(s.title)}</h3><span class="when">${esc(s.when)}</span><p>${esc(s.text)}</p></article>`).join("")}</div>`;
const fmtDate = (d, long) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: long ? "long" : "short", year: "numeric" });
const postCards = (list, cls = "cols") => `<div class="posts ${cls}">${list.map((a) => `<article class="post" data-reveal><time datetime="${a.date}">${fmtDate(a.date)}</time><h3><a href="/insights/${a.slug}/">${esc(a.title)}</a></h3><p>${esc(a.summary)}</p>${cls === "rows" ? go(`${a.minutes} min read`) : ""}</article>`).join("")}</div>`;
const CLOCKS = markets.filter((m) => m.tz !== "Asia/Kolkata").map((m) => [m.city, m.tz]).concat([["India (HQ)", "Asia/Kolkata"]]);
const clocks = () => `<div class="clocks" data-reveal>${CLOCKS.map(([n, z]) => `<div class="clock" data-tz="${z}"><b>--:--</b><span><i></i>${esc(n)}</span></div>`).join("")}</div>`;
const quizBlock = (id) => `<div class="quiz" data-quiz="${id}">
<div class="qz-top"><div class="qz-bar" aria-hidden="true"><i style="width:0"></i></div><span class="qz-count">1 of ${quiz.length}</span></div>
<div class="qz-body"><p class="qz-q">${esc(quiz[0].q)}</p><div class="qz-opts">${quiz[0].a.map(([l]) => `<button type="button">${esc(l)}</button>`).join("")}</div></div>
<script type="application/json" class="qz-data">${JSON.stringify(quiz)}</script>
</div>`;
const speedBlock = () => `<div class="panel" data-speed>
<form class="inline-form sp-form" novalidate><label class="sr" for="sp-url">Website address</label><input id="sp-url" name="url" type="url" inputmode="url" autocomplete="url" placeholder="yourbrand.com" required><button class="btn" type="submit">Test my website</button></form>
<p class="fine" style="margin-top:12px">Takes 15–40 seconds. Powered by Google PageSpeed Insights. Nothing is stored unless you ask for the fix list.</p>
<div class="sp-out" aria-live="polite"></div>
</div>`;

// ---------- pages ----------
const pages = [];
const add = (p, html) => pages.push([p, html]);

// home: the signature scroll story
// 1) the hero's last full stop swells into an orange field (site.js), 2) the statement lights word by word and
// its own full stop grows into white (dot in dot), 3) the services reel: one field of dots reshapes itself for each service.
const STATEMENT = "Every account is run by senior specialists: strategists, engineers and creatives who plan, build and grow your brand as one team. No hand-offs. No juniors learning on your budget.";
const statement = () => {
  const words = STATEMENT.replace(/\.$/, "").split(" ");
  return `<section class="statement" data-statement aria-label="Who you work with"><div class="st-stage"><div class="wrap"><p class="st-text">${words.map((w, i) => `<span class="w">${esc(w)}${i === words.length - 1 ? '<span class="st-end" data-st-end></span><span class="sr">.</span>' : ""}</span>`).join(" ")}</p></div><div class="st-white" aria-hidden="true"></div></div></section>`;
};
const ART = { "performance-ads": "perf", "social-content": "social", "seo-ai-search": "seo", "websites-apps": "web", "brand-video": "brand", "ai-automation": "ai" };
const reel = () => `<section class="reel" id="services" data-reel style="--n:${services.length}"><div class="reel-stage"><div class="wrap reel-wrap">
<div class="reel-top">${H2("What we do")}<p>Six disciplines under one roof, planned together and measured on the same numbers: qualified leads, sales and cost per customer.</p></div>
<div class="reel-body"><ul class="reel-list">${services.map((s, i) => `<li class="reel-item${i ? "" : " cur"}" data-art="${ART[s.slug] || "perf"}"><h3><a href="/services/${s.slug}/">${esc(s.name)}</a></h3><p class="tag">${esc(s.tagline)}</p><ul>${s.highlights.slice(0, 4).map((d) => `<li>${esc(d)}</li>`).join("")}</ul><a class="go" href="/services/${s.slug}/" tabindex="-1" aria-hidden="true">Explore ${esc(lc(s.name))} ${I.arrow}</a></li>`).join("")}</ul>
<div class="reel-art" aria-hidden="true"><canvas></canvas></div></div>
<div class="reel-index" aria-hidden="true">${services.map((s, i) => `<button type="button" tabindex="-1" data-i="${i}"><i><b></b></i><span>${esc(s.name)}</span></button>`).join("")}</div>
</div></div></section>`;

const homeFaq = faqs.slice(0, 6);
const heroLines = ["Marketing that performs", "Technology that scales"];
const homeBody = `
<section class="hero" aria-labelledby="h"><div class="wrap">
<h1 id="h" class="h-hero"><span class="sr">${heroLines.join(". ")}.</span><span aria-hidden="true">${heroLines.map((l, i) => `<span class="ln"><span style="--i:${i}">${esc(l).replace(/(\S+)$/, `<span class="nw">$1<span class="dot"${i === heroLines.length - 1 ? " data-fs" : ""}></span></span>`)}</span></span>`).join("")}</span></h1>
<div class="hero-row"><div class="hero-copy">
<p class="lead">${esc(C.name)} is an AI-first growth agency. We run performance marketing, search and content, and build the websites, apps and automation behind them, for brands across the UK, Europe, North America, the Middle East, Asia-Pacific and India.</p>
<div class="btns"><a class="btn" href="/free-audit/">Get a free growth audit</a><a class="btn ghost" href="#services">Explore our services</a></div>
</div>
<div class="hero-map" data-map="/${MAP_JSON}" aria-hidden="true"><canvas></canvas></div></div>
<div class="facts">${proof.length >= 3 ? proof.slice(0, 3).map((p) => `<div><b>${esc(p.value)}</b><span>${esc(p.label)}</span></div>`).join("") : `<div><b>Six disciplines, one team</b><span>Paid media, search, content, web, brand and AI</span></div><div><b>Your hours, your currency</b><span>Quotes and invoices in ${CURS.length} currencies</span></div><div><b>A reply within one working day</b><span>From a specialist, not a ticket queue</span></div>`}</div>
</div></section>
${statement()}

${reel()}

<section class="sec mist" id="clients"><div class="wrap">
<div class="shead">${H2("Who we work with")}<p data-reveal>${esc(PG.clients_intro || "Growth-focused businesses in energy, manufacturing, retail, e-commerce and professional services, from a first serious website to multi-market growth.")}</p></div>
${logoWall()}
<ul class="industries" data-reveal aria-label="Industries">${industries.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
${quoteBlock()}
${caseList()}
</div></section>

<section class="sec" id="why"><div class="wrap">
<div class="shead">${H2("Why brands choose Dotindot")}<p data-reveal>Senior expertise, AI-first delivery and complete transparency, without the overheads of a traditional agency.</p></div>
${whyGrid()}
${certStrip()}
<div class="xp-grid">
<div data-reveal><h3 class="h-mid">Our expertise</h3><p class="muted" style="margin-top:12px;max-width:26em">One team covering every discipline your growth depends on, with the specialists working from the same plan.</p></div>
<div data-reveal><ul class="xp">${expertise.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
</div>
${team.length >= 2 ? `<div class="xp-grid"><div data-reveal><h3 class="h-mid">Leadership</h3></div><div>${teamGrid()}</div></div>` : ""}
<div class="xp-grid">
<div data-reveal><h3 class="h-mid">Platforms we work in</h3><p class="muted" style="margin-top:12px;max-width:26em">Certified tools and the platforms your customers already use. If your stack isn't listed, we have likely worked with it.</p></div>
<ul class="tools" data-reveal>${tools.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
</div>
</div></section>

<section class="sec mist"><div class="wrap">
<div class="shead">${H2("How we work")}<p data-reveal>A clear path from the first conversation to measurable growth, with fixed quotations and month-to-month terms.</p></div>
${stepsBlock()}
</div></section>

<section class="sec"><div class="wrap">
<div class="shead">${H2("Insights")}<p data-reveal>Practical thinking on performance marketing, search, AI and the web.</p></div>
${postCards(insights.slice(0, 3))}
<p style="margin-top:40px"><a class="btn ghost" href="/insights/">View all insights</a></p>
</div></section>

${faqSec("Questions, answered", homeFaq, "mist")}
${talk("home")}`;
add("/", layout({ path: "/", fullTitle: `${C.name} — AI-first growth agency: performance marketing, SEO & AI search, websites`, og: "home", title: "Marketing that performs. Technology that scales.",
  desc: "AI-first growth agency for brands worldwide: performance marketing, social media, SEO and AI search, websites and apps, brand and video, and AI automation.",
  ld: [faqLd(homeFaq), ...reviewLd()], body: homeBody }));

// services index
add("/services/", layout({ path: "/services/", title: "Services", fullTitle: `Services — performance marketing, SEO & AI search, websites, AI automation — ${C.name}`, og: "services", desc: "Performance marketing, social media and content, SEO and AI search, websites and apps, brand and video, and AI agents: one AI-first team, one plan, one dashboard.",
  crumbs: [["Home", "/"], ["Services", "/services/"]],
  ld: [crumbsLd([["Home", "/"], ["Services", "/services/"]]), { "@context": "https://schema.org", "@type": "ItemList", name: "Services", itemListElement: services.map((x, i) => ({ "@type": "ListItem", position: i + 1, url: abs(`/services/${x.slug}/`), name: x.name })) }],
  body: `${phero({ h: "Services", lead: "Six disciplines, one team and one plan. Choose what you need now and add the rest when it makes sense, with every channel reporting into the same live dashboard.", trail: [["Services"]] })}
<section class="sec tight"><div class="wrap">${svcGrid(4)}</div></section>
<section class="sec mist"><div class="wrap"><div class="shead">${H2("How engagements work")}<p data-reveal>Every engagement starts with a free audit and a fixed quotation. Retainers are month to month.</p></div>${stepsBlock()}</div></section>
${faqSec("Common questions", faqs.filter((f) => /cost|contract|working|AI/i.test(f[0])))}
${talk("services")}` }));

// service pages
services.forEach((s, idx) => {
  const others = services.filter((o) => o.slug !== s.slug).slice(idx % 2, idx % 2 + 3);
  const trail = [["Home", "/"], ["Services", "/services/"], [s.name, `/services/${s.slug}/`]];
  add(`/services/${s.slug}/`, layout({ path: `/services/${s.slug}/`, title: s.name, fullTitle: `${seoTitles[s.slug]} — ${C.name}`, desc: `${s.promise} From ${C.name}, an AI-first growth agency.`, og: `services-${s.slug}`, crumbs: trail,
    ld: [crumbsLd(trail), faqLd(s.faq), { "@context": "https://schema.org", "@type": "Service", name: s.name, serviceType: s.name, description: s.intro, provider: { "@id": abs("/#org") }, areaServed: "Worldwide", url: abs(`/services/${s.slug}/`) }],
    body: `${phero({ h: s.name, lead: esc(s.promise), trail: [["Services", "/services/"], [s.name]], btns: `<a class="btn" href="#talk">Talk to us about ${esc(lc(s.name))}</a><a class="btn ghost" href="/free-audit/">Start with a free audit</a>` })}
<section class="sec tight"><div class="wrap two">
<div data-reveal><h2 class="h-mid">${esc(s.tagline)}</h2><p class="lead" style="margin-top:16px">${esc(s.intro)}</p></div>
<div data-reveal><p class="label">What's included</p><ul class="check">${s.deliverables.map((d) => `<li>${esc(d)}</li>`).join("")}</ul></div>
</div></section>
<section class="sec mist"><div class="wrap two">
<div data-reveal>${H2("Who it's for")}<ul class="check" style="margin-top:32px">${s.fit.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>
<div data-reveal><p class="label">How it runs</p><ol class="timeline">${s.steps.map(([w, t]) => `<li><b>${esc(w)}</b><span>${esc(t)}</span></li>`).join("")}</ol></div>
</div></section>
${faqSec("Questions, answered", s.faq)}
<section class="sec tight"><div class="wrap"><p class="label">Related services</p><div class="related">${others.map((o) => `<a href="/services/${o.slug}/"><b>${esc(o.name)}</b><span>${esc(o.short)}</span></a>`).join("")}</div></div></section>
${talk(`service-${s.slug}`, { pre: s.slug, title: `Let's talk ${lc(s.name)}` })}` }));
});

// clients
add("/clients/", layout({ path: "/clients/", title: "Clients", fullTitle: `Clients and testimonials — ${C.name}`, og: "clients", desc: `The businesses ${C.name} works with, what they say about us, and the industries we know best.`,
  crumbs: [["Home", "/"], ["Clients", "/clients/"]], ld: [crumbsLd([["Home", "/"], ["Clients", "/clients/"]]), ...reviewLd()],
  body: `${phero({ h: "Clients", lead: esc(PG.clients_intro || "We work with growth-focused businesses that want marketing they can measure and technology that keeps up with them."), trail: [["Clients"]] })}
<section class="sec tight"><div class="wrap">${logoWall()}<ul class="industries" data-reveal aria-label="Industries">${industries.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>${quoteBlock()}</div></section>
${cases.length ? `<section class="sec mist"><div class="wrap"><div class="shead">${H2("Selected results")}</div>${caseList()}</div></section>` : ""}
<section class="sec ${cases.length ? "" : "mist"}"><div class="wrap"><div class="shead">${H2("Why clients stay")}<p data-reveal>Month-to-month terms mean we earn every month. These are the reasons clients give us.</p></div>${whyGrid()}</div></section>
${talk("clients", { title: "Become our next success story" })}` }));

// process
const never = ["Take a percentage of your ad spend.", "Lock you into a twelve-month contract.", "Send reports made of screenshots and jargon.", "Launch anything you haven't approved.", "Hold your accounts, code or content hostage."];
add("/process/", layout({ path: "/process/", title: "How we work", fullTitle: `How we work — audit, plan, build, grow — ${C.name}`, og: "process", desc: "Audit, plan, build, grow: how Dotindot runs the first 90 days and every month after, with fixed quotations, month-to-month retainers and a live dashboard.",
  crumbs: [["Home", "/"], ["How we work", "/process/"]],
  ld: [crumbsLd([["Home", "/"], ["How we work", "/process/"]]), { "@context": "https://schema.org", "@type": "HowTo", name: "How Dotindot runs a growth engagement", step: steps.map((x, i) => ({ "@type": "HowToStep", position: i + 1, name: x.title, text: x.text })) }],
  body: `${phero({ h: "How we work", lead: "Four steps, a fixed quotation, a live dashboard and a monthly review. Simple to follow and easy to hold us to.", trail: [["How we work"]] })}
<section class="sec tight"><div class="wrap">${stepsBlock()}</div></section>
<section class="sec mist"><div class="wrap two even">
<div data-reveal>${H2("Every month, you get")}<ul class="check" style="margin-top:32px"><li>A live dashboard you can open any time.</li><li>A monthly review with the numbers, what we learned and what's next.</li><li>Fresh creative, tests and content, planned a month ahead.</li><li>One named lead who knows your account, backed by specialists.</li><li>Replies within one working day on WhatsApp or email.</li></ul></div>
<div data-reveal>${H2("What we never do")}<ul class="check" style="margin-top:32px">${never.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>
</div></section>
${faqSec("The fine print", faqs.filter((f) => /cost|contract|working|currenc|time zone/i.test(f[0])))}
${talk("process")}` }));

// about
add("/about/", layout({ path: "/about/", title: "About", fullTitle: `About ${C.name} — an AI-first growth agency working worldwide`, og: "about", desc: "Dotindot Creative is an AI-first growth agency headquartered in India, working with brands worldwide across marketing, search, web and automation.",
  crumbs: [["Home", "/"], ["About", "/about/"]], ld: [crumbsLd([["Home", "/"], ["About", "/about/"]]), { "@context": "https://schema.org", "@type": "AboutPage", url: abs("/about/"), about: { "@id": abs("/#org") } }],
  body: `${phero({ h: "About Dotindot", lead: "An AI-first growth agency. We bring marketers, designers and engineers together with modern AI tools to help ambitious brands grow, wherever their customers are.", trail: [["About"]] })}
<section class="sec tight"><div class="wrap two">
<div data-reveal>${H2("Who we are")}</div>
<div class="lead" data-reveal><p>Most growing businesses end up managing four or five agencies: one for ads, one for the website, one for social, a freelancer for SEO. Plans drift apart and nobody owns the result.</p><p style="margin-top:1em">${esc(C.name)} was built to fix that. One team plans and runs paid media, search, content, websites and automation together, and is measured on the numbers that matter to you: qualified leads, sales and cost per customer.</p><p style="margin-top:1em">The name says what we do. Every brand online starts as a dot among millions. Our job is to make yours the one people notice, remember and choose.</p></div>
</div></section>
<section class="sec mist"><div class="wrap"><div class="shead">${H2("Why brands choose us")}</div>${whyGrid()}${certStrip()}</div></section>
<section class="sec"><div class="wrap"><div class="shead">${H2("AI-first, specialist-led")}<p data-reveal>AI makes us faster and better value. Specialists make sure the work is right. This is how the work is split.</p></div>
<div class="split" data-reveal><div class="hd"><span></span><span>AI handles</span><span>Specialists decide</span></div>${aiHuman.map(([k, a, h]) => `<div class="row"><b>${esc(k)}</b><p class="ai">${esc(a)}</p><p class="hu">${esc(h)}</p></div>`).join("")}</div></div></section>
${team.length ? `<section class="sec mist"><div class="wrap"><div class="shead">${H2("Leadership")}</div>${teamGrid()}</div></section>` : ""}
<section class="sec"><div class="wrap"><div class="shead">${H2("What we believe")}</div><div class="vals" data-reveal>${values.map(([h, p]) => `<div><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("")}</div></div></section>
<section class="sec mist"><div class="wrap two">
<div data-reveal>${H2("Built to work across borders")}</div>
<ul class="check" data-reveal><li><b>Headquartered in India, working worldwide.</b> Senior people and sensible costs, without the overheads of a city-centre office.</li><li><b>In your time zone.</b> Daily overlap with Europe, the Middle East and Asia-Pacific; early or late calls for the Americas.</li><li><b>In your currency.</b> Quotes and invoices in ${curList}.</li><li><b>One client portal.</b> Reports, approvals and invoices in one place, with the same live numbers we see.</li></ul>
</div></section>
${talk("about", { title: "Work with us" })}` }));

// contact
add("/contact/", layout({ path: "/contact/", title: "Contact", fullTitle: `Contact ${C.name} — a specialist replies within one working day`, og: "contact", desc: "Tell Dotindot about your business. A specialist replies within one working day, by email, WhatsApp or video call, in your time zone and your currency.",
  crumbs: [["Home", "/"], ["Contact", "/contact/"]], ld: [crumbsLd([["Home", "/"], ["Contact", "/contact/"]]), faqLd(faqs.slice(1, 5)), { "@context": "https://schema.org", "@type": "ContactPage", url: abs("/contact/"), about: { "@id": abs("/#org") } },
    ...locations.map((l) => ({ "@context": "https://schema.org", "@type": "ProfessionalService", name: `${C.name}, ${l.name}`, parentOrganization: { "@id": abs("/#org") }, url: abs("/contact/"), image: abs("/assets/og.png"), address: postal(l), ...(l.phone ? { telephone: l.phone } : {}), ...(l.email ? { email: l.email } : {}) }))],
  body: `${phero({ h: "Contact", lead: "Tell us about your business and what you want to achieve. A specialist replies within one working day.", trail: [["Contact"]] })}
${talk("contact", { title: "Start a conversation", text: "Share a little about your goals, or reach us directly by email, WhatsApp or phone.", cls: "tight" }).replace('class="sec rule tight"', 'class="sec tight"')}
${officesBlock()}
<section class="sec mist"><div class="wrap"><div class="shead">${H2("Working across time zones")}<p data-reveal>Our day overlaps with Europe, the Middle East and Asia-Pacific, and we hold early or late calls for the Americas.</p></div>${clocks()}</div></section>
${faqSec("Before you write", faqs.slice(1, 7))}` }));

// free audit
const auditFaq = [["Is the audit really free?", "Yes. No payment, no obligation. You keep the report whether or not you work with us."], ["What do you need from us?", "Your website, the social accounts you use and, if you run ads, read-only access or a few screenshots."], ["How long does it take?", "About five working days from when we have what we need, followed by a 30-minute call to walk you through it."], ["Will you try to sell us something?", "We'll tell you what we would do. If you want us to do it, we'll send a fixed quotation. If not, the report is yours to use with anyone."]];
add("/free-audit/", layout({ path: "/free-audit/", title: "Free growth audit", fullTitle: `Free growth audit — website, search, social and ads review — ${C.name}`, og: "free-audit", desc: "A free review of your website, search and AI-search visibility, social accounts and ads, with a written report and a 30-minute call. No obligation.",
  crumbs: [["Home", "/"], ["Free growth audit", "/free-audit/"]], ld: [crumbsLd([["Home", "/"], ["Free growth audit", "/free-audit/"]]), faqLd(auditFaq)],
  body: `${phero({ h: "Free growth audit", lead: "An independent review of your marketing: what's working, where budget is leaking and the three changes we'd make first. You keep the report either way.", trail: [["Free growth audit"]] })}
<section class="sec tight"><div class="wrap talk">
<div data-reveal><p class="label">What you'll get</p><ul class="check"><li>Website speed, mobile experience and conversion review, with the exact fixes</li><li>Google search and AI-assistant visibility: who gets cited instead of you</li><li>Social accounts: growth, content and what competitors do better</li><li>Ad accounts: tracking, wasted spend and creative fatigue</li><li>A written report and a 30-minute call in your time zone</li></ul></div>
<div class="panel" data-reveal><h2 class="h-mid" style="margin-bottom:24px">Request your audit</h2>${leadForm("free-audit", { button: "Request my free audit", website: true })}</div>
</div></section>
${faqSec("Good questions", auditFaq, "mist")}` }));

// insights
add("/insights/", layout({ path: "/insights/", title: "Insights", fullTitle: `Insights on marketing, SEO, AI search and websites — ${C.name}`, og: "insights", desc: "Practical thinking on performance marketing, SEO and AI search, websites and automation from the Dotindot team.",
  crumbs: [["Home", "/"], ["Insights", "/insights/"]],
  ld: [crumbsLd([["Home", "/"], ["Insights", "/insights/"]]), { "@context": "https://schema.org", "@type": "Blog", name: `${C.name} insights`, url: abs("/insights/"), publisher: { "@id": abs("/#org") }, blogPost: insights.map((x) => ({ "@type": "BlogPosting", headline: x.title, url: abs(`/insights/${x.slug}/`), datePublished: x.date })) }],
  body: `${phero({ h: "Insights", lead: "Practical thinking from the work: performance marketing, search, AI and the web.", trail: [["Insights"]] })}
<section class="sec tight"><div class="wrap">${postCards(insights, "rows")}</div></section>
${talk("insights", { title: "Want this done for you?" })}` }));
insights.forEach((a) => {
  const body = mdHtml(a.body);
  const trail = [["Home", "/"], ["Insights", "/insights/"], [a.title, `/insights/${a.slug}/`]];
  const more = insights.filter((x) => x.slug !== a.slug).slice(0, 3);
  const shareImg = a.image ? `/${a.image.replace(/^\//, "")}` : existsSync(join(ROOT, `assets/og/insights-${a.slug}.jpg`)) ? `/assets/og/insights-${a.slug}.jpg` : "/assets/og.png";
  add(`/insights/${a.slug}/`, layout({ path: `/insights/${a.slug}/`, title: a.title, fullTitle: a.seo_title || undefined, desc: a.seo_description || a.summary, type: "article", og: `insights-${a.slug}`, ogImage: a.image || "", crumbs: trail,
    ld: [crumbsLd(trail), { "@context": "https://schema.org", "@type": "BlogPosting", headline: a.title, description: a.summary, datePublished: a.date, dateModified: a.updated || a.date, author: { "@type": "Organization", name: C.name, url: abs("/") }, publisher: { "@id": abs("/#org") }, mainEntityOfPage: abs(`/insights/${a.slug}/`), image: abs(shareImg) }],
    body: `<article><section class="phero"><div class="wrap">${crumbs([["Insights", "/insights/"], [`${a.minutes} min read`]])}${H1(a.title)}<p class="meta">By the ${esc(C.name)} team, <time datetime="${a.date}">${fmtDate(a.date, true)}</time></p></div></section>
<section class="sec tight"><div class="wrap"><div class="prose">${body}</div></div></section></article>
<section class="sec mist"><div class="wrap"><div class="shead">${H2("More insights")}</div>${postCards(more)}</div></section>
${talk(`insight-${a.slug}`, { title: "Want this done for you?" })}` }));
});

// free tools
const toolLd = (name, url, desc) => ({ "@context": "https://schema.org", "@type": "WebApplication", name, url: abs(url), description: desc, applicationCategory: "BusinessApplication", operatingSystem: "Any (web browser)", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, provider: { "@id": abs("/#org") } });
const speedFaq = [["What does the speed test measure?", "It runs Google's PageSpeed Insights (Lighthouse) on your page as a mid-range phone on a mobile connection, and reports performance, accessibility, best practices and SEO scores plus Core Web Vitals such as Largest Contentful Paint."],
  ["Why does my score change between runs?", "Network and server conditions vary, so scores move by a few points. Look at the trend and the largest issues rather than a single number."],
  ["What's a good score?", "90 or above is good. 50–89 needs work. Below 50 is costing you visitors and rankings."],
  ["Do you store my website address?", "Only if you ask us to send the fix list. Otherwise the test runs between your browser and Google."]];
add("/speed-test/", layout({ path: "/speed-test/", title: "Free website speed test", fullTitle: `Free website speed test — Google PageSpeed score in 30 seconds — ${C.name}`, og: "speed-test",
  desc: "Test your website's speed for free with Google PageSpeed Insights: performance, SEO, accessibility and Core Web Vitals on mobile, plus a fix list if you want one.",
  crumbs: [["Home", "/"], ["Speed test", "/speed-test/"]], ld: [crumbsLd([["Home", "/"], ["Speed test", "/speed-test/"]]), toolLd("Website speed test", "/speed-test/", "Free mobile speed and SEO check powered by Google PageSpeed Insights."), faqLd(speedFaq)],
  body: `${phero({ h: "Website speed test", lead: "Every extra second of loading costs visitors and rankings. See where your site stands in about thirty seconds, then get the exact fixes if you want them.", trail: [["Speed test"]] })}
<section class="sec tight"><div class="wrap">${speedBlock()}</div></section>
${faqSec("Good to know", speedFaq, "mist")}` }));
add("/growth-score/", layout({ path: "/growth-score/", title: "Marketing health check", fullTitle: `Marketing health check — a 60-second assessment — ${C.name}`, og: "growth-score",
  desc: "Six questions, a score out of 100 and the three marketing changes that would make the biggest difference to your business. Free, no sign-up needed.",
  crumbs: [["Home", "/"], ["Marketing health check", "/growth-score/"]], ld: [crumbsLd([["Home", "/"], ["Marketing health check", "/growth-score/"]]), toolLd("Marketing health check", "/growth-score/", "A 60-second marketing assessment with a score out of 100 and prioritised recommendations.")],
  body: `${phero({ h: "Marketing health check", lead: "Six questions, about a minute. You'll get a score out of 100 and the changes that would make the biggest difference. No sign-up needed.", trail: [["Marketing health check"]] })}
<section class="sec tight"><div class="wrap">${quizBlock("page")}</div></section>
<section class="sec mist"><div class="wrap two"><div>${H2("What the score means")}</div><ul class="check" data-reveal><li><b>80–100:</b> strong foundations. The gains are in the details.</li><li><b>50–79:</b> solid, with a few changes that would make a noticeable difference to leads.</li><li><b>Below 50:</b> real upside. The first fixes are usually the fastest and least expensive.</li></ul></div></section>
${talk("growth-score", { title: "Want a full plan?" })}` }));

// markets
add("/markets/", layout({ path: "/markets/", title: "Markets", fullTitle: `International growth agency for the UK, Europe, North America, the Middle East and Asia-Pacific — ${C.name}`, og: "markets",
  desc: `Dotindot works with brands in ${markets.map((m) => m.country).slice(0, -1).join(", ")} and ${markets[markets.length - 1].country}, in your time zone, your currency and your market's rules.`,
  crumbs: [["Home", "/"], ["Markets", "/markets/"]], ld: [crumbsLd([["Home", "/"], ["Markets", "/markets/"]])],
  body: `${phero({ h: "Markets", lead: "One team, working in your hours, quoting in your currency and following your market's rules.", trail: [["Markets"]] })}
<section class="sec tight"><div class="wrap"><div class="mk-grid" data-reveal>${markets.map((m) => `<a href="/markets/${m.slug}/" data-tz="${m.tz}"><b>${esc(m.country)}</b><span>${esc(m.city)} <strong class="tm">--:--</strong>, invoiced in ${m.cur}</span></a>`).join("")}</div></div></section>
${talk("markets")}` }));
markets.forEach((m) => {
  const mfaq = m.faq.concat([faqs[4], faqs[6]]);
  const trail = [["Home", "/"], ["Markets", "/markets/"], [m.country, `/markets/${m.slug}/`]];
  add(`/markets/${m.slug}/`, layout({ path: `/markets/${m.slug}/`, title: `Growth agency for brands in ${m.name}`, fullTitle: `Digital marketing agency for ${m.country} brands — ads, SEO, AI search — ${C.name}`, og: `markets-${m.slug}`,
    desc: `AI-first growth agency for brands in ${m.name}: performance marketing, social, SEO and AI search, websites and AI automation, in ${m.name} working hours, invoiced in ${m.cur}.`,
    crumbs: trail,
    ld: [crumbsLd(trail), faqLd(mfaq), { "@context": "https://schema.org", "@type": "Service", name: `Digital marketing for brands in ${m.country}`, serviceType: "Digital marketing", provider: { "@id": abs("/#org") }, areaServed: { "@type": "Country", name: m.country }, availableChannel: { "@type": "ServiceChannel", serviceUrl: abs(`/markets/${m.slug}/`) }, offers: { "@type": "Offer", priceCurrency: m.cur, description: `Fixed quotations in ${m.cur}` } }],
    body: `${phero({ h: `Marketing for brands in ${m.name}`, lead: `Performance marketing, search, content, websites and automation for brands in ${m.name}, delivered in your working hours and invoiced in ${m.cur}.`, trail: [["Markets", "/markets/"], [m.country]], btns: `<a class="btn" href="#talk">Talk to us</a><a class="btn ghost" href="/free-audit/">Free growth audit</a>` })}
<section class="sec tight"><div class="wrap two">
<div data-reveal>${H2("Your hours, our hours")}<p class="lead" style="margin-top:20px">${esc(m.overlap)}</p>
<div class="clocks" style="grid-template-columns:1fr 1fr;max-width:480px;margin-top:28px"><div class="clock" data-tz="${m.tz}"><b>--:--</b><span><i></i>${esc(m.city)}</span></div><div class="clock" data-tz="Asia/Kolkata"><b>--:--</b><span><i></i>India (HQ)</span></div></div></div>
<div data-reveal><p class="label">Local know-how</p><ul class="check"><li><b>Platforms:</b> ${esc(m.platforms)}</li><li><b>Rules:</b> ${esc(m.rules)}</li><li><b>Search:</b> ${esc(m.search)}</li><li><b>Billing:</b> fixed quotations and invoices in ${m.cur}, never a percentage of your ad spend.</li></ul></div>
</div></section>
<section class="sec mist"><div class="wrap"><div class="shead">${H2(`What we run for brands in ${m.name}`)}<p data-reveal>Choose one service or combine them. Every channel reports into the same live dashboard.</p></div>${svcGrid()}</div></section>
${faqSec(`Questions from ${m.name}`, mfaq)}
${talk(`market-${m.slug}`, { title: `Let's grow your brand in ${m.name}` })}` }));
});

// careers
add("/careers/", layout({ path: "/careers/", title: "Careers", fullTitle: `Careers — marketing, content and engineering roles — ${C.name}`, og: "careers", desc: "Work at Dotindot: roles in performance marketing, content, engineering and AI automation, with clients around the world.",
  crumbs: [["Home", "/"], ["Careers", "/careers/"]], ld: [crumbsLd([["Home", "/"], ["Careers", "/careers/"]])],
  body: `${phero({ h: "Careers", lead: "Real clients around the world, modern AI tools and a team that values craft and clear thinking.", trail: [["Careers"]] })}
<section class="sec tight"><div class="wrap"><p class="label">Open roles</p><div class="roles">${careers.map((r) => `<div class="role" data-reveal><h3>${esc(r.title)}<span class="pl">${esc(r.place)}</span></h3><p>${esc(r.text)}</p><a class="btn sm ghost" href="mailto:${C.email}?subject=${encodeURIComponent("Application: " + r.title)}">Apply</a></div>`).join("")}</div>
<p class="lead" data-reveal style="margin-top:40px">Don't see your role? Write to <a class="link" href="mailto:${C.email}?subject=${encodeURIComponent("Open application")}">${C.email}</a> with what you do best and a link to your work.</p></div></section>` }));

// thanks, legal, 404
add("/thanks/", layout({ path: "/thanks/", title: "Thank you", desc: "We've received your message.", noindex: true,
  body: `<section class="phero center"><div class="wrap">${H1("Thank you")}<p class="lead">We've received your message. Here's what happens next.</p>
<ol class="timeline" style="margin-top:36px;max-width:640px"><li><b>Today</b><span>A specialist reads your note.</span></li><li><b>Within one working day</b><span>We reply by email or WhatsApp with a few questions or a time for a call.</span></li><li><b>Before the call</b><span>We review your website, search and social presence so the conversation is useful from the first minute.</span></li></ol>
<div class="btns" style="margin-top:40px"><a class="btn" href="/">Back to home</a><a class="btn ghost" href="/insights/">Read our insights</a></div></div></section>` }));
const LEGAL_VARS = { name: C.name, email: C.email, domain: C.domain.replace(/^https?:\/\//, "") };
const legal = (key, h, desc, fullTitle) => add(`/${key}/`, layout({ path: `/${key}/`, title: h, fullTitle, desc,
  body: `${phero({ h })}<section class="sec tight"><div class="wrap prose">
<p class="meta" style="margin-top:0">Last updated ${fmtDate(PG[`${key}_updated`] || "2026-11-09", true)}</p>
${mdHtml(PG[key] || PAGES0[key], LEGAL_VARS)}</div></section>` }));
legal("privacy", "Privacy policy", "What Dotindot collects through this website and the chat assistant, why, and how to ask us to change or delete it.", `Privacy policy — ${C.name}`);
legal("terms", "Terms of use", "Terms of use for the Dotindot website: what the content is for, what we promise and who owns what.", `Terms of use — ${C.name}`);
add("/404.html", layout({ path: "/404.html", title: "Page not found", desc: "That page doesn't exist.", noindex: true,
  body: `<section class="phero center"><div class="wrap">${H1("Page not found")}<p class="lead">The page you're looking for has moved or no longer exists.</p><div class="btns"><a class="btn" href="/">Back to home</a><a class="btn ghost" href="/services/">Our services</a><a class="btn ghost" href="/contact/">Contact us</a></div></div></section>` }));

// ---------- write ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "assets/fonts"), { recursive: true });
for (const f of ["favicon.svg", "app-icon.svg", "icon-192.png", "icon-512.png", "og.png", "wordmark-color.svg", "wordmark-white.svg", "mark-color.svg"]) cpSync(join(ROOT, "assets", f), join(OUT, "assets", f));
for (const f of ["favicon.ico", "apple-touch-icon.png"]) cpSync(join(ROOT, "assets", f), join(OUT, f)); // browsers and iOS ask for these at the root
cpSync(join(ROOT, "assets/fonts"), join(OUT, "assets/fonts"), { recursive: true });
if (existsSync(join(ROOT, "assets/og"))) cpSync(join(ROOT, "assets/og"), join(OUT, "assets/og"), { recursive: true });
for (const d of ["clients", "team"]) if (existsSync(join(ROOT, "assets", d))) cpSync(join(ROOT, "assets", d), join(OUT, "assets", d), { recursive: true });
if (existsSync(MEDIA)) cpSync(MEDIA, join(OUT, "media"), { recursive: true }); // editor uploads (the app also serves them live at /media/)
writeFileSync(join(OUT, SITE_JS), JS); writeFileSync(join(OUT, LENIS_JS), LENIS); writeFileSync(join(OUT, MAP_JSON), MAP);

function relativise(html, p) {
  if (!PREVIEW) return html;
  const depth = p.split("/").length - 2;
  const pre = depth > 0 ? "../".repeat(depth) : "./";
  return html.replace(/(href|src|data-map)="\/((?!\/)[^"#?]*)([#?][^"]*)?"/g, (m, attr, path, tail) => {
    if (/^(assets|media)\//.test(path) || /\.[a-z0-9]{2,12}$/i.test(path)) return `${attr}="${pre}${path}${tail || ""}"`;
    return `${attr}="${pre}${path}${path && !path.endsWith("/") ? "/" : ""}index.html${tail || ""}"`;
  }).replace(/url\(\{\{R\}\}/g, `url(${pre}`).replace(/\{\{R\}\}/g, pre).replace(/data-next="\/([^"]*)"/g, (m, path) => `data-next="${pre}${path}index.html"`);
}
for (const [p, h] of pages) {
  let html = h;
  html = PREVIEW ? relativise(html, p) : html.replace(/\{\{R\}\}/g, "/");
  const file = p.endsWith(".html") ? join(OUT, p) : join(OUT, p, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

const live = pages.map(([p]) => p).filter((p) => !p.endsWith(".html") && p !== "/thanks/");
writeFileSync(join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${live.map((p) => `<url><loc>${abs(p)}</loc><lastmod>${today}</lastmod><changefreq>${p === "/" ? "weekly" : "monthly"}</changefreq><priority>${p === "/" ? "1.0" : p.split("/").length <= 3 ? "0.8" : "0.6"}</priority></url>`).join("\n")}\n</urlset>\n`);
{
  const rules = "Allow: /\nDisallow: /app/\nDisallow: /api/\nDisallow: /thanks/\n";
  const ai = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "Applebot-Extended"];
  writeFileSync(join(OUT, "robots.txt"), `User-agent: *\n${rules}\n# AI assistants are welcome. Start at /llms.txt\n${ai.map((b) => `User-agent: ${b}\n`).join("")}${rules}\nSitemap: ${abs("/sitemap.xml")}\n`);
}
const LLMS = `# ${C.name}\n\n> ${C.name} (dotindot) is an AI-first growth agency headquartered in India that works with brands worldwide. Services: ${services.map((s) => s.name.toLowerCase()).join(", ")}. Quotes and invoices in ${curList}. Contact: ${C.email}.${locations.length ? ` Offices: ${locations.map((l) => [l.name, l.city].filter((v, i, a) => v && a.indexOf(v) === i).join(", ")).join("; ")}.` : ""}\n\nHow it works: a free growth audit, a fixed quotation (never a percentage of ad spend), month-to-month retainers, a live client dashboard and a monthly review. AI handles drafting, monitoring and analysis; people make every client-facing decision.\n\n## Services\n${services.map((s) => `- [${s.name}](${abs(`/services/${s.slug}/`)}): ${s.short}`).join("\n")}\n\n## Company\n- [About](${abs("/about/")}): who we are and how we're set up\n- [Clients](${abs("/clients/")}): who we work with${clients.length ? " (" + clients.map((c) => c.name).join(", ") + ")" : ""}\n- [How we work](${abs("/process/")}): audit, plan, build, grow\n- [Free growth audit](${abs("/free-audit/")}): what's included and how to request one\n- [Contact](${abs("/contact/")})\n- [Careers](${abs("/careers/")})\n\n## Markets\n${markets.map((m) => `- [${m.country}](${abs(`/markets/${m.slug}/`)}): marketing for brands in ${m.name}, invoiced in ${m.cur}`).join("\n")}\n\n## Free tools\n- [Website speed test](${abs("/speed-test/")}): Google PageSpeed score and Core Web Vitals in about 30 seconds\n- [Marketing health check](${abs("/growth-score/")}): a 60-second marketing assessment\n\n## Insights\n${insights.map((a) => `- [${a.title}](${abs(`/insights/${a.slug}/`)}): ${a.summary}`).join("\n")}\n\n## Optional\n- [Full text of the site](${abs("/llms-full.txt")})\n`;
writeFileSync(join(OUT, "llms.txt"), (PG.llms || "").trim() ? PG.llms.trim() + "\n" : LLMS);
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<header[\s\S]*?<\/header>|<footer[\s\S]*?<\/footer>|<svg[\s\S]*?<\/svg>|<template[\s\S]*?<\/template>|<span aria-hidden="true">[\s\S]*?<\/span><\/h[12]>/g, (m) => (m.startsWith("<span aria-hidden") ? "" : "")).replace(/<div class="mnav"[\s\S]*?<\/nav>/g, "").replace(/<h([1-3])[^>]*>/g, (m, n) => `\n${"#".repeat(+n)} `).replace(/<li[^>]*>/g, "\n- ").replace(/<\/p>|<\/h[1-3]>|<br\s*\/?>|<\/summary>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
writeFileSync(join(OUT, "llms-full.txt"), `# ${C.name} — full site text\n` + pages.filter(([p]) => live.includes(p)).map(([p, h]) => `\n\n---\nURL: ${abs(p)}\n\n${strip(h)}`).join(""));
writeFileSync(join(OUT, "humans.txt"), `/* TEAM */\nAgency: ${C.name}${team.length ? "\n" + team.map((p) => `${p.role}: ${p.name}`).join("\n") : ""}\nContact: ${C.email}\nFrom: India, working worldwide\n\n/* SITE */\nLast update: ${today}\nStandards: HTML, CSS, a little JavaScript\nFonts: Schibsted Grotesk\n`);
mkdirSync(join(OUT, ".well-known"), { recursive: true });
writeFileSync(join(OUT, ".well-known/security.txt"), `Contact: mailto:${C.email}\nExpires: ${new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10)}T00:00:00.000Z\nPreferred-Languages: en\nCanonical: ${abs("/.well-known/security.txt")}\n`);
// for the app: the page list (Website → SEO), the generated llms.txt (Website → Pages) and what the chat assistant may say
if (!PREVIEW) writeFileSync(join(ROOT, "site-index.json"), JSON.stringify({
  built_at: new Date().toISOString(), pages: INDEX, llms_generated: LLMS,
  knowledge: {
    name: C.name, domain: C.domain, tagline: "Marketing that performs. Technology that scales.",
    about: "AI-first growth agency headquartered in India, working with brands worldwide. One team plans and runs paid media, search, content, websites and automation together, measured on qualified leads, sales and cost per customer.",
    services: services.map((x) => ({ name: x.name, tagline: x.tagline, short: x.short, highlights: x.highlights, url: abs(`/services/${x.slug}/`) })),
    how_we_work: steps.map((x) => `${x.title} (${x.when}): ${x.text}`), why_us: whyUs.map(([h, t]) => `${h}: ${t}`), faqs,
    markets: markets.map((m) => ({ country: m.country, city: m.city, currency: m.cur, url: abs(`/markets/${m.slug}/`) })), currencies: CURS,
    industries, clients: clients.map((c) => [c.name, c.industry].filter(Boolean).join(" — ")),
    offices: locations.map((l) => ({ name: l.name, address: [l.address.replace(/\n/g, ", "), l.city, l.country].filter(Boolean).join(", "), phone: l.phone || "", email: l.email || "", hours: l.hours || "" })),
    contact: { email: C.email, phone: C.phoneDisplay || C.phone, whatsapp: C.whatsapp ? `https://wa.me/${C.whatsapp}` : "" },
    links: { audit: abs("/free-audit/"), contact: abs("/contact/"), speed_test: abs("/speed-test/"), health_check: abs("/growth-score/"), insights: abs("/insights/") },
    insights: insights.map((x) => ({ title: x.title, url: abs(`/insights/${x.slug}/`), summary: x.summary })),
  },
}, null, 1));
writeFileSync(join(OUT, "manifest.webmanifest"), JSON.stringify({ name: C.name, short_name: C.shortName, start_url: "/", display: "browser", background_color: "#ffffff", theme_color: "#ffffff", icons: [{ src: "/assets/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" }, { src: "/assets/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }, { src: "/assets/favicon.svg", sizes: "any", type: "image/svg+xml" }] }));
writeFileSync(join(OUT, ".htaccess"), `# dotindot.in — Apache (Hostinger)
Options -Indexes
ErrorDocument 404 /404.html
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
RewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]
RewriteRule ^ https://%1%{REQUEST_URI} [L,R=301]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^(.*[^/])$ /$1/ [L,R=301]
# old pages from the previous site
RewriteRule ^locations(/.*)?$ /about/ [L,R=301]
RewriteRule ^work/?$ /process/ [L,R=301]
RewriteRule ^thank-you/?$ /thanks/ [L,R=301]
<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
  Header set Permissions-Policy "camera=(), microphone=(), geolocation=()"
  Header set Strict-Transport-Security "max-age=31536000; includeSubDomains"
  <FilesMatch "\\.(svg|png|jpg|jpeg|webp|avif|ico)$">Header set Cache-Control "public, max-age=86400"</FilesMatch>
  <FilesMatch "(\\.[0-9a-f]{8}\\.(js|json)|\\.woff2)$">Header set Cache-Control "public, max-age=31536000, immutable"</FilesMatch>
  <FilesMatch "\\.(html|xml|txt|webmanifest)$">Header set Cache-Control "public, max-age=600, must-revalidate"</FilesMatch>
</IfModule>
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css application/javascript application/json image/svg+xml application/manifest+json
</IfModule>
<IfModule mod_mime.c>
  AddType image/svg+xml .svg
  AddType application/manifest+json .webmanifest
  AddType font/woff2 .woff2
  AddCharset UTF-8 .html .txt .xml .js .css
</IfModule>
`);
console.log(`built ${pages.length} pages → ${OUT}${PREVIEW ? " (preview)" : ""}`);
