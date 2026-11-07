// dotindot.in static site builder — `node build.mjs` → dist/. No framework. PREVIEW=1 builds relative links for a preview host.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { services, steps, aiHuman, values, faqs, jokes, insights, careers, tools, markets, quiz, seoTitles } from "./src/content.mjs";
import { scenes } from "./src/scenes.mjs";
import { existsSync } from "node:fs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const C = JSON.parse(readFileSync(join(ROOT, "site.config.json"), "utf8"));
if (process.env.INTAKE_URL) C.leadIntakeUrl = process.env.INTAKE_URL; // for local end-to-end tests
const OUT = join(ROOT, "dist");
const PREVIEW = !!process.env.PREVIEW;
const CSS = readFileSync(join(ROOT, "src/styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\n\s*/g, "").replace(/\s*([{};,>])\s*/g, "$1").replace(/;}/g, "}");
let JS = readFileSync(join(ROOT, "src/site.js"), "utf8");
try { const { execFileSync } = await import("node:child_process"); JS = execFileSync("esbuild", ["--minify", "--target=es2017", "--loader=js"], { input: JS, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }); } catch (e) { /* esbuild not installed: ship it unminified */ }
const hash = (s) => createHash("sha1").update(s).digest("hex").slice(0, 8);
const SITE_JS = `assets/site.${hash(JS)}.js`;
const LENIS = readFileSync(join(ROOT, "assets/vendor/lenis.min.js"), "utf8");
const LENIS_JS = `assets/lenis.${hash(LENIS)}.js`;
const MAP = readFileSync(join(ROOT, "assets/vendor/worldmap.json"), "utf8");
const MAP_JSON = `assets/worldmap.${hash(MAP)}.json`;

const lc = (s) => s.split(" ").map((w) => (/^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase())).join(" ");
const WM = readFileSync(join(ROOT, "assets/wordmark-color.svg"), "utf8");
const WM_PATHS = [...WM.matchAll(/<path[^>]*d="([^"]+)"/g)].map((m) => m[1]);
const WM_T = (WM.match(/<g transform="([^"]+)"/) || [])[1] || "";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
const abs = (p) => C.domain.replace(/\/$/, "") + p;
const tel = C.phone.replace(/[^\d+]/g, "");
const wa = (t) => `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(t || "Hi dotindot! I'd like to talk about growing our brand.")}`;
const today = new Date().toISOString().slice(0, 10);
const year = new Date().getFullYear();

const I = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 8h16M4 16h11"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.5 3.5A11.8 11.8 0 0 0 12 0C5.5 0 .2 5.3.2 11.8c0 2.1.5 4.1 1.6 5.9L0 24l6.5-1.7a11.8 11.8 0 0 0 5.5 1.4c6.5 0 11.8-5.3 11.8-11.8 0-3.2-1.2-6.1-3.3-8.4ZM12 21.7c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.8 1 1-3.7-.2-.4A9.8 9.8 0 0 1 2.2 11.8C2.2 6.4 6.6 2 12 2a9.8 9.8 0 0 1 9.8 9.8c0 5.4-4.4 9.9-9.8 9.9Zm5.4-7.3c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1l-.9 1.2c-.2.2-.3.2-.6.1a8 8 0 0 1-4-3.5c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5 1.9.8 2.6.9 3.6.7.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4l-.6-.3Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
  laugh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 14a4.5 4.5 0 0 0 8 0Z"/><path d="M9 9.5h.01M15 9.5h.01"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.8 2.1Z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>',
};
// service doodles (64×64, drawn not downloaded)
const DOODLE = {
  target: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="30" cy="34" r="22"/><circle cx="30" cy="34" r="13"/><circle cx="30" cy="34" r="4.5" fill="currentColor"/><path d="M30 34 54 10M46 8l8 2 2 8"/></svg>',
  social: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="14" y="6" width="36" height="52" rx="8"/><path d="M27 24v14l12-7Z" fill="currentColor"/><path d="M32 50h0"/><path d="M6 20c-3 6-3 18 0 24M58 20c3 6 3 18 0 24"/></svg>',
  search: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="27" cy="27" r="17"/><path d="m40 40 16 16"/><path d="M21 27l4 4 8-9"/><path d="M50 8l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="currentColor"/></svg>',
  web: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="10" width="52" height="40" rx="7"/><path d="M6 20h52"/><circle cx="13" cy="15" r="1.4" fill="currentColor"/><circle cx="19" cy="15" r="1.4" fill="currentColor"/><path d="m24 31-6 5 6 5M40 31l6 5-6 5M35 28l-6 16"/></svg>',
  brand: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M32 6 39 22l17 2-12.5 11.5L47 53 32 44 17 53l3.5-17.5L8 24l17-2Z"/><circle cx="32" cy="30" r="4" fill="currentColor"/></svg>',
  ai: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14h44a5 5 0 0 1 5 5v22a5 5 0 0 1-5 5H28l-11 9v-9h-7a5 5 0 0 1-5-5V19a5 5 0 0 1 5-5Z"/><circle cx="22" cy="30" r="3" fill="currentColor"/><circle cx="32" cy="30" r="3" fill="currentColor"/><circle cx="42" cy="30" r="3" fill="currentColor"/></svg>',
};

// ---------- Dot ----------
const dotSVG = () => `<svg class="dotf" viewBox="0 0 120 124" aria-hidden="true" focusable="false">
<ellipse cx="60" cy="119" rx="30" ry="4" fill="rgba(21,23,42,.13)"/>
<g class="dot-inner">
<circle cx="60" cy="60" r="56" fill="#FF831F"/>
<path d="M30 30a42 42 0 0 1 20-14" stroke="#fff" stroke-opacity=".5" stroke-width="6" stroke-linecap="round" fill="none"/>
<g class="face">
<g class="eyes-open">
<g class="eye l"><ellipse cx="43" cy="54" rx="11.5" ry="13.5" fill="#fff"/><g class="pupils"><g class="pin"><circle cx="43" cy="56" r="5.8" fill="#15172A"/><circle cx="45.2" cy="53.4" r="1.8" fill="#fff"/></g></g><path class="hearts" d="M43 62.5c-6-4-8.5-7-8.5-10a4.3 4.3 0 0 1 8.5-1.6 4.3 4.3 0 0 1 8.5 1.6c0 3-2.5 6-8.5 10Z" fill="#E11D48"/><g class="spirals"><path d="M43 55.5a1.6 1.6 0 1 1 1.8 1.4 3.6 3.6 0 1 1-4.6-3.4 5.6 5.6 0 1 1 6.8 5.4" stroke="#15172A" stroke-width="2.2" fill="none" stroke-linecap="round"/></g></g>
<g class="eye r"><ellipse cx="77" cy="54" rx="11.5" ry="13.5" fill="#fff"/><g class="pupils"><g class="pin"><circle cx="77" cy="56" r="5.8" fill="#15172A"/><circle cx="79.2" cy="53.4" r="1.8" fill="#fff"/></g></g><path class="hearts" d="M77 62.5c-6-4-8.5-7-8.5-10a4.3 4.3 0 0 1 8.5-1.6 4.3 4.3 0 0 1 8.5 1.6c0 3-2.5 6-8.5 10Z" fill="#E11D48"/><g class="spirals"><path d="M77 55.5a1.6 1.6 0 1 1 1.8 1.4 3.6 3.6 0 1 1-4.6-3.4 5.6 5.6 0 1 1 6.8 5.4" stroke="#15172A" stroke-width="2.2" fill="none" stroke-linecap="round"/></g></g>
</g>
<path class="eyes-happy" d="M33 58q10-13 20 0M67 58q10-13 20 0" stroke="#15172A" stroke-width="4.6" fill="none" stroke-linecap="round"/>
<path class="eyes-sleep" d="M33 55q10 8 20 0M67 55q10 8 20 0" stroke="#15172A" stroke-width="4.2" fill="none" stroke-linecap="round"/>
<g class="blush"><ellipse cx="29" cy="72" rx="7.5" ry="4.2" fill="#FF4D6D" fill-opacity=".42"/><ellipse cx="91" cy="72" rx="7.5" ry="4.2" fill="#FF4D6D" fill-opacity=".42"/></g>
<path class="mouth-smile" d="M51 79q9 7.5 18 0" stroke="#15172A" stroke-width="4.2" fill="none" stroke-linecap="round"/>
<path class="mouth-grin" d="M47 76.5q13 14 26 0Z" fill="#15172A"/>
<ellipse class="mouth-o" cx="60" cy="81" rx="5.5" ry="6.5" fill="#15172A"/>
<path class="mouth-flat" d="M53 81h14" stroke="#15172A" stroke-width="4" stroke-linecap="round"/>
</g>
<g class="hands"><circle cx="40" cy="57" r="13" fill="#FF8E33" stroke="#E0660A" stroke-width="2.4"/><circle cx="80" cy="57" r="13" fill="#FF8E33" stroke="#E0660A" stroke-width="2.4"/><path d="M33 52v7M38 50v8M75 50v8M80 49v8" stroke="#E0660A" stroke-width="2" stroke-linecap="round"/></g>
<g class="zzz"><text x="100" y="20">z</text><text x="110" y="4" font-size="15">z</text></g>
</g></svg>`;

// ---------- text helpers ----------
const pop = (lines, base = .1, step = .028) => {
  let i = 0;
  return lines.map((line) => `<span class="ln">${line.split(" ").map((w) => `<span class="w">${[...w].map((ch) => `<span class="ch" style="--d:${(base + i++ * step).toFixed(3)}s">${esc(ch)}</span>`).join("")}</span>`).join(" ")}`).join(" </span>") + "</span>";
};
const words = (text, base = 0, step = .045) => text.split(" ").map((w, i) => `<span class="wl"><span class="wi" style="--d:${(base + i * step).toFixed(3)}s">${esc(w)}</span></span>`).join(" ");
const H = (tag, cls, text, extra = "") => `<${tag} class="${cls} split-lines"${extra}><span class="sr">${esc(text)}</span><span aria-hidden="true">${words(text)}</span></${tag}>`;
const H1 = (cls, text) => `<h1 class="${cls} rise"><span class="sr">${esc(text)}</span><span aria-hidden="true">${words(text, .05, .06)}<span class="dot-slot claimed"></span></span></h1>`;

// ---------- schema ----------
const ORG = {
  "@context": "https://schema.org", "@type": "Organization", "@id": abs("/#org"), name: C.name, alternateName: C.shortName, url: abs("/"), logo: abs("/assets/icon-512.png"), image: abs("/assets/og.png"),
  description: "AI-first marketing studio for brands worldwide: performance ads, social and content, SEO and AI search, websites and apps, brand and video, AI agents and automation.",
  email: C.email, telephone: C.phone, areaServed: "Worldwide", address: { "@type": "PostalAddress", addressCountry: "IN" },
  sameAs: Object.values(C.social).filter(Boolean), knowsAbout: services.map((s) => s.name).concat(["Generative engine optimisation", "Conversion rate optimisation"]),
  slogan: "Make your brand impossible to scroll past.",
  contactPoint: { "@type": "ContactPoint", contactType: "sales", email: C.email, telephone: C.phone, areaServed: "Worldwide", availableLanguage: ["English"] },
};
const SITE = { "@context": "https://schema.org", "@type": "WebSite", "@id": abs("/#site"), url: abs("/"), name: C.name, publisher: { "@id": abs("/#org") }, inLanguage: "en" };
const crumbsLd = (items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map(([name, url], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(url) })) });
const faqLd = (qa) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });

// ---------- layout ----------
const NAV = [["/services/", "Services"], ["/process/", "Process"], ["/about/", "About"], ["/insights/", "Insights"], ["/contact/", "Contact"]];
function layout({ path, title, desc, body, ld = [], noindex = false, type = "website", hello = false, fullTitle, og = "", crumbs = null }) {
  const url = abs(path);
  const t = fullTitle || `${title} — ${C.shortName}`;
  const ogImg = og && existsSync(join(ROOT, `assets/og/${og}.jpg`)) ? `/assets/og/${og}.jpg` : "/assets/og.png";
  const page = { "@context": "https://schema.org", "@type": path.startsWith("/contact") ? "ContactPage" : path.startsWith("/about") ? "AboutPage" : "WebPage", "@id": url + "#webpage", url, name: t, description: desc, inLanguage: "en", isPartOf: { "@id": abs("/#site") }, about: { "@id": abs("/#org") }, primaryImageOfPage: abs(ogImg), speakable: { "@type": "SpeakableSpecification", cssSelector: ["h1", ".lead"] }, ...(crumbs ? { breadcrumb: crumbsLd(crumbs) } : {}) };
  const verify = [C.verify && C.verify.google ? `<meta name="google-site-verification" content="${esc(C.verify.google)}">` : "", C.verify && C.verify.bing ? `<meta name="msvalidate.01" content="${esc(C.verify.bing)}">` : ""].join("");
  const nav = NAV.map(([p, l]) => `<a href="${p}"${path.startsWith(p) ? ' aria-current="page"' : ""}>${l}</a>`).join("");
  const menuNav = NAV.concat([["/speed-test/", "Speed test"], ["/growth-score/", "Growth score"], ["/free-audit/", "Free audit"]]).map(([p, l], i) => `<a href="${p}" style="--i:${i}"${path.startsWith(p) ? ' aria-current="page"' : ""}>${l}</a>`).join("");
  const ga = C.ga4 ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${C.ga4}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${C.ga4}',{anonymize_ip:true})</script>` : "";
  const cfg = { intake: C.leadIntakeUrl, whatsapp: C.whatsapp, email: C.email, jokes, hello, preview: PREVIEW, psiKey: C.pageSpeedApiKey || "" };
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
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/assets/icon-512.png"><link rel="manifest" href="/manifest.webmanifest">
<link rel="alternate" hreflang="en" href="${url}"><link rel="alternate" hreflang="x-default" href="${url}"><link rel="alternate" type="text/plain" title="LLM summary" href="/llms.txt">${verify}
<meta property="og:type" content="${type}"><meta property="og:site_name" content="${esc(C.name)}"><meta property="og:title" content="${esc(t)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${abs(ogImg)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Dot, the dotindot mascot, next to the line: Make your brand impossible to scroll past.">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(t)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${abs(ogImg)}"><meta property="og:locale" content="en_GB">
<link rel="preload" href="/assets/fonts/anybody.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/assets/fonts/instrument.woff2" as="font" type="font/woff2" crossorigin>
<script>document.documentElement.classList.add("js");setTimeout(function(){if(!window.__ddReady)document.documentElement.classList.remove("js")},4000)</script>
<style>${CSS}</style>
${[ORG, SITE, ...(noindex ? [] : [page]), ...ld].map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n")}
${ga}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="hdr"><div class="wrap">
<a class="logo" href="/" aria-label="${esc(C.shortName)} home"><img src="/assets/wordmark-color.svg" alt="dotindot." width="136" height="26"></a>
<nav class="nav" aria-label="Main">${nav}</nav>
<a class="btn small alt cta" href="/free-audit/" data-dot="love" data-mag>Free audit</a>
<button class="burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="menu">${I.menu}</button>
</div></header>
<div class="menu" id="menu" aria-hidden="true">
<div class="menu-top"><a class="logo" href="/" aria-label="${esc(C.shortName)} home"><img src="/assets/wordmark-color.svg" alt="dotindot." width="136" height="26"></a><button class="menu-close" type="button" aria-label="Close menu">×</button></div>
<nav aria-label="Menu">${menuNav}</nav>
<div class="menu-foot"><a class="btn alt" href="/free-audit/" data-dot="love">Get a free audit</a><a href="mailto:${C.email}">${C.email}</a><a href="${wa()}" target="_blank" rel="noopener">WhatsApp</a></div>
</div>
<main id="main" tabindex="-1">
${body}
</main>
${footer()}
<button class="dot-btn" id="dot" type="button" data-mood="idle" aria-label="Dot, our mascot. Open quick help" aria-expanded="false" aria-controls="dot-bubble">${dotSVG()}</button>
<div class="dot-bubble" id="dot-bubble" role="dialog" aria-label="Quick help from Dot" aria-hidden="true">
<button class="x" type="button" aria-label="Close">×</button>
<p>Hi, I'm Dot.</p>
<div class="opts">
<a href="/free-audit/" data-dot="love">${I.spark} Get a free audit</a>
<a href="${wa()}" target="_blank" rel="noopener" data-dot="happy">${I.wa} WhatsApp a human</a>
<a href="mailto:${C.email}" data-dot="happy">${I.mail} Email us</a>
<button type="button" data-callback>${I.phone} Call me back</button>
<button type="button" data-joke>${I.laugh} Tell me a joke</button>
</div>
<form class="mini" data-lead="dot-bubble" data-mini hidden novalidate><label class="sr" for="dot-contact">Your email or phone</label><input id="dot-contact" name="contact" autocomplete="email" placeholder="email or phone"><input type="hidden" name="interest" value="Asked Dot"><button type="submit">Send</button><p class="status" role="status" aria-live="polite"></p></form>
</div>
<span class="dot-hint" aria-hidden="true">Drag me. Throw me. I bounce.</span>
<script>window.__DD=${JSON.stringify(cfg)}</script>
<script defer src="/${LENIS_JS}"></script>
<script defer src="/${SITE_JS}"></script>
</body></html>`;
}

function footer() {
  const soc = Object.entries(C.social).filter(([, v]) => v).map(([k, v]) => `<li><a href="${v}" target="_blank" rel="noopener me">${({ x: "X", linkedin: "LinkedIn", youtube: "YouTube", instagram: "Instagram" })[k] || k[0].toUpperCase() + k.slice(1)}</a></li>`).join("");
  return `<footer class="ftr" data-mood-sec="happy"><div class="wrap">
<div class="ftr-top">
<div class="ftr-lead">${H("h2", "", "Let's make your dot impossible to miss.")}<div class="btns"><a class="btn alt" href="/free-audit/" data-dot="love" data-mag>Get a free audit</a><a class="btn ghost" href="${wa()}" target="_blank" rel="noopener" data-dot="happy">${I.wa} WhatsApp</a></div></div>
<div><h3>Services</h3><ul>${services.map((s) => `<li><a href="/services/${s.slug}/">${esc(s.name)}</a></li>`).join("")}</ul></div>
<div><h3>Studio</h3><ul><li><a href="/about/">About</a></li><li><a href="/process/">How we work</a></li><li><a href="/insights/">Insights</a></li><li><a href="/careers/">Careers</a></li><li><a href="/contact/">Contact</a></li></ul><h3 style="margin-top:22px">Free tools</h3><ul><li><a href="/speed-test/">Website speed test</a></li><li><a href="/growth-score/">Growth score</a></li><li><a href="/free-audit/">Free audit</a></li></ul></div>
<div><h3>Markets</h3><ul>${markets.map((m) => `<li><a href="/markets/${m.slug}/">${esc(m.country)}</a></li>`).join("")}<li><a href="/markets/">All markets</a></li></ul></div>
<div><h3>Say hello</h3><ul><li><a href="mailto:${C.email}">${C.email}</a></li><li><a href="${wa()}" target="_blank" rel="noopener">WhatsApp</a></li><li><a href="tel:${tel}">${esc(C.phoneDisplay)}</a></li>${soc}</ul></div>
</div>
<div class="ftr-bot">
<span>© ${year} ${esc(C.name)}. No templates were harmed in the making of this website.</span>
<nav aria-label="Legal"><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="/llms.txt">llms.txt</a></nav>
<a class="emp" href="${C.internalUrl}" rel="nofollow noopener" data-dot="shy">${I.lock} Employee login</a>
</div>
<svg class="mega" viewBox="0 -2 396 80" role="img" aria-label="dotindot."><defs><linearGradient id="wmg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FE7A18"/><stop offset="1" stop-color="#FFAD42"/></linearGradient></defs><g class="letters"><g transform="${WM_T}"><path fill="url(#wmg)" d="${WM_PATHS[0]}"/></g></g><g class="stop"><g transform="${WM_T}"><path fill="#FE7B1B" d="${WM_PATHS[1]}"/></g></g><circle class="stop-anchor" cx="385.96" cy="67.04" r="9.6" fill="none"/></svg>
</div></footer>`;
}

// ---------- shared blocks ----------
const interestOpts = (pre) => [["more leads & sales", "performance-ads"], ["social media that grows", "social-content"], ["SEO & AI search", "seo-ai-search"], ["a new website or app", "websites-apps"], ["branding or video", "brand-video"], ["AI agents & automation", "ai-automation"], ["honestly, not sure yet", ""]]
  .map(([l, s]) => `<option${pre && pre === s ? " selected" : ""}>${esc(l)}</option>`).join("");
const madlib = (id, { pre = "", next = "/thanks/" } = {}) => `<form class="madlib-form" data-lead="${id}" data-next="${next}" novalidate>
<p class="madlib">Hi, I'm <span class="f"><input name="name" aria-label="Your name" placeholder="your name" autocomplete="name" required></span> from <span class="f"><input class="wide" name="company" aria-label="Company" placeholder="your company" autocomplete="organization"></span>. We'd love help with <span class="f"><select name="interest" aria-label="What you need help with">${interestOpts(pre)}</select></span>, and our budget is <span class="f"><select name="budget" data-budget aria-label="Monthly budget"><option value="">still being figured out</option><option>Under $1,500 a month</option><option>$1,500 – $5,000 a month</option><option>$5,000 – $15,000 a month</option><option>$15,000+ a month</option><option>a one-off project</option></select></span>. Reach me at <span class="f"><input class="wide" name="email" type="email" inputmode="email" aria-label="Email" placeholder="you@company.com" autocomplete="email"></span> or <span class="f"><input name="phone" type="tel" inputmode="tel" aria-label="Phone or WhatsApp" placeholder="phone / WhatsApp" autocomplete="tel"></span>.</p>
<label class="madlib"><span class="sr">Anything else we should know</span><textarea name="message" rows="2" placeholder="Anything else? Optional, but Dot loves details."></textarea></label>
<label class="hp" aria-hidden="true">Leave this empty<input name="website_url_hp" tabindex="-1" autocomplete="off"></label>
<div class="form-foot"><button class="btn alt" type="submit" data-dot="love" data-mag>Send it</button><span class="muted small">A human replies within one working day. No spam — Dot is very strict about that.</span><p class="status" role="status" aria-live="polite"></p></div>
</form>`;
const ctaBand = (id, opts = {}) => `<section class="sec" data-mood-sec="love" id="talk"><div class="wrap"><div class="cta-band">
${H("h2", "h-sec", opts.title || "Tell us about your brand.")}
${madlib(id, opts)}
<div class="direct"><span>Rather talk?</span><a href="${wa()}" target="_blank" rel="noopener" data-dot="happy">WhatsApp</a><a href="mailto:${C.email}" data-dot="happy">${C.email}</a><span>It's <b data-localtime>now</b> <span data-place>where you are</span>.</span></div>
</div></div></section>`;
const faqBlock = (qa) => `<div class="faq">${qa.map(([q, a]) => `<details><summary>${esc(q)}<i aria-hidden="true"></i></summary><div class="ans"><p>${esc(a)}</p></div></details>`).join("")}</div>`;
const svcList = () => `<div class="svc-list">${services.map((s) => `<a class="svc-row" href="/services/${s.slug}/" data-tag="${esc(s.tagline)}" data-quip="${esc(s.joke)}" data-dot="happy"><h3>${esc(s.name)}</h3><p>${esc(s.short)}</p><span class="go" aria-hidden="true">${I.arrow}</span><template>${DOODLE[s.icon]}</template></a>`).join("")}</div><div class="peek" aria-hidden="true"><div class="ico"></div><b></b><span></span></div>`;
const procBlock = (title = "From hello to growth in four steps.") => `<section class="proc" data-mood-sec="happy" aria-label="How we work"><div class="proc-stick"><div class="wrap">
<div class="head proc-head">${H("h2", "h-sec stretchy", title)}<p>The same four steps for a startup in Berlin or a 40-year-old manufacturer in Chennai. The details change. The discipline doesn't.</p></div></div>
<div class="wrap" style="overflow:visible"><div class="proc-track">${steps.map((s) => `<article class="proc-card"><div class="n" aria-hidden="true">${s.n}</div><h3>${esc(s.title)}</h3><div class="when">${esc(s.when)}</div><p>${esc(s.text)}</p><p class="aside">${esc(s.aside)}</p></article>`).join("")}</div></div>
</div></section>`;
const vsBlock = () => `<div class="vs"><div class="vs-hd" aria-hidden="true"><span>The AI does this</span><span></span><span>A human does this</span></div>${aiHuman.map(([a, h]) => `<div class="vs-row"><p class="ai">${esc(a)}</p><span class="link-dots" aria-hidden="true"><i></i><i></i><i></i></span><p class="hu">${esc(h)}</p></div>`).join("")}</div>`;
const CLOCKS = [["London", "Europe/London"], ["Dubai", "Asia/Dubai"], ["Singapore", "Asia/Singapore"], ["Sydney", "Australia/Sydney"], ["New York", "America/New_York"], ["Us, in India", "Asia/Kolkata"]];
const clocks = () => `<div class="clocks">${CLOCKS.map(([n, z]) => `<div class="clock${z === "Asia/Kolkata" ? " us" : ""}" data-tz="${z}"><b>--:--</b><span><i></i>${esc(n)}</span></div>`).join("")}</div>`;

const theatre = (title = "Watch the dots work.") => `<section class="theatre" id="services" data-mood-sec="happy" style="--n:${services.length}" aria-label="Services"><div class="th-stick"><div class="wrap"><div class="th-grid">
<div class="th-col"><div class="th-head">${H("h2", "h-sec stretchy", title)}<p class="muted" data-reveal style="margin-top:16px;max-width:30em">Six services. Here's what each one actually does, in about five seconds each. Scroll on.</p></div>
<ul class="th-list">${services.map((s, i) => `<li class="th-item${i ? "" : " on"}" data-i="${i}"><a href="/services/${s.slug}/" data-dot="happy"><h3>${esc(s.name)}</h3><span class="go" aria-hidden="true">${I.arrow}</span><p>${esc(s.short)}</p></a><div class="th-scene scene" data-steps="${scenes[s.slug].steps}">${scenes[s.slug].svg}</div></li>`).join("")}</ul>
<div class="th-bar" aria-hidden="true"><i></i></div></div>
<div class="th-stage" aria-hidden="true"></div>
</div></div></div></section>`;
const squash = () => `<section class="squash" data-mood-sec="wow" aria-label="We don't do average"><div class="squash-stick"><div class="wrap">
<h2 class="squash-line">Nobody remembers <span class="avg">average<i class="avg-flat" aria-hidden="true"></i></span>.</h2>
<p class="squash-after">So we don't do it.</p>
<p class="squash-note">No words were harmed. One was flattened.</p>
<span class="big-drop" data-mood="happy" aria-hidden="true">${dotSVG()}</span>
</div></div></section>`;
const quizBlock = (id) => `<div class="quiz" data-quiz="${id}">
<div class="qz-top"><div class="qz-dots" aria-hidden="true">${quiz.map(() => "<i></i>").join("")}</div><span class="qz-count">1 / ${quiz.length}</span></div>
<div class="qz-body"><p class="qz-q">${esc(quiz[0].q)}</p><div class="qz-opts">${quiz[0].a.map(([l]) => `<button type="button">${esc(l)}</button>`).join("")}</div></div>
<script type="application/json" class="qz-data">${JSON.stringify(quiz)}</script>
</div>`;
const speedBlock = (h = "h2") => `<div class="speed" data-speed data-mood-sec="wow">
<${h} class="h-sec">How fast is your website, really?</${h}>
<p class="lead" style="margin-top:18px">Paste your address. We'll ask Google's own PageSpeed test to load it on a mid-range phone and score it — the same test Google uses.</p>
<form class="inline-form sp-form" novalidate style="margin-top:26px"><label class="sr" for="sp-url-${h}">Website address</label><input id="sp-url-${h}" name="url" type="url" inputmode="url" autocomplete="url" placeholder="yourbrand.com" required><button class="btn alt" type="submit" data-dot="wow">Test my site</button></form>
<p class="fine">Takes 15–40 seconds. Powered by Google PageSpeed Insights. Nothing is stored unless you ask for the fix list.</p>
<div class="sp-out" aria-live="polite"></div>
</div>`;

// ---------- pages ----------
const pages = [];
const add = (p, html) => pages.push([p, html]);

// home
const homeFaq = faqs.slice(0, 6);
const confettiDots = [[95, 31, 20, .32], [95, 44, 12, .18], [78, 9, 9, .22], [92, 70, 16, .26], [70, 92, 10, .4], [58, 6, 8, .14], [84, 98, 13, .3]];
let homeBody = (weight) => `
<section class="hero" aria-labelledby="h">
<div class="confetti" aria-hidden="true">${confettiDots.map(([x, y, s, sp], i) => `<i data-s="${sp}" style="left:${x}%;top:${y}%;width:${s}px;height:${s}px;${i > 3 ? "opacity:.5" : ""}"></i>`).join("")}</div>
<div class="wrap">
<h1 id="h" class="h-hero pop"><span class="sr">Make your brand impossible to scroll past.</span><span aria-hidden="true">${pop(["Make your brand", "impossible to", "scroll past"]).replace(/<\/span>$/, '<span class="dot-slot claimed"></span></span>')}</span></h1>
<div class="hero-row">
<div><p class="lead">Dotindot is an <b>AI-first marketing studio</b>. We run the ads, make the content, get you found on Google and in ChatGPT, build the website and automate the boring bits — for ambitious brands anywhere on the map.</p>
<div class="btns"><a class="btn alt" href="/free-audit/" data-dot="love" data-mag>Get a free growth audit</a><a class="btn ghost" href="#services" data-dot="happy">See what we do</a></div>
<p class="fine">Free means free. Dot checked. Twice.</p></div>
<aside class="note" aria-label="A note">Psst. The orange dot is watching your cursor. It's harmless. Mostly.</aside>
</div></div></section>
<div class="marq" aria-hidden="true"><div class="marq-track">${[0, 1, 2].map(() => `<div class="marq-group">${["Performance ads", "Social & content", "SEO & AI search", "Websites & apps", "Brand & video", "AI agents"].map((t) => `<span class="it">${t}</span><span class="sep"></span>`).join("")}</div>`).join("")}</div></div>

<section class="uni" data-map="/${MAP_JSON}" data-mood-sec="wow" aria-label="Why it matters">
<div class="uni-stick"><canvas aria-hidden="true"></canvas>
<div class="uni-caps"><div class="wrap">
<div class="uni-cap on"><h2>There are over a billion websites.</h2><p>Each one is a dot. Most of them are shouting “Welcome to our website!” at nobody in particular.</p></div>
<div class="uni-cap"><h2>Yours is one of them.</h2><p>Somewhere in there. Waving. Slightly sweaty.</p></div>
<div class="uni-cap"><h2>We make it the one people find.</h2><p>Ads, content, search and AI, all pointed at the people who'd actually buy from you.</p></div>
<div class="uni-cap"><h2>Wherever they happen to be.</h2><p>Down the road or across an ocean. Different time zones, same results dashboard.</p></div>
</div></div>
<span class="uni-you" aria-hidden="true"></span>
<div class="uni-prog" aria-hidden="true"><i></i></div></div></section>

${theatre()}
${squash()}

<section class="sec fog" data-mood-sec="wink"><div class="wrap">
<div class="head">${H("h2", "h-sec stretchy", "AI-first. Human-checked.")}<p data-reveal>AI makes us fast and affordable. People make sure it's right. Here's who does what — honestly.</p></div>
${vsBlock()}
</div></section>

${procBlock()}

<section class="sec fog" data-mood-sec="wink" id="growth-score"><div class="wrap">
<div class="head">${H("h2", "h-sec stretchy", "How loud is your dot?")}<p data-reveal>Six quick taps, one honest score out of 100, and the fixes that would move it most. About a minute. Dot will judge silently.</p></div>
${quizBlock("home")}
</div></section>

<section class="sec" data-mood-sec="wow"><div class="wrap">
<h2 class="globe-time" data-reveal>It's <time data-localtime>right now</time> <span data-place>where you are</span>.</h2>
<p class="lead" data-reveal style="margin-top:24px">Our team works from India, remote-first, with brands across time zones. Send a note now and a real person replies within one working day — usually before your next coffee.</p>
<div data-reveal>${clocks()}</div>
</div></section>

<section class="sec" style="padding-top:0"><div class="wrap">${speedBlock()}</div></section>

${C.receipts && C.receipts.lighthouse ? `<section class="sec fog" data-mood-sec="wow"><div class="wrap">
<div class="head">${H("h2", "h-sec stretchy", "Receipts, not adjectives.")}<p data-reveal>We're new to bragging, so here are things about this very page you can check yourself.</p></div>
<div class="receipts" data-reveal>
<div class="rcpt"><b>${esc(C.receipts.lighthouse)}</b><span>Google Lighthouse performance score on mobile. Go on, run it.</span></div>
<div class="rcpt"><b>${weight}<small>KB</small></b><span>Total weight of this page. Lighter than one phone selfie.</span></div>
<div class="rcpt"><b>0</b><span>Templates used to build it. Every pixel placed on purpose.</span></div>
<div class="rcpt"><b><i data-stare style="font-style:normal">0</i><small>s</small></b><span>How long Dot has been watching your cursor. It hasn't blinked much.</span></div>
</div></div></section>` : ""}

<section class="sec" data-mood-sec="happy"><div class="wrap">
<div class="head">${H("h2", "h-sec stretchy", "We speak fluent platform.")}<p data-reveal>And several dialects of AI. If your stack isn't on the list, we've probably used it at 2 am at some point.</p></div>
<ul class="tools" data-reveal>${tools.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
</div></section>

<section class="sec fog"><div class="wrap two">
<div>${H("h2", "h-sec", "Questions people ask us.")}<p class="lead" data-reveal style="margin-top:24px">And a few they're too polite to ask. More on the <a class="link" href="/contact/">contact page</a>.</p></div>
${faqBlock(homeFaq)}
</div></section>
${ctaBand("home")}`;
add("/", (w) => layout({ path: "/", fullTitle: `${C.name} — AI-first digital marketing agency for brands worldwide`, hello: true, og: "home",
  desc: "AI-first digital marketing studio for brands worldwide: ads, social, SEO and AI search, websites, branding and AI agents. Free audit, fixed quotes.",
  ld: [faqLd(homeFaq)], body: homeBody(w) }));

// services index
add("/services/", layout({ path: "/services/", title: "Services", fullTitle: `Digital marketing services — ads, social, SEO & AI search, websites, AI agents — ${C.shortName}`, og: "services", desc: "Performance ads, social and content, SEO and AI search, websites and apps, brand and video, and AI agents — run by one AI-first team with one dashboard.",
  ld: [crumbsLd([["Home", "/"], ["Services", "/services/"]]), { "@context": "https://schema.org", "@type": "ItemList", name: "Services", itemListElement: services.map((x, i) => ({ "@type": "ListItem", position: i + 1, url: abs(`/services/${x.slug}/`), name: x.name })) }],
  body: `<section class="phero"><div class="wrap">${H1("h-page", "Everything your brand needs online")}<p class="lead fade-in">Six services, one team, one dashboard. Pick what you need now and add the rest when it makes sense. No bundles you didn't ask for.</p></div></section>
<section class="sec" style="padding-top:0" data-mood-sec="happy"><div class="wrap"><h2 class="sr">All services</h2>${svcList()}</div></section>
<section class="sec fog" data-mood-sec="wink"><div class="wrap"><div class="head">${H("h2", "h-sec stretchy", "AI-first. Human-checked.")}<p data-reveal>Why we're faster and better value than a traditional agency, without being a robot.</p></div>${vsBlock()}</div></section>
${ctaBand("services")}` }));

// service pages
services.forEach((s, idx) => {
  const others = services.filter((o) => o.slug !== s.slug).slice(idx % 2, idx % 2 + 3);
  add(`/services/${s.slug}/`, layout({ path: `/services/${s.slug}/`, title: s.name, fullTitle: `${seoTitles[s.slug]} — ${C.shortName}`, desc: `${s.promise} By dotindot, an AI-first studio.`, og: `services-${s.slug}`, crumbs: [["Home", "/"], ["Services", "/services/"], [s.name, `/services/${s.slug}/`]],
    ld: [crumbsLd([["Home", "/"], ["Services", "/services/"], [s.name, `/services/${s.slug}/`]]), faqLd(s.faq),
      { "@context": "https://schema.org", "@type": "Service", name: s.name, serviceType: s.name, description: s.intro, provider: { "@id": abs("/#org") }, areaServed: "Worldwide", url: abs(`/services/${s.slug}/`) }],
    body: `<section class="phero"><div class="wrap"><nav class="crumbs" aria-label="Breadcrumb"><a href="/services/">Services</a> / ${esc(s.name)}</nav>
${H1("h-page", s.name)}
<p class="h-mid fade-in" style="margin-top:22px;color:var(--ember)">${esc(s.tagline)}</p>
<p class="lead fade-in">${esc(s.promise)}</p>
<div class="btns fade-in" style="margin-top:28px"><a class="btn alt" href="#talk" data-dot="love" data-mag>Talk to us about ${esc(lc(s.name))}</a><a class="btn ghost" href="/free-audit/">Start with a free audit</a></div></div></section>
<section class="sec" style="padding-top:clamp(24px,4vw,48px)" data-mood-sec="happy"><div class="wrap two">
<div><p class="lead" style="color:var(--ink)" data-reveal>${esc(s.intro)}</p><p class="joke" data-reveal>${esc(s.joke)}</p></div>
<div data-reveal><h2 class="h-mid" style="margin-bottom:18px">What you get</h2><ul class="check">${s.deliverables.map((d) => `<li>${esc(d)}</li>`).join("")}</ul></div>
</div></section>
<section class="sec fog" data-mood-sec="wink"><div class="wrap two">
<div>${H("h2", "h-sec stretchy", "A good fit if…")}<ul class="chips" data-reveal style="margin-top:28px">${s.fit.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>
<div data-reveal><h2 class="h-mid" style="margin-bottom:22px">How it runs</h2><ol class="timeline">${s.steps.map(([w, t]) => `<li><b>${esc(w)}</b><span>${esc(t)}</span></li>`).join("")}</ol></div>
</div></section>
<section class="sec"><div class="wrap two"><div>${H("h2", "h-sec", "Questions, answered.")}</div>${faqBlock(s.faq)}</div></section>
<section class="sec" style="padding-top:0"><div class="wrap"><h2 class="h-mid" style="margin-bottom:22px">Pairs well with</h2><div class="related">${others.map((o) => `<a href="/services/${o.slug}/" data-dot="happy"><b>${esc(o.name)}</b><span>${esc(o.short)}</span></a>`).join("")}</div></div></section>
${ctaBand(`service-${s.slug}`, { pre: s.slug, title: `Let's talk ${lc(s.name)}.` })}` }));
});

// process
const never = ["Take a percentage of your ad spend.", "Lock you into a twelve-month contract.", "Send a 40-page report made of screenshots.", "Say “synergy” and mean it.", "Ship anything on a Friday at 6 pm.", "Hold your accounts, code or content hostage."];
add("/process/", layout({ path: "/process/", title: "How we work", fullTitle: `How we work — audit, plan, build, grow — ${C.shortName}`, og: "process", desc: "Audit, plan, build, grow: how dotindot runs the first 90 days and every month after, with fixed quotations, month-to-month retainers and a live dashboard.",
  ld: [crumbsLd([["Home", "/"], ["How we work", "/process/"]]), { "@context": "https://schema.org", "@type": "HowTo", name: "How dotindot runs a growth engagement", step: steps.map((x, i) => ({ "@type": "HowToStep", position: i + 1, name: x.title, text: x.text })) }],
  body: `<section class="phero"><div class="wrap">${H1("h-page", "How we work")}<p class="lead fade-in">Four steps, a fixed quotation, a live dashboard and a monthly sit-down. It's not complicated. That's the point.</p></div></section>
${procBlock("The first 90 days, step by step.")}
<section class="sec fog" data-mood-sec="wink"><div class="wrap two">
<div>${H("h2", "h-sec stretchy", "Every month, you get…")}<ul class="check" data-reveal style="margin-top:30px"><li>A live dashboard you can open any time — no “let me get back to you on that”.</li><li>A monthly review call with the numbers, what we learned and what's next.</li><li>Fresh creative, tests and content, planned a month ahead.</li><li>One named lead who knows your account, plus the specialists behind them.</li><li>Replies within one working day on WhatsApp or email.</li></ul></div>
<div>${H("h2", "h-sec stretchy", "Things we'll never do.")}<ul class="check" data-reveal style="margin-top:30px">${never.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>
</div></section>
<section class="sec"><div class="wrap two"><div>${H("h2", "h-sec", "The fine print, in big print.")}</div>${faqBlock(faqs.filter((f) => /cost|contract|working|currenc|time zone/i.test(f[0])))}</div></section>
${ctaBand("process")}` }));

// about
add("/about/", layout({ path: "/about/", title: "About", fullTitle: `About ${C.shortName} — an AI-first, remote-first marketing studio`, og: "about", desc: "An AI-first, remote-first marketing studio in India, working with brands worldwide. Who we are, how we work, and why a dot is watching you.",
  ld: [crumbsLd([["Home", "/"], ["About", "/about/"]]), { "@context": "https://schema.org", "@type": "AboutPage", url: abs("/about/"), about: { "@id": abs("/#org") } }],
  body: `<section class="phero"><div class="wrap">${H1("h-page", "We're dotindot")}<p class="lead fade-in">An AI-first marketing studio. Remote-first, based in India, working with brands wherever they are. We're builders, marketers, designers and engineers who'd rather show you a number than an adjective.</p></div></section>
<section class="sec" style="padding-top:clamp(24px,4vw,48px)"><div class="wrap two">
<div>${H("h2", "h-sec stretchy", "Why “dotindot”?")}</div>
<div class="lead" style="color:var(--ink)" data-reveal><p>Every brand online starts as a dot in a sea of dots. Our whole job is making yours the one people notice, remember and buy from.</p><p>Dot in dot: your brand inside the internet, and the bit of attention it earns inside someone's busy day. We think about that second dot a lot.</p><p class="muted">Also, the domain was available. We're not going to pretend that didn't help.</p></div>
</div></section>
<section class="sec fog" data-mood-sec="wow"><div class="wrap two">
<div>${H("h2", "h-sec stretchy", "How we're set up.")}<p class="lead" data-reveal style="margin-top:24px">Built for working across borders from day one.</p></div>
<ul class="check" data-reveal><li><b>Remote-first, based in India.</b> Senior people, sensible costs, no glass tower to pay for.</li><li><b>Across time zones.</b> Daily overlap with Europe and the Gulf, early or late calls for the Americas and Australia.</li><li><b>Your currency.</b> We quote and invoice in USD, GBP, EUR, AED, SGD, AUD, CAD or INR.</li><li><b>AI in the workflow, people at the wheel.</b> AI drafts, monitors and crunches; humans decide.</li><li><b>One dashboard.</b> Every client sees the same live numbers we do.</li></ul>
</div></section>
<section class="sec"><div class="wrap">${H("h2", "h-sec stretchy", "What we believe.")}<div class="vals" data-reveal style="margin-top:clamp(32px,5vw,64px)">${values.map(([h, p]) => `<div class="val"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("")}</div></div></section>
<section class="sec fog" data-mood-sec="happy"><div class="wrap two" style="align-items:center">
<div>${H("h2", "h-sec stretchy", "Meet Dot.")}<div class="lead" data-reveal style="margin-top:24px"><p>Dot joined on day one and has never taken a day off, mostly because it doesn't know what days are.</p><p>It follows your cursor, gets excited about free audits, covers its eyes when someone heads to the employee login, and falls asleep if you leave it alone for too long. Click it any time. It knows jokes. Some of them are good.</p></div></div>
<div data-reveal><div class="badge"><span class="clip" aria-hidden="true"></span><div class="top"><span class="bd" data-mood="happy" aria-hidden="true">${dotSVG()}</span><div><h3>Dot</h3><span class="muted">Head of Vibes</span></div></div>
<dl><dt>Employee no.</dt><dd>000</dd><dt>Clearance</dt><dd>Everywhere</dd><dt>Skills</dt><dd>Staring, rolling, not blinking</dd><dt>Weakness</dt><dd>Dark mode (we don't have one)</dd></dl><div class="bar" aria-hidden="true"></div></div></div>
</div></section>
${ctaBand("about", { title: "Want to work with us?" })}` }));

// contact
add("/contact/", layout({ path: "/contact/", title: "Contact", fullTitle: `Contact ${C.shortName} — a human replies within one working day`, og: "contact", desc: "Tell dotindot about your brand. A real person replies within one working day — on WhatsApp, email or a video call, in your time zone and your currency.",
  ld: [crumbsLd([["Home", "/"], ["Contact", "/contact/"]]), faqLd(faqs.slice(1, 5)), { "@context": "https://schema.org", "@type": "ContactPage", url: abs("/contact/"), about: { "@id": abs("/#org") } }],
  body: `<section class="phero" style="padding-bottom:clamp(24px,4vw,48px)"><div class="wrap">${H1("h-page", "Say hello")}<p class="lead fade-in">Fill in the blanks below, or reach us however you like. A real human replies within one working day. It's <b data-localtime>now</b> <span data-place>where you are</span>.</p></div></section>
<section class="sec" style="padding-top:0" data-mood-sec="love" id="talk"><div class="wrap"><div class="cta-band">${madlib("contact")}
<div class="direct"><a href="${wa()}" target="_blank" rel="noopener" data-dot="happy">${I.wa.replace("<svg", '<svg width="18" height="18" style="display:inline;vertical-align:-3px;margin-right:6px"')}WhatsApp</a><a href="mailto:${C.email}" data-dot="happy">${C.email}</a><a href="tel:${tel}">${esc(C.phoneDisplay)}</a></div></div></div></section>
<section class="sec fog" data-mood-sec="wow"><div class="wrap">${H("h2", "h-sec stretchy", "Wherever you are, it's office hours somewhere.")}<div data-reveal>${clocks()}</div></div></section>
<section class="sec"><div class="wrap two"><div>${H("h2", "h-sec", "Before you write.")}</div>${faqBlock(faqs.slice(1, 7))}</div></section>` }));

// free audit
const auditFaq = [["Is it really free?", "Yes. No card, no catch, no obligation. Dot checked. Twice."], ["What do you need from us?", "Your website, the social accounts you use, and — if you run ads — read-only access or a few screenshots. That's it."], ["How long does it take?", "About five working days from when we have what we need. Then a 30-minute call to walk you through it."], ["Will you try to sell us something?", "We'll tell you what we'd do. If you want us to do it, great. If not, the report is yours to keep and use with anyone."]];
add("/free-audit/", layout({ path: "/free-audit/", title: "Free growth audit", fullTitle: `Free growth audit — website, search, social and ads review — ${C.shortName}`, og: "free-audit", desc: "A free, honest 20-point review of your website, search and AI-search visibility, social accounts and ads — with a written report and a 30-minute call. No obligation.",
  ld: [crumbsLd([["Home", "/"], ["Free growth audit", "/free-audit/"]]), faqLd(auditFaq)],
  body: `<section class="phero"><div class="wrap">${H1("h-page", "Free growth audit")}<p class="lead fade-in">A free, honest look at your marketing: what's working, what's leaking money, and the three things we'd fix first. You keep the report either way.</p></div></section>
<section class="sec" style="padding-top:0" data-mood-sec="love"><div class="wrap two">
<div data-reveal><h2 class="h-mid" style="margin-bottom:20px">What you'll get</h2><ul class="check"><li>Website speed, mobile and conversion review, with the exact fixes</li><li>Google search and AI-assistant visibility check — who gets cited instead of you</li><li>Social accounts: growth, content and what competitors do better</li><li>Ad accounts: tracking, wasted spend and creative fatigue</li><li>A written report and a 30-minute call in your time zone</li></ul><p class="joke">We poke around like a curious cat in a new flat. A polite one.</p></div>
<div class="cta-band" data-reveal><h2 class="h-mid" style="margin-bottom:22px">Request your audit</h2>
<form class="form" data-lead="free-audit" data-next="/thanks/" novalidate>
<label>Your name<input name="name" autocomplete="name" required></label>
<label>Company<input name="company" autocomplete="organization"></label>
<label>Email<input name="email" type="email" inputmode="email" autocomplete="email"></label>
<label>Phone / WhatsApp<input name="phone" type="tel" inputmode="tel" autocomplete="tel"></label>
<label class="full">Website or main social account<input name="website" placeholder="https://"></label>
<label>Main goal<select name="interest">${interestOpts("")}</select></label>
<label>Monthly budget<select name="budget" data-budget><option value="">Prefer not to say</option><option>Under $1,500 a month</option><option>$1,500 – $5,000 a month</option><option>$5,000 – $15,000 a month</option><option>$15,000+ a month</option><option>a one-off project</option></select></label>
<label class="full">Anything we should know?<textarea name="message" rows="3"></textarea></label>
<label class="hp" aria-hidden="true">Leave empty<input name="website_url_hp" tabindex="-1" autocomplete="off"></label>
<div class="full form-foot" style="margin-top:4px"><button class="btn alt" type="submit" data-dot="love" data-mag>Request my free audit</button><p class="status" role="status" aria-live="polite"></p></div>
</form></div>
</div></section>
<section class="sec fog"><div class="wrap two"><div>${H("h2", "h-sec", "Good questions.")}</div>${faqBlock(auditFaq)}</div></section>` }));

// insights
add("/insights/", layout({ path: "/insights/", title: "Insights", fullTitle: `Insights on ads, SEO, AI search and websites — ${C.shortName}`, og: "insights", desc: "Practical notes on ads, SEO and AI search, websites and automation from the dotindot team. No fluff, no listicles about 'top 10 trends'.",
  ld: [crumbsLd([["Home", "/"], ["Insights", "/insights/"]]), { "@context": "https://schema.org", "@type": "Blog", name: `${C.name} insights`, url: abs("/insights/"), publisher: { "@id": abs("/#org") }, blogPost: insights.map((x) => ({ "@type": "BlogPosting", headline: x.title, url: abs(`/insights/${x.slug}/`), datePublished: x.date })) }],
  body: `<section class="phero"><div class="wrap">${H1("h-page", "Insights")}<p class="lead fade-in">Practical notes from the work. No “top 10 trends” listicles. We promise. Dot made us promise.</p></div></section>
<section class="sec" style="padding-top:0"><div class="wrap"><div class="posts">${insights.map((a) => `<a class="post" href="/insights/${a.slug}/" data-reveal><time datetime="${a.date}">${new Date(a.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</time><div><h2>${esc(a.title)}</h2><p>${esc(a.summary)} · ${a.minutes} min read</p></div><span class="go" aria-hidden="true">${I.arrow}</span></a>`).join("")}</div></div></section>
${ctaBand("insights", { title: "Rather we just did it for you?" })}` }));
insights.forEach((a) => {
  const body = a.body.map((b) => {
    if (b.startsWith("## ")) return `<h2>${esc(b.slice(3))}</h2>`;
    if (/^\d\. /.test(b)) return `<ol>${b.split("\n").map((l) => `<li>${md(l.replace(/^\d\.\s*/, ""))}</li>`).join("")}</ol>`;
    if (b.includes("\n")) return `<ul>${b.split("\n").map((l) => `<li>${md(l)}</li>`).join("")}</ul>`;
    return `<p>${md(b)}</p>`;
  }).join("\n");
  add(`/insights/${a.slug}/`, layout({ path: `/insights/${a.slug}/`, title: a.title, desc: a.summary, type: "article", og: `insights-${a.slug}`, crumbs: [["Home", "/"], ["Insights", "/insights/"], [a.title, `/insights/${a.slug}/`]],
    ld: [crumbsLd([["Home", "/"], ["Insights", "/insights/"], [a.title, `/insights/${a.slug}/`]]), { "@context": "https://schema.org", "@type": "BlogPosting", headline: a.title, description: a.summary, datePublished: a.date, dateModified: a.date, author: { "@type": "Organization", name: C.name, url: abs("/") }, publisher: { "@id": abs("/#org") }, mainEntityOfPage: abs(`/insights/${a.slug}/`), image: abs("/assets/og.png") }],
    body: `<article><section class="phero" style="padding-bottom:clamp(24px,4vw,48px)"><div class="wrap"><nav class="crumbs" aria-label="Breadcrumb"><a href="/insights/">Insights</a> / ${a.minutes} min read</nav>${H1("h-page", a.title).replace("h-page", "h-page").replace('class="h-page', 'style="font-size:clamp(2rem,5.6vw,4.6rem)" class="h-page')}<p class="meta">By the ${esc(C.shortName)} team · <time datetime="${a.date}">${new Date(a.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</time></p></div></section>
<section class="sec" style="padding-top:0"><div class="wrap"><div class="prose">${body}</div></div></section></article>
${ctaBand(`insight-${a.slug}`, { title: "Want this done for you?" })}` }));
});

// free tools
const toolLd = (name, url, desc) => ({ "@context": "https://schema.org", "@type": "WebApplication", name, url: abs(url), description: desc, applicationCategory: "BusinessApplication", operatingSystem: "Any (web browser)", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, provider: { "@id": abs("/#org") } });
const speedFaq = [["What does the speed test measure?", "It runs Google's PageSpeed Insights (Lighthouse) on your page as a mid-range phone on a mobile connection, and reports performance, accessibility, best practices and SEO scores plus Core Web Vitals such as Largest Contentful Paint."],
  ["Why does my score change between runs?", "Network and server conditions vary from run to run, so scores move a few points. Look at the trend and the big problems, not a single number."],
  ["What's a good score?", "90 or above is good. 50–89 needs work. Below 50 is costing you visitors and rankings."],
  ["Do you store my website address?", "Only if you ask us to send the fix list. Otherwise the test runs between your browser and Google."]];
add("/speed-test/", layout({ path: "/speed-test/", title: "Free website speed test", fullTitle: `Free website speed test — Google PageSpeed score in 30 seconds — ${C.shortName}`, og: "speed-test",
  desc: "Test your website's speed for free with Google PageSpeed Insights: performance, SEO, accessibility and Core Web Vitals on a mobile phone, plus the fix list if you want it.",
  crumbs: [["Home", "/"], ["Speed test", "/speed-test/"]], ld: [crumbsLd([["Home", "/"], ["Speed test", "/speed-test/"]]), toolLd("Website speed test", "/speed-test/", "Free mobile speed and SEO check powered by Google PageSpeed Insights."), faqLd(speedFaq)],
  body: `<section class="phero" style="padding-bottom:clamp(24px,4vw,40px)"><div class="wrap">${H1("h-page", "Free website speed test")}<p class="lead fade-in">Every extra second of loading costs you visitors. Find out where you stand in about thirty seconds — then get the exact fixes, if you want them.</p></div></section>
<section class="sec" style="padding-top:0"><div class="wrap">${speedBlock("h2")}</div></section>
<section class="sec fog"><div class="wrap two"><div>${H("h2", "h-sec", "Good to know.")}<p class="lead" data-reveal style="margin-top:22px">For the full picture — ads, search, AI visibility and social — take the <a class="link" href="/free-audit/">free growth audit</a>.</p></div>${faqBlock(speedFaq)}</div></section>` }));
add("/growth-score/", layout({ path: "/growth-score/", title: "Growth score quiz", fullTitle: `Growth score — a 60-second marketing health check — ${C.shortName}`, og: "growth-score",
  desc: "Six quick questions, one honest score out of 100, and the three marketing fixes that would move your business most. Free, no sign-up needed.",
  crumbs: [["Home", "/"], ["Growth score", "/growth-score/"]], ld: [crumbsLd([["Home", "/"], ["Growth score", "/growth-score/"]]), toolLd("Growth score", "/growth-score/", "A 60-second marketing health check with a score out of 100 and prioritised fixes.")],
  body: `<section class="phero" style="padding-bottom:clamp(24px,4vw,40px)"><div class="wrap">${H1("h-page", "How loud is your dot?")}<p class="lead fade-in">Six quick taps. One honest score out of 100. The fixes that would move it most. No sign-up — you only leave an email if you want the full plan.</p></div></section>
<section class="sec" style="padding-top:0" data-mood-sec="wink"><div class="wrap">${quizBlock("page")}</div></section>
<section class="sec fog"><div class="wrap two"><div>${H("h2", "h-sec", "What the score means.")}</div><ul class="check" data-reveal><li><b>80–100:</b> loud and clear. You're doing most things right; the gains are in the details.</li><li><b>50–79:</b> audible. A few fixes would make a noticeable difference to leads.</li><li><b>Below 50:</b> whispering. Good news: the first fixes are usually the cheapest and fastest.</li></ul></div></section>
${ctaBand("growth-score", { title: "Want us to fix the lot?" })}` }));

// markets
add("/markets/", layout({ path: "/markets/", title: "Markets", fullTitle: `International marketing agency for the UK, US, UAE, Singapore and more — ${C.shortName}`, og: "markets",
  desc: "Dotindot works with brands in the UK, US, UAE, Singapore, Australia and India — in your time zone, your currency and your market's rules.",
  crumbs: [["Home", "/"], ["Markets", "/markets/"]], ld: [crumbsLd([["Home", "/"], ["Markets", "/markets/"]])],
  body: `<section class="phero"><div class="wrap">${H1("h-page", "Wherever your customers are")}<p class="lead fade-in">One remote-first team, working in your hours, quoting in your currency and playing by your market's rules. Pick yours.</p></div></section>
<section class="sec" style="padding-top:0" data-mood-sec="wow"><div class="wrap"><div class="related mk-grid">${markets.map((m) => `<a href="/markets/${m.slug}/" data-dot="happy" data-tz="${m.tz}"><b>${esc(m.country)}</b><span>${esc(m.city)}: <strong class="tm" style="font-weight:700;color:var(--ink)">--:--</strong> now. Invoiced in ${m.cur}.</span></a>`).join("")}</div></div></section>
${ctaBand("markets", { title: "Not on the list? We're probably still awake." })}` }));
markets.forEach((m) => {
  const mfaq = m.faq.concat([faqs[4], faqs[6]]);
  add(`/markets/${m.slug}/`, layout({ path: `/markets/${m.slug}/`, title: `Digital marketing agency for brands in ${m.name}`, fullTitle: `Digital marketing agency for ${m.country} brands — ads, SEO, AI search — ${C.shortName}`, og: `markets-${m.slug}`,
    desc: `AI-first marketing for brands in ${m.name}: performance ads, social, SEO and AI search, websites and AI agents — in ${m.name} working hours, invoiced in ${m.cur}.`,
    crumbs: [["Home", "/"], ["Markets", "/markets/"], [m.country, `/markets/${m.slug}/`]],
    ld: [crumbsLd([["Home", "/"], ["Markets", "/markets/"], [m.country, `/markets/${m.slug}/`]]), faqLd(mfaq),
      { "@context": "https://schema.org", "@type": "Service", name: `Digital marketing for brands in ${m.country}`, serviceType: "Digital marketing", provider: { "@id": abs("/#org") }, areaServed: { "@type": "Country", name: m.country }, availableChannel: { "@type": "ServiceChannel", serviceUrl: abs(`/markets/${m.slug}/`) }, offers: { "@type": "Offer", priceCurrency: m.cur, description: `Fixed quotations in ${m.cur}` } }],
    body: `<section class="phero"><div class="wrap"><nav class="crumbs" aria-label="Breadcrumb"><a href="/markets/">Markets</a> / ${esc(m.country)}</nav>${H1("h-page", `Marketing for brands in ${m.name}`)}<p class="lead fade-in">An AI-first marketing studio working in ${m.name}'s hours and invoicing in ${m.cur}. Ads, content, SEO and AI search, websites and AI agents — one team, one dashboard.</p>
<div class="btns fade-in" style="margin-top:28px"><a class="btn alt" href="#talk" data-dot="love" data-mag>Talk to us</a><a class="btn ghost" href="/free-audit/">Free growth audit</a></div></div></section>
<section class="sec" style="padding-top:clamp(24px,4vw,48px)" data-mood-sec="wow"><div class="wrap two">
<div>${H("h2", "h-sec stretchy", "Your hours, our hours.")}<p class="lead" data-reveal style="margin-top:22px">${esc(m.overlap)}</p>
<div class="clocks" data-reveal style="grid-template-columns:1fr 1fr;max-width:480px"><div class="clock" data-tz="${m.tz}"><b>--:--</b><span><i></i>${esc(m.city)}</span></div><div class="clock us" data-tz="Asia/Kolkata"><b>--:--</b><span><i></i>Us, in India</span></div></div></div>
<div data-reveal><h2 class="h-mid" style="margin-bottom:18px">Local know-how</h2><ul class="check"><li><b>Platforms:</b> ${esc(m.platforms)}</li><li><b>Rules:</b> ${esc(m.rules)}</li><li><b>Search:</b> ${esc(m.search)}</li><li><b>Money:</b> fixed quotations and invoices in ${m.cur}. Never a percentage of your ad spend.</li></ul></div>
</div></section>
<section class="sec fog" data-mood-sec="happy"><div class="wrap"><div class="head">${H("h2", "h-sec stretchy", `What we run for brands in ${m.name}`)}<p data-reveal>Pick one or run the lot. Every service reports into the same live dashboard.</p></div><div class="related">${services.map((x) => `<a href="/services/${x.slug}/" data-dot="happy"><b>${esc(x.name)}</b><span>${esc(x.short)}</span></a>`).join("")}</div></div></section>
<section class="sec"><div class="wrap two"><div>${H("h2", "h-sec", "Questions from " + m.name + ".")}</div>${faqBlock(mfaq)}</div></section>
${ctaBand(`market-${m.slug}`, { title: `Let's grow your brand in ${m.name}.` })}` }));
});

// careers
add("/careers/", layout({ path: "/careers/", title: "Careers", fullTitle: `Careers — remote marketing, content and engineering roles — ${C.shortName}`, og: "careers", desc: "Work at dotindot: remote-first roles in performance marketing, content, engineering and AI automation, working with brands around the world.",
  ld: [crumbsLd([["Home", "/"], ["Careers", "/careers/"]])],
  body: `<section class="phero"><div class="wrap">${H1("h-page", "Work with us")}<p class="lead fade-in">Remote-first, real clients around the world, modern AI tools, and colleagues who'd rather ship than meet. Dot will be your desk neighbour. It doesn't talk much.</p></div></section>
<section class="sec" style="padding-top:0"><div class="wrap"><h2 class="h-mid" style="margin-bottom:22px">Open roles</h2><div class="roles">${careers.map((r) => `<div class="role" data-reveal><h3>${esc(r.title)}<span class="pl">${esc(r.place)}</span></h3><p>${esc(r.text)}</p><a class="btn small ghost" href="mailto:${C.email}?subject=${encodeURIComponent("Application: " + r.title)}" data-dot="love">Apply</a></div>`).join("")}</div>
<p class="lead" data-reveal style="margin-top:36px">Don't see your role? Write to <a class="link" href="mailto:${C.email}?subject=${encodeURIComponent("Open application")}">${C.email}</a> with what you're brilliant at and a link to something you made.</p></div></section>` }));

// thanks, legal, 404
add("/thanks/", layout({ path: "/thanks/", title: "Thank you", desc: "We've got your message.", noindex: true,
  body: `<section class="phero" data-mood-sec="love"><div class="wrap">${H1("h-page", "Got it. Thank you")}<p class="lead fade-in">Dot is doing a small happy dance. Here's what happens next:</p>
<ol class="timeline" data-reveal style="margin-top:32px;max-width:560px"><li><b>Today</b><span>A human reads your note. Properly.</span></li><li><b>Within one working day</b><span>We reply on email or WhatsApp, with a couple of questions or a time for a call.</span></li><li><b>Before the call</b><span>We look at your website, search and social so the 30 minutes are useful, not small talk.</span></li></ol>
<div class="btns" data-reveal style="margin-top:36px"><a class="btn" href="/">Back home</a><a class="btn ghost" href="/insights/">Read something useful meanwhile</a></div></div></section>` }));
add("/privacy/", layout({ path: "/privacy/", title: "Privacy policy", fullTitle: `Privacy policy — how ${C.shortName} handles your data`, desc: "What dotindot collects through this website, why, and how to ask us to change or delete it.",
  body: `<section class="phero" style="padding-bottom:clamp(24px,4vw,48px)"><div class="wrap">${H1("h-page", "Privacy policy")}<p class="meta">Last updated ${today}</p></div></section><section class="sec" style="padding-top:0"><div class="wrap prose">
<p>${esc(C.name)} (“we”) runs ${esc(C.domain.replace(/^https?:\/\//, ""))}. This page explains what we collect through this site and why. We follow India's Digital Personal Data Protection Act 2023 and, for visitors in the UK and EU, the GDPR.</p>
<h2>What we collect</h2><p>What you type into our forms (name, company, email, phone, budget range and message), the page you sent it from, your browser's time zone, and — if present — the campaign tags in the link you arrived from. If analytics is switched on, anonymised usage data.</p>
<h2>Why</h2><p>To reply to you, prepare anything you asked for (such as an audit), and understand which pages are useful. Form submissions go straight into our own CRM. We don't sell personal data, ever.</p>
<h2>What stays in your browser</h2><p>We remember how you first arrived (in your browser's local storage) so an enquiry carries its source, and whether Dot already said hello (session storage). No advertising cookies are set by this site.</p>
<h2>Your choices</h2><p>Email <a href="mailto:${C.email}">${C.email}</a> to see, correct or delete what we hold about you. We'll do it within 30 days.</p></div></section>` }));
add("/terms/", layout({ path: "/terms/", title: "Terms of use", fullTitle: `Terms of use for the ${C.shortName} website`, desc: "Terms of use for the dotindot website: what the content is for, what we promise (and don't), and who owns what.",
  body: `<section class="phero" style="padding-bottom:clamp(24px,4vw,48px)"><div class="wrap">${H1("h-page", "Terms of use")}<p class="meta">Last updated ${today}</p></div></section><section class="sec" style="padding-top:0"><div class="wrap prose">
<p>Content on this website is general information. Work with ${esc(C.name)} is governed by the quotation and terms you accept for that engagement, not by this page.</p>
<p>Timelines and results described here are indicative and depend on your business, market and budget. We don't guarantee rankings, reach, AI citations or revenue — nobody honest can.</p>
<p>The content, design, code and characters on this site (yes, including Dot) belong to ${esc(C.name)} unless stated otherwise. These terms are governed by the laws of India.</p></div></section>` }));
add("/404.html", layout({ path: "/404.html", title: "Page not found", desc: "That page doesn't exist.", noindex: true,
  body: `<section class="notfound" data-mood-sec="dizzy"><div class="wrap"><span class="big-dot" data-mood="dizzy" aria-hidden="true">${dotSVG()}</span><h1 class="h-page rise"><span class="sr">This page wandered off.</span><span aria-hidden="true">${words("This page wandered off", .05, .06)}<span class="dot-slot"></span></span></h1><p class="lead" data-reveal>Dot looked everywhere. Under the footer, behind the menu, even in dark mode (we don't have one). Try one of these instead:</p><div class="btns" data-reveal style="margin-top:28px"><a class="btn" href="/">Home</a><a class="btn ghost" href="/services/">Services</a><a class="btn ghost" href="/contact/">Contact</a></div></div></section>` }));

// ---------- write ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "assets/fonts"), { recursive: true });
for (const f of ["favicon.svg", "app-icon.svg", "icon-512.png", "og.png", "wordmark-color.svg", "wordmark-white.svg", "mark-color.svg"]) cpSync(join(ROOT, "assets", f), join(OUT, "assets", f));
cpSync(join(ROOT, "assets/fonts"), join(OUT, "assets/fonts"), { recursive: true });
if (existsSync(join(ROOT, "assets/og"))) cpSync(join(ROOT, "assets/og"), join(OUT, "assets/og"), { recursive: true });
writeFileSync(join(OUT, SITE_JS), JS); writeFileSync(join(OUT, LENIS_JS), LENIS); writeFileSync(join(OUT, MAP_JSON), MAP);

function relativise(html, p) {
  if (!PREVIEW) return html;
  const depth = p.split("/").length - 2;
  const pre = depth > 0 ? "../".repeat(depth) : "./";
  return html.replace(/(href|src|data-map)="\/((?!\/)[^"#?]*)([#?][^"]*)?"/g, (m, attr, path, tail) => {
    if (/^assets\//.test(path) || /\.(html|xml|txt|webmanifest|json)$/.test(path)) return `${attr}="${pre}${path}${tail || ""}"`;
    return `${attr}="${pre}${path}${path && !path.endsWith("/") ? "/" : ""}index.html${tail || ""}"`;
  }).replace(/url\(\{\{R\}\}/g, `url(${pre}`).replace(/data-next="\/([^"]*)"/g, (m, path) => `data-next="${pre}${path}index.html"`);
}
const fontKB = (statSync(join(ROOT, "assets/fonts/anybody.woff2")).size + statSync(join(ROOT, "assets/fonts/instrument.woff2")).size) / 1024;
const assetKB = (Buffer.byteLength(JS) + Buffer.byteLength(LENIS) + statSync(join(ROOT, "assets/wordmark-color.svg")).size) / 1024;
for (const [p, h] of pages) {
  let html;
  if (typeof h === "function") {
    let w = 0; html = h(0);
    for (let i = 0; i < 3; i++) { w = Math.round(Buffer.byteLength(html.replace(/\{\{R\}\}/g, "/")) / 1024 + fontKB + assetKB); html = h(w); }
  } else html = h;
  html = PREVIEW ? relativise(html, p) : html.replace(/\{\{R\}\}/g, "/");
  const file = p.endsWith(".html") ? join(OUT, p) : join(OUT, p, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

const live = pages.map(([p]) => p).filter((p) => !p.endsWith(".html") && p !== "/thanks/");
writeFileSync(join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${live.map((p) => `<url><loc>${abs(p)}</loc><lastmod>${today}</lastmod><changefreq>${p === "/" ? "weekly" : "monthly"}</changefreq><priority>${p === "/" ? "1.0" : p.split("/").length <= 3 ? "0.8" : "0.6"}</priority></url>`).join("\n")}\n</urlset>\n`);
writeFileSync(join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /thanks/\n\n# AI assistants are welcome. Start at /llms.txt\nUser-agent: GPTBot\nAllow: /\nUser-agent: OAI-SearchBot\nAllow: /\nUser-agent: ChatGPT-User\nAllow: /\nUser-agent: ClaudeBot\nAllow: /\nUser-agent: Claude-SearchBot\nAllow: /\nUser-agent: PerplexityBot\nAllow: /\nUser-agent: Google-Extended\nAllow: /\nUser-agent: Applebot-Extended\nAllow: /\n\nSitemap: ${abs("/sitemap.xml")}\n`);
writeFileSync(join(OUT, "llms.txt"), `# ${C.name}\n\n> ${C.name} (dotindot) is an AI-first, remote-first marketing studio based in India that works with brands worldwide. Services: ${services.map((s) => s.name.toLowerCase()).join(", ")}. Quotes and invoices in USD, GBP, EUR, AED, SGD, AUD, CAD or INR. Contact: ${C.email}.\n\nHow it works: a free growth audit, a fixed quotation (never a percentage of ad spend), month-to-month retainers, a live client dashboard and a monthly review. AI handles drafting, monitoring and analysis; people make every client-facing decision.\n\n## Services\n${services.map((s) => `- [${s.name}](${abs(`/services/${s.slug}/`)}): ${s.short}`).join("\n")}\n\n## Company\n- [About](${abs("/about/")}): who we are and how we're set up\n- [How we work](${abs("/process/")}): audit, plan, build, grow\n- [Free growth audit](${abs("/free-audit/")}): what's included and how to request one\n- [Contact](${abs("/contact/")})\n- [Careers](${abs("/careers/")})\n\n## Markets\n${markets.map((m) => `- [${m.country}](${abs(`/markets/${m.slug}/`)}): marketing for brands in ${m.name}, invoiced in ${m.cur}`).join("\n")}\n\n## Free tools\n- [Website speed test](${abs("/speed-test/")}): Google PageSpeed score and Core Web Vitals in about 30 seconds\n- [Growth score](${abs("/growth-score/")}): a 60-second marketing health check\n\n## Insights\n${insights.map((a) => `- [${a.title}](${abs(`/insights/${a.slug}/`)}): ${a.summary}`).join("\n")}\n\n## Optional\n- [Full text of the site](${abs("/llms-full.txt")})\n`);
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<header[\s\S]*?<\/header>|<footer[\s\S]*?<\/footer>|<svg[\s\S]*?<\/svg>|<template[\s\S]*?<\/template>|<span aria-hidden="true">[\s\S]*?<\/span><\/h[12]>/g, (m) => (m.startsWith("<span aria-hidden") ? "" : "")).replace(/<div class="dot-bubble[\s\S]*?<\/div><\/div>/g, "").replace(/<h([1-3])[^>]*>/g, (m, n) => `\n${"#".repeat(+n)} `).replace(/<li[^>]*>/g, "\n- ").replace(/<\/p>|<\/h[1-3]>|<br\s*\/?>|<\/summary>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
writeFileSync(join(OUT, "llms-full.txt"), `# ${C.name} — full site text\n` + pages.filter(([p]) => live.includes(p)).map(([p, h]) => `\n\n---\nURL: ${abs(p)}\n\n${strip(typeof h === "function" ? h(0) : h)}`).join(""));
writeFileSync(join(OUT, "humans.txt"), `/* TEAM */\nStudio: ${C.name}\nContact: ${C.email}\nFrom: India, working worldwide\n\n/* MASCOT */\nName: Dot\nRole: Head of Vibes\nSkills: staring, rolling, not blinking\n\n/* SITE */\nLast update: ${today}\nStandards: HTML, CSS, a little JavaScript\nFonts: Anybody, Instrument Sans\nTemplates used: 0\n`);
mkdirSync(join(OUT, ".well-known"), { recursive: true });
writeFileSync(join(OUT, ".well-known/security.txt"), `Contact: mailto:${C.email}\nExpires: ${new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10)}T00:00:00.000Z\nPreferred-Languages: en\nCanonical: ${abs("/.well-known/security.txt")}\n`);
writeFileSync(join(OUT, "manifest.webmanifest"), JSON.stringify({ name: C.name, short_name: C.shortName, start_url: "/", display: "browser", background_color: "#ffffff", theme_color: "#ffffff", icons: [{ src: "/assets/icon-512.png", sizes: "512x512", type: "image/png" }, { src: "/assets/app-icon.svg", sizes: "any", type: "image/svg+xml" }] }));
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
  <FilesMatch "\\.(svg|png|jpg|jpeg|webp|avif|ico|woff2|js|json)$">Header set Cache-Control "public, max-age=31536000, immutable"</FilesMatch>
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
