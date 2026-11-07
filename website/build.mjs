// dotindot.in static site builder — `node build.mjs` → dist/. No framework, no runtime JS beyond site.js.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { services, industries, steps, faqs, insights, careers } from "./src/content.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const C = JSON.parse(readFileSync(join(ROOT, "site.config.json"), "utf8"));
const OUT = join(ROOT, "dist");
const CSS = readFileSync(join(ROOT, "src/styles.css"), "utf8").replace(/\n\s*/g, "\n").trim();
const JS = readFileSync(join(ROOT, "src/site.js"), "utf8");
const ICONS = {
  wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.5 3.5A11.8 11.8 0 0 0 12 0C5.5 0 .2 5.3.2 11.8c0 2.1.5 4.1 1.6 5.9L0 24l6.5-1.7a11.8 11.8 0 0 0 5.5 1.4c6.5 0 11.8-5.3 11.8-11.8 0-3.2-1.2-6.1-3.3-8.4ZM12 21.7c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.8 1 1-3.7-.2-.4A9.8 9.8 0 0 1 2.2 11.8C2.2 6.4 6.6 2 12 2a9.8 9.8 0 0 1 9.8 9.8c0 5.4-4.4 9.9-9.8 9.9Zm5.4-7.3c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1l-.9 1.2c-.2.2-.3.2-.6.1a8 8 0 0 1-4-3.5c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5 1.9.8 2.6.9 3.6.7.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4l-.6-.3Z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.8 2.1Z"/></svg>',
};
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
const abs = (p) => C.domain.replace(/\/$/, "") + p;
const tel = C.phone.replace(/[^\d+]/g, "");
const wa = (text) => `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(text || "Hi dotindot, I’d like to talk about growing my business.")}`;
const today = new Date().toISOString().slice(0, 10);

const NAV = [["/services/", "Services"], ["/work/", "How we work"], ["/insights/", "Insights"], ["/about/", "About"], ["/locations/", "Locations"], ["/contact/", "Contact"]];

function jsonld(obj) { return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`; }
const ORG = {
  "@context": "https://schema.org", "@type": "MarketingAgency", "@id": abs("/#org"), name: C.name, alternateName: C.shortName, url: abs("/"), logo: abs("/assets/icon-512.png"),
  image: abs("/assets/og.png"), description: "AI marketing-tech agency in Erode, Coimbatore and Chennai: performance marketing, social media, SEO & AI search, websites and apps, branding and video, AI automation.",
  email: C.email, telephone: C.phone, foundingDate: C.founded, areaServed: ["Tamil Nadu", "India", "United Kingdom", "United Arab Emirates", "Singapore"],
  sameAs: Object.values(C.social).filter(Boolean), address: { "@type": "PostalAddress", streetAddress: `${C.locations[0].line1}, ${C.locations[0].line2}`, addressLocality: C.locations[0].city, addressRegion: C.locations[0].state, postalCode: C.locations[0].pincode, addressCountry: "IN" },
  knowsAbout: services.map((s) => s.name), slogan: "Growth you can count.",
  hasOfferCatalog: { "@type": "OfferCatalog", name: "Services", itemListElement: services.map((s) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: s.name, url: abs(`/services/${s.slug}/`) } })) },
};
const localBiz = (l) => ({ "@context": "https://schema.org", "@type": "MarketingAgency", "@id": abs(`/locations/${l.slug}/#place`), name: `${C.name} — ${l.city}`, parentOrganization: { "@id": abs("/#org") }, url: abs(`/locations/${l.slug}/`),
  telephone: l.phone, email: C.email, image: abs("/assets/og.png"), priceRange: "₹₹", address: { "@type": "PostalAddress", streetAddress: `${l.line1}, ${l.line2}`, addressLocality: l.city, addressRegion: l.state, postalCode: l.pincode, addressCountry: "IN" },
  geo: { "@type": "GeoCoordinates", latitude: l.lat, longitude: l.lng }, hasMap: l.mapsUrl, openingHoursSpecification: { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], opens: "09:30", closes: "18:30" }, areaServed: l.city });
const breadcrumbs = (items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map(([name, url], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(url) })) });
const faqLd = (qa) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });

function layout({ path, title, desc, body, ld = [], crumbs = null, type = "website", noindex = false }) {
  const url = abs(path);
  const fullTitle = path === "/" ? `${C.name} — AI marketing-tech agency in Erode, Coimbatore & Chennai` : `${title} · ${C.shortName}`;
  const nav = NAV.map(([p, l]) => `<a href="${p}"${path.startsWith(p) ? ' aria-current="page"' : ""}>${l}</a>`).join("");
  const ga = C.ga4 ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${C.ga4}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${C.ga4}',{anonymize_ip:true})</script>` : "";
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
${noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">'}
<meta name="theme-color" content="#ff831f">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/assets/icon-512.png"><link rel="manifest" href="/manifest.webmanifest">
<meta property="og:type" content="${type}"><meta property="og:site_name" content="${esc(C.name)}"><meta property="og:title" content="${esc(fullTitle)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${abs("/assets/og.png")}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(fullTitle)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${abs("/assets/og.png")}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,500..800&display=swap"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,500..800&display=swap" media="print" onload="this.media='all'"><noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,500..800&display=swap"></noscript>
<style>${CSS}</style>
${ld.map(jsonld).join("\n")}
${ga}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="hdr"><div class="wrap">
<a class="logo" href="/" aria-label="${esc(C.shortName)} home"><img src="/assets/wordmark-color.svg" alt="dotindot." width="135" height="26"></a>
<nav class="nav" aria-label="Main">${nav}</nav>
<a class="btn flame cta" href="/free-audit/">Free growth audit</a>
<button class="burger" aria-label="Menu" aria-expanded="false">${ICONS.menu}</button>
</div></header>
<main id="main">
${crumbs ? `<div class="wrap"><nav class="crumbs" aria-label="Breadcrumb">${crumbs.map(([n, u], i) => (i === crumbs.length - 1 ? `<span>${esc(n)}</span>` : `<a href="${u}">${esc(n)}</a> › `)).join("")}</nav></div>` : ""}
${body}
</main>
<footer class="ftr"><div class="wrap">
<div class="grid">
<div><img src="/assets/wordmark-color.svg" alt="dotindot." width="124" height="24" loading="lazy"><p style="margin:14px 0 6px;max-width:36ch">${esc(C.tagline)} from Erode, Coimbatore and Chennai — serving businesses across Tamil Nadu and clients abroad.</p>
<p class="small"><a href="mailto:${C.email}">${C.email}</a><br><a href="tel:${tel}">${esc(C.phoneDisplay)}</a> · ${esc(C.hours)}</p>
<p class="small muted">${C.certifications.map(esc).join(" · ")}</p></div>
<div><h4>Services</h4><ul>${services.map((s) => `<li><a href="/services/${s.slug}/">${esc(s.name)}</a></li>`).join("")}</ul></div>
<div><h4>Company</h4><ul><li><a href="/work/">How we work</a></li><li><a href="/about/">About</a></li><li><a href="/insights/">Insights</a></li><li><a href="/careers/">Careers</a></li><li><a href="/contact/">Contact</a></li><li><a href="/free-audit/">Free growth audit</a></li></ul></div>
<div><h4>Offices</h4><ul>${C.locations.map((l) => `<li><a href="/locations/${l.slug}/">${esc(l.city)}</a></li>`).join("")}</ul>
<h4 style="margin-top:18px">Follow</h4><ul>${Object.entries(C.social).filter(([, v]) => v).map(([k, v]) => `<li><a href="${v}" rel="noopener me" target="_blank">${k[0].toUpperCase() + k.slice(1)}</a></li>`).join("")}</ul></div>
</div>
<div class="bottom"><span>© ${new Date().getFullYear()} ${esc(C.name)}. All rights reserved. · <a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a></span>
<a class="emp" href="${C.internalUrl}" rel="nofollow noopener">Employee login ${ICONS.arrow.replace("<svg", '<svg width="14" height="14"')}</a></div>
</div></footer>
<a class="wa-fab" href="${wa()}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">${ICONS.wa}</a>
<script>window.__DD={intake:${JSON.stringify(C.leadIntakeUrl)},whatsapp:${JSON.stringify(C.whatsapp)},phone:${JSON.stringify(C.phoneDisplay)}}</script>
<script defer src="/assets/site.js"></script>
</body></html>`;
}

// ---------- shared blocks
const leadForm = (id, { interest = true, budget = false, website = false, button = "Send", next = "" } = {}) => `
<form class="form" data-lead="${id}" ${next ? `data-next="${next}"` : ""} novalidate>
<label>Your name<input name="name" autocomplete="name" required></label>
<label>Phone / WhatsApp<input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="+91"></label>
<label>Email<input name="email" type="email" autocomplete="email"></label>
<label>Company<input name="company" autocomplete="organization"></label>
${website ? `<label class="full">Website or Instagram<input name="website" placeholder="https://"></label>` : ""}
${interest ? `<label>What do you need help with?<select name="interest"><option>Leads & sales (ads)</option><option>Social media growth</option><option>SEO & AI search</option><option>Website or app</option><option>Branding or video</option><option>AI & automation</option><option>Not sure yet</option></select></label>` : ""}
${budget ? `<label>Monthly marketing budget<select name="budget"><option value="">Prefer not to say</option><option>Under ₹50,000</option><option>₹50,000 – ₹1.5 lakh</option><option>₹1.5 – ₹5 lakh</option><option>Above ₹5 lakh</option><option>Project (one-off)</option></select></label>` : ""}
<label class="full">Tell us a little about the business<textarea name="message" rows="3"></textarea></label>
<label class="hp" aria-hidden="true">Leave empty<input name="_company_site" tabindex="-1" autocomplete="off"></label>
<div class="full" style="display:flex;flex-wrap:wrap;gap:12px;align-items:center"><button class="btn" type="submit">${button}</button><a class="btn ghost wa" href="${wa()}" target="_blank" rel="noopener">${ICONS.wa} WhatsApp instead</a></div>
<p class="status" role="status" aria-live="polite"></p>
</form>`;

const ledger = (open = 0) => `<div class="ledger">${services.map((s, i) => `
<details${i === open ? " open" : ""}><summary><h3>${esc(s.name)}</h3><p>${esc(s.short)}</p><span class="pl">${ICONS.plus}</span></summary>
<div class="body"><p class="lead" style="font-size:1.05rem">${esc(s.promise)}</p><div><ul>${s.deliverables.slice(0, 4).map((d) => `<li>${esc(d)}</li>`).join("")}</ul><p class="more"><a href="/services/${s.slug}/">More about ${esc(s.name.toLowerCase())} ${ICONS.arrow.replace("<svg", '<svg width="14" height="14" style="vertical-align:-2px"')}</a></p></div></div>
</details>`).join("")}</div>`;

const stepsBlock = () => `<div class="steps">${steps.map((s) => `<div class="step" data-n="${s.n}"><div class="n">${s.n}</div><h3>${esc(s.title)}</h3><div class="when">${esc(s.when)}</div><p>${esc(s.text)}</p></div>`).join("")}</div>`;
const faqBlock = (qa) => `<div class="faq">${qa.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>`;
const auditCta = () => `<section class="sec ink" id="audit"><div class="wrap audit-grid">
<div><h2 class="dot">Start with a free growth audit</h2><p class="lead" style="color:#d9d1c9">In five working days you get a written, 20-point review of your website, Google presence, social accounts and ads — and a 30-minute call to walk through it. No obligation.</p>
<ul><li>Website speed, SEO and conversion check</li><li>Google Business Profile and reviews</li><li>Social growth and content gaps</li><li>Ad account health and cost per lead</li><li>Three things to fix this month, in order</li></ul></div>
<div>${leadForm("free-audit", { website: true, budget: true, button: "Get my free audit" })}</div>
</div></section>`;
const proof = () => {
  const p = C.proof, rows = [[p.clientsServed, "clients served"], [p.leadsGenerated, "leads generated"], [p.adSpendManaged, "ad spend managed"], [p.yearsActive, "years in business"]].filter(([v]) => v);
  return rows.length ? `<div class="stats">${rows.map(([v, l]) => `<div><b>${esc(v)}</b><span>${l}</span></div>`).join("")}</div>` : "";
};
const testimonials = () => (C.testimonials || []).length ? `<section class="sec tight"><div class="wrap"><div class="cards">${C.testimonials.map((t) => `<blockquote class="card"><p style="font-size:1.05rem">“${esc(t.quote)}”</p><footer class="small muted">${esc(t.name)}, ${esc(t.role)}</footer></blockquote>`).join("")}</div></div></section>` : "";
const locsBlock = () => `<div class="locs">${C.locations.map((l) => `<a class="loc" href="/locations/${l.slug}/"><h3>${esc(l.city)}${l.hq ? '<span class="hq">HQ</span>' : ""}</h3><p class="small muted" style="margin:0">${esc(l.line1)}, ${esc(l.line2)}<br>${esc(l.city)} ${esc(l.pincode)}</p></a>`).join("")}</div>`;

// ---------- pages
const pages = [];
const add = (path, html) => pages.push([path, html]);

add("/", layout({
  path: "/", title: "Home", desc: "Dotindot Creative is an AI marketing-tech agency in Erode, Coimbatore and Chennai. Performance marketing, social media, SEO & AI search, websites, branding, video and AI automation — judged on leads, not likes.",
  ld: [ORG, { "@context": "https://schema.org", "@type": "WebSite", url: abs("/"), name: C.name, publisher: { "@id": abs("/#org") } }, faqLd(faqs)],
  body: `
<section class="hero"><div class="wrap">
<div><div class="kick"><b></b>AI marketing-tech agency · Erode · Coimbatore · Chennai</div>
<h1>Growth you can count<span style="color:var(--flame)">.</span></h1>
<p class="lead">Ads, social, search, websites and AI automation for businesses that want more enquiries this quarter — run by a team in Tamil Nadu that reports in leads and rupees, not likes.</p>
<div class="actions"><a class="btn flame" href="/free-audit/">Get a free growth audit ${ICONS.arrow}</a><a class="btn ghost" href="${wa()}" target="_blank" rel="noopener">${ICONS.wa} WhatsApp us</a></div>
<div class="trust"><span>Fixed quotations, no % of ad spend</span><span>Month-to-month retainers</span><span>Live dashboard for every client</span></div>
${proof()}</div>
<div class="dots" aria-hidden="true"><canvas></canvas><span class="cap">Every dot is a lead. The line is what we're hired to move.</span></div>
</div></section>
<section class="sec"><div class="wrap">
<div class="sec-head"><h2 class="dot">What we do</h2><p class="lead">Six services, one job: more of the right customers finding you and buying. Open any row to see what you actually get.</p></div>
${ledger(0)}
</div></section>
<section class="sec mist"><div class="wrap">
<div class="sec-head"><h2 class="dot">Built for businesses like yours</h2><p class="lead">We've learnt the buying journeys of these industries in Tamil Nadu — what a lead costs, what converts, what the front desk hears.</p></div>
<div class="chips">${industries.map((i) => `<span>${esc(i)}</span>`).join("")}</div>
</div></section>
<section class="sec"><div class="wrap">
<div class="sec-head"><h2 class="dot">The first 90 days</h2><p class="lead">Every engagement runs the same way, so you always know what's happening and what it's costing.</p></div>
${stepsBlock()}
</div></section>
<section class="sec tight"><div class="wrap">
<div class="sec-head"><h2 class="dot">What we measure</h2><p class="lead">Every client gets a live dashboard with these numbers — the same one our team works from.</p></div>
<div class="measure"><div><b>Cost per lead</b>by channel, campaign and creative</div><div><b>Followers & views</b>month on month, every platform</div><div><b>Rankings & AI mentions</b>Google positions and assistant citations</div><div><b>Revenue attributed</b>what each channel actually brought in</div></div>
</div></section>
${testimonials()}
${auditCta()}
<section class="sec"><div class="wrap two">
<div><h2 class="dot">Questions we hear a lot</h2><p class="lead">Straight answers. Anything else, just ask.</p></div>
${faqBlock(faqs)}
</div></section>
<section class="sec tight"><div class="wrap"><div class="sec-head"><h2 class="dot">Three offices, one team</h2><p class="lead">Meet us in Erode, Coimbatore or Chennai — or on a call from anywhere.</p></div>${locsBlock()}</div></section>`,
}));

add("/services/", layout({
  path: "/services/", title: "Services", desc: "Performance marketing, social media management, SEO & AI search, websites & apps, branding & video, AI automation — from Dotindot Creative, Tamil Nadu.",
  crumbs: [["Home", "/"], ["Services", "/services/"]], ld: [breadcrumbs([["Home", "/"], ["Services", "/services/"]])],
  body: `<section class="page-head"><div class="wrap"><h1 class="dot">Services</h1><p class="lead">Pick one, or let the audit tell you where to start. Everything is quoted fixed, reported monthly, and owned by you.</p></div></section>
<section class="sec tight"><div class="wrap">${ledger(-1)}</div></section>${auditCta()}`,
}));

for (const s of services) {
  const crumbs = [["Home", "/"], ["Services", "/services/"], [s.name, `/services/${s.slug}/`]];
  add(`/services/${s.slug}/`, layout({
    path: `/services/${s.slug}/`, title: `${s.name} in Erode, Coimbatore & Chennai`, desc: `${s.promise} ${s.short}`.slice(0, 158), crumbs,
    ld: [breadcrumbs(crumbs), { "@context": "https://schema.org", "@type": "Service", name: s.name, serviceType: s.name, provider: { "@id": abs("/#org") }, areaServed: ["Erode", "Coimbatore", "Chennai", "Tamil Nadu", "India"], description: s.promise, url: abs(`/services/${s.slug}/`),
      hasOfferCatalog: { "@type": "OfferCatalog", name: `${s.name} deliverables`, itemListElement: s.deliverables.map((d) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: d } })) } }, faqLd(s.faq)],
    body: `<section class="page-head"><div class="wrap"><h1 class="dot">${esc(s.name)}</h1><p class="lead">${esc(s.promise)}</p>
<div class="actions" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:22px"><a class="btn flame" href="/free-audit/">Get a free audit ${ICONS.arrow}</a><a class="btn ghost" href="${wa(`Hi dotindot, I’d like to talk about ${s.name.toLowerCase()}.`)}" target="_blank" rel="noopener">${ICONS.wa} Ask on WhatsApp</a></div></div></section>
<section class="sec tight"><div class="wrap two"><div class="prose"><p class="lead" style="font-size:1.1rem">${esc(s.intro)}</p><h2 class="dot">What you get</h2><ul>${s.deliverables.map((d) => `<li>${esc(d)}</li>`).join("")}</ul></div>
<div><h2 class="dot" style="font-size:1.6rem">A good fit for</h2><ul>${s.fit.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
<h2 class="dot" style="font-size:1.6rem;margin-top:1.4em">Also see</h2><ul>${services.filter((x) => x.slug !== s.slug).slice(0, 3).map((x) => `<li><a href="/services/${x.slug}/">${esc(x.name)}</a></li>`).join("")}</ul></div></div></section>
<section class="sec mist"><div class="wrap two"><div><h2 class="dot">Questions about ${esc(s.name.toLowerCase())}</h2></div>${faqBlock(s.faq)}</div></section>${auditCta()}`,
  }));
}

add("/work/", layout({
  path: "/work/", title: "How we work", desc: "The dotindot way: a free 20-point audit, a 90-day plan with a fixed quotation, a build you approve, and weekly optimisation against a live dashboard.",
  crumbs: [["Home", "/"], ["How we work", "/work/"]], ld: [breadcrumbs([["Home", "/"], ["How we work", "/work/"]])],
  body: `<section class="page-head"><div class="wrap"><h1 class="dot">How we work</h1><p class="lead">No retainers that drift, no reports nobody reads. One process, the same for a café in Erode and an exporter selling to Dubai.</p></div></section>
<section class="sec tight"><div class="wrap">${stepsBlock()}</div></section>
<section class="sec mist"><div class="wrap two"><div><h2 class="dot">What you'll always have</h2></div><div class="prose"><ul>
<li><b>One fixed quotation</b> per engagement, with the terms you agreed — no percentage of ad spend, no surprise add-ons.</li>
<li><b>A live dashboard</b> with cost per lead, follower growth, views, rankings and revenue by channel. Open it any time; we review it with you monthly.</li>
<li><b>Ownership of everything</b> — ad accounts, social profiles, domains, code and content stay in your name from day one.</li>
<li><b>A named account lead</b> on WhatsApp, and a support desk in your client portal for anything else.</li>
<li><b>Month-to-month retainers</b> with 30 days' notice. We'd rather earn the renewal than lock it in.</li></ul></div></div></section>
${(C.caseStudies || []).length ? `<section class="sec"><div class="wrap"><div class="sec-head"><h2 class="dot">Recent work</h2></div><div class="cards">${C.caseStudies.map((cs) => `<article class="card"><h3>${esc(cs.title)}</h3><p class="small muted">${esc(cs.industry)} · ${esc(cs.city)}</p><p>${esc(cs.result)}</p></article>`).join("")}</div></div></section>` : ""}
${auditCta()}`,
}));

add("/about/", layout({
  path: "/about/", title: "About", desc: "Dotindot Creative is an AI-first digital marketing and web development agency founded in Erode, Tamil Nadu, with teams in Coimbatore and Chennai.",
  crumbs: [["Home", "/"], ["About", "/about/"]], ld: [breadcrumbs([["Home", "/"], ["About", "/about/"]]), { "@context": "https://schema.org", "@type": "AboutPage", mainEntity: { "@id": abs("/#org") } }],
  body: `<section class="page-head"><div class="wrap"><h1 class="dot">A growth team, not a vendor</h1><p class="lead">Dotindot started in Erode with a simple complaint from local business owners: agencies sent pretty reports and nobody could say what a customer cost. We built the agency — and our own software — to answer that question every month.</p></div></section>
<section class="sec tight"><div class="wrap two"><div class="prose">
<h2 class="dot">What makes us different</h2>
<p><b>We're AI-first in practice.</b> Our team runs on an internal platform we built ourselves — lead tracking, growth dashboards, reporting, support — with AI agents doing the repetitive work. The same tooling runs your campaigns, which is why we can be fast and still careful.</p>
<p><b>We measure what the owner cares about.</b> Cost per lead, enquiries that became customers, follower growth that turned into footfall. Every client sees the same dashboard our team works from.</p>
<p><b>We're from here.</b> Erode, Coimbatore and Chennai aren't 'markets' to us; they're where we live and sell. We know what a Tamil-English reel needs to do in Tiruppur and what a Chennai hospital's front desk hears all day.</p>
<p><b>We work with the world.</b> Clients in the UK, UAE and Singapore get Indian execution quality, GST-compliant export invoicing and a team that overlaps their working day.</p>
</div><div>
<h2 class="dot" style="font-size:1.6rem">Where we are</h2>${locsBlock()}
<h2 class="dot" style="font-size:1.6rem;margin-top:1.6em">Credentials</h2><div class="chips">${C.certifications.map((c) => `<span>${esc(c)}</span>`).join("")}</div>
<p class="small muted" style="margin-top:18px">Founded ${esc(C.founded)}. MSME registered. GST invoicing for India and LUT-backed export invoicing for clients abroad.</p>
</div></div></section>
<section class="sec mist"><div class="wrap two"><div><h2 class="dot">Join the team</h2><p class="lead">We hire people who like being judged on results.</p></div><div><ul style="list-style:none;padding:0;display:grid;gap:12px">${careers.map((c) => `<li class="card"><b>${esc(c.title)}</b><span class="small muted">${esc(c.place)}</span><span class="small">${esc(c.text)}</span></li>`).join("")}</ul><p style="margin-top:14px"><a href="/careers/">All openings ${ICONS.arrow.replace("<svg", '<svg width="14" height="14" style="vertical-align:-2px"')}</a></p></div></div></section>
${auditCta()}`,
}));

add("/careers/", layout({
  path: "/careers/", title: "Careers", desc: "Open roles at Dotindot Creative in Erode, Coimbatore and Chennai: performance marketing, content creation, full-stack development.",
  crumbs: [["Home", "/"], ["Careers", "/careers/"]], ld: [breadcrumbs([["Home", "/"], ["Careers", "/careers/"]]), ...careers.map((c) => ({ "@context": "https://schema.org", "@type": "JobPosting", title: c.title, description: c.text, datePosted: today, employmentType: "FULL_TIME", hiringOrganization: { "@id": abs("/#org") }, jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: c.place.split(" ·")[0].split(" or ")[0], addressRegion: "Tamil Nadu", addressCountry: "IN" } } }))],
  body: `<section class="page-head"><div class="wrap"><h1 class="dot">Careers</h1><p class="lead">Small team, real clients, your work measured in the open. Send a short note and something you've made to <a href="mailto:${C.email}?subject=Application">${C.email}</a>.</p></div></section>
<section class="sec tight"><div class="wrap cards">${careers.map((c) => `<article class="card"><h3>${esc(c.title)}</h3><p class="small muted">${esc(c.place)}</p><p>${esc(c.text)}</p><a href="mailto:${C.email}?subject=${encodeURIComponent("Application: " + c.title)}" class="btn ghost" style="align-self:start">Apply by email</a></article>`).join("")}</div></section>`,
}));

add("/insights/", layout({
  path: "/insights/", title: "Insights", desc: "Practical notes on marketing, search and web performance for Indian businesses, from the dotindot team.",
  crumbs: [["Home", "/"], ["Insights", "/insights/"]], ld: [breadcrumbs([["Home", "/"], ["Insights", "/insights/"]])],
  body: `<section class="page-head"><div class="wrap"><h1 class="dot">Insights</h1><p class="lead">Short, practical notes — the things we explain in first meetings, written down.</p></div></section>
<section class="sec tight"><div class="wrap cards">${insights.map((a) => `<a class="card" href="/insights/${a.slug}/"><span class="meta">${new Date(a.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} · ${a.minutes} min read</span><h3>${esc(a.title)}</h3><p class="muted" style="margin:0">${esc(a.summary)}</p></a>`).join("")}</div></section>${auditCta()}`,
}));
for (const a of insights) {
  const crumbs = [["Home", "/"], ["Insights", "/insights/"], [a.title, `/insights/${a.slug}/`]];
  const html = a.body.map((p) => (p.startsWith("## ") ? `<h2>${esc(p.slice(3))}</h2>` : /^\d+\. /.test(p) ? `<ol>${p.split("\n").map((l) => `<li>${md(l.replace(/^\d+\.\s*/, ""))}</li>`).join("")}</ol>` : p.includes("\n**") || p.startsWith("**") ? `<ul>${p.split("\n").map((l) => `<li>${md(l)}</li>`).join("")}</ul>` : `<p>${md(p)}</p>`)).join("\n");
  add(`/insights/${a.slug}/`, layout({
    path: `/insights/${a.slug}/`, title: a.title, desc: a.summary, type: "article", crumbs,
    ld: [breadcrumbs(crumbs), { "@context": "https://schema.org", "@type": "Article", headline: a.title, description: a.summary, datePublished: a.date, dateModified: a.date, author: { "@type": "Organization", name: C.name, url: abs("/") }, publisher: { "@id": abs("/#org") }, mainEntityOfPage: abs(`/insights/${a.slug}/`), image: abs("/assets/og.png") }],
    body: `<article><section class="page-head"><div class="wrap"><p class="meta">${new Date(a.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} · ${a.minutes} min read · by the dotindot team</p><h1>${esc(a.title)}</h1><p class="lead">${esc(a.summary)}</p></div></section>
<section class="sec tight"><div class="wrap prose">${html}</div></section></article>${auditCta()}`,
  }));
}

add("/locations/", layout({
  path: "/locations/", title: "Offices in Erode, Coimbatore & Chennai", desc: "Dotindot Creative offices: Erode (HQ), Coimbatore and Chennai. Digital marketing agency serving Tamil Nadu and clients abroad.",
  crumbs: [["Home", "/"], ["Locations", "/locations/"]], ld: [breadcrumbs([["Home", "/"], ["Locations", "/locations/"]]), ...C.locations.map(localBiz)],
  body: `<section class="page-head"><div class="wrap"><h1 class="dot">Where to find us</h1><p class="lead">Three offices across Tamil Nadu. Walk in, or book a call and we'll come to you.</p></div></section><section class="sec tight"><div class="wrap">${locsBlock()}</div></section>${auditCta()}`,
}));
for (const l of C.locations) {
  const crumbs = [["Home", "/"], ["Locations", "/locations/"], [l.city, `/locations/${l.slug}/`]];
  const localFaq = [[`Do you work with small businesses in ${l.city}?`, `Yes — most of our ${l.city} clients are owner-run businesses: clinics, builders, restaurants, retailers, schools and manufacturers. The free audit is the same for everyone.`],
    [`Can we meet at your ${l.city} office?`, `Yes. ${l.line1}, ${l.line2}, ${l.city} ${l.pincode}. ${C.hours}. Message ahead on WhatsApp and we'll keep the room.`],
    [`Which services are available in ${l.city}?`, `All of them — performance marketing, social media, SEO & AI search, websites, branding & video and AI automation. Shoot days and in-person reviews happen locally; strategy and reporting are shared across the whole team.`]];
  add(`/locations/${l.slug}/`, layout({
    path: `/locations/${l.slug}/`, title: `Digital marketing agency in ${l.city}`, desc: `Dotindot Creative in ${l.city}: performance marketing, social media, SEO & AI search, websites and AI automation for ${l.city} businesses. ${l.line1}, ${l.line2}. Free growth audit.`, crumbs,
    ld: [breadcrumbs(crumbs), localBiz(l), faqLd(localFaq)],
    body: `<section class="page-head"><div class="wrap"><h1 class="dot">Digital marketing agency in ${esc(l.city)}</h1><p class="lead">Ads, social, search, websites and AI automation for ${esc(l.city)} businesses — with a team you can actually meet.</p>
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:22px"><a class="btn flame" href="/free-audit/">Free growth audit ${ICONS.arrow}</a><a class="btn ghost" href="tel:${l.phone.replace(/[^\d+]/g, "")}">${ICONS.phone} ${esc(l.phone)}</a><a class="btn ghost" href="${l.mapsUrl}" target="_blank" rel="noopener">Directions</a></div></div></section>
<section class="sec tight"><div class="wrap two"><div class="prose">
<h2 class="dot">${esc(l.city)} office</h2><p>${esc(l.line1)}, ${esc(l.line2)}<br>${esc(l.city)}, ${esc(l.state)} ${esc(l.pincode)}<br>${esc(C.hours)}</p>
<h2 class="dot">What we do for ${esc(l.city)} businesses</h2><ul>${services.map((s) => `<li><a href="/services/${s.slug}/">${esc(s.name)}</a> — ${esc(s.short)}</li>`).join("")}</ul>
<h2 class="dot">Industries we know in ${esc(l.city)}</h2><div class="chips">${industries.map((i) => `<span>${esc(i)}</span>`).join("")}</div>
</div><div><h2 class="dot" style="font-size:1.6rem">Talk to the ${esc(l.city)} team</h2>${leadForm(`location-${l.slug}`, { budget: true, button: "Request a call back" })}</div></div></section>
<section class="sec mist"><div class="wrap two"><div><h2 class="dot">Questions from ${esc(l.city)}</h2></div>${faqBlock(localFaq)}</div></section>`,
  }));
}

add("/free-audit/", layout({
  path: "/free-audit/", title: "Free 20-point growth audit", desc: "Get a free written audit of your website, Google presence, social media and ads from Dotindot Creative — with the three fixes to make this month. No obligation.",
  crumbs: [["Home", "/"], ["Free growth audit", "/free-audit/"]], ld: [breadcrumbs([["Home", "/"], ["Free growth audit", "/free-audit/"]])],
  body: `<section class="page-head"><div class="wrap"><h1 class="dot">Free 20-point growth audit</h1><p class="lead">Tell us about the business. Within five working days you'll have a written review and a 30-minute call — whether or not you ever hire us.</p></div></section>
<section class="sec tight"><div class="wrap audit-grid"><div>${leadForm("free-audit", { website: true, budget: true, button: "Get my free audit", next: "/thank-you/" })}</div>
<div><h2 class="dot" style="font-size:1.6rem">What the audit covers</h2><ul>
<li><b>Website</b> — speed on a real phone, Core Web Vitals, what stops a visitor enquiring</li><li><b>Search</b> — where you rank, what you're missing, and whether AI assistants mention you</li><li><b>Google Business Profile</b> — completeness, reviews, photos, posts</li><li><b>Social</b> — follower growth, reach, content gaps, best-performing formats</li><li><b>Ads</b> — tracking, cost per lead, wasted spend (read-only access)</li><li><b>Three fixes</b> for this month, in priority order, with what each should move</li></ul>
<p class="small muted" style="margin-top:16px">We'll ask for read-only access to analytics and ad accounts where relevant. Everything you share stays confidential.</p></div></div></section>`,
}));
add("/thank-you/", layout({ path: "/thank-you/", title: "Thank you", desc: "We've received your request.", noindex: true,
  body: `<section class="page-head"><div class="wrap"><h1 class="dot">Got it — thank you</h1><p class="lead">Someone from the team will reach out within one working day to confirm the details and book your call. Want to skip the wait?</p><div style="display:flex;gap:12px;flex-wrap:wrap"><a class="btn wa" href="${wa("Hi dotindot, I just requested a free audit on your website.")}" target="_blank" rel="noopener">${ICONS.wa} WhatsApp us now</a><a class="btn ghost" href="/insights/">Read our insights</a></div></div></section>` }));

add("/contact/", layout({
  path: "/contact/", title: "Contact", desc: `Talk to Dotindot Creative: ${C.phoneDisplay}, ${C.email}, WhatsApp, or visit us in Erode, Coimbatore or Chennai.`,
  crumbs: [["Home", "/"], ["Contact", "/contact/"]], ld: [breadcrumbs([["Home", "/"], ["Contact", "/contact/"]]), { "@context": "https://schema.org", "@type": "ContactPage", mainEntity: { "@id": abs("/#org") } }],
  body: `<section class="page-head"><div class="wrap"><h1 class="dot">Contact</h1><p class="lead">Call, WhatsApp, email or drop in. We answer within one working day, usually much sooner.</p></div></section>
<section class="sec tight"><div class="wrap two"><div>${leadForm("contact", { button: "Send message" })}</div>
<div><h2 class="dot" style="font-size:1.6rem">Reach us directly</h2><p><a href="tel:${tel}">${esc(C.phoneDisplay)}</a><br><a href="mailto:${C.email}">${C.email}</a><br><a href="${wa()}" target="_blank" rel="noopener">WhatsApp</a><br><span class="muted">${esc(C.hours)}</span></p>${locsBlock()}</div></div></section>`,
}));

add("/privacy/", layout({ path: "/privacy/", title: "Privacy policy", desc: "How Dotindot Creative collects and uses information on dotindot.in.", crumbs: [["Home", "/"], ["Privacy", "/privacy/"]],
  body: `<section class="page-head"><div class="wrap"><h1 class="dot">Privacy policy</h1><p class="meta">Last updated ${today}</p></div></section><section class="sec tight"><div class="wrap prose">
<p>${esc(C.name)} ("we") operates dotindot.in. This page explains what we collect and why, in line with India's Digital Personal Data Protection Act 2023 and, for visitors in the EU/UK, the GDPR.</p>
<h2>What we collect</h2><p>What you type into our forms (name, phone, email, company, message), the page you were on and, where present, campaign tags in the link you arrived from. If analytics is enabled, anonymised usage data. We don't sell personal data.</p>
<h2>Why</h2><p>To respond to your enquiry, prepare the audit you asked for, and understand which of our pages are useful. Form submissions are stored in our own CRM at internal.dotindot.in, hosted in India.</p>
<h2>Your choices</h2><p>Write to <a href="mailto:${C.email}">${C.email}</a> to see, correct or delete what we hold about you. We'll do it within 30 days.</p>
<h2>Cookies</h2><p>The site works without cookies. We remember how you arrived (in your browser's local storage) so a lead carries its source. Third-party scripts are limited to fonts and, if enabled, analytics.</p></div></section>` }));
add("/terms/", layout({ path: "/terms/", title: "Terms of use", desc: "Terms of use for dotindot.in.", crumbs: [["Home", "/"], ["Terms", "/terms/"]],
  body: `<section class="page-head"><div class="wrap"><h1 class="dot">Terms of use</h1><p class="meta">Last updated ${today}</p></div></section><section class="sec tight"><div class="wrap prose">
<p>Content on dotindot.in is provided for general information. Engagements with ${esc(C.name)} are governed by the quotation and terms you accept for that engagement, not by this page.</p>
<p>Prices, timelines and results mentioned on this site are indicative and depend on your business. We don't guarantee rankings, reach or revenue.</p>
<p>All content, logos and code on this site belong to ${esc(C.name)} unless stated. These terms are governed by the laws of India; courts at Erode, Tamil Nadu have jurisdiction.</p></div></section>` }));
add("/404.html", layout({ path: "/404.html", title: "Page not found", desc: "That page doesn't exist.", noindex: true,
  body: `<section class="page-head"><div class="wrap"><h1 class="dot">That page isn't here</h1><p class="lead">The link may be old. Try the services, or tell us what you were after.</p><div style="display:flex;gap:12px;flex-wrap:wrap"><a class="btn" href="/">Go home</a><a class="btn ghost" href="/services/">See services</a><a class="btn ghost" href="/contact/">Contact</a></div></div></section>` }));

// ---------- write
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "assets"), { recursive: true });
cpSync(join(ROOT, "assets"), join(OUT, "assets"), { recursive: true });
writeFileSync(join(OUT, "assets/site.js"), JS);
// PREVIEW=1 builds with relative links + explicit index.html so the folder can be opened from any static host path.
const PREVIEW = !!process.env.PREVIEW;
for (const [p, html] of pages) {
  const file = p.endsWith(".html") ? join(OUT, p) : join(OUT, p, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  let out = html;
  if (PREVIEW) {
    const depth = p.endsWith(".html") ? p.split("/").length - 2 : p.split("/").length - 2;
    const pre = depth > 0 ? "../".repeat(depth) : "./";
    out = out.replace(/(href|src)="\/((?!\/)[^"#?]*)([#?][^"]*)?"/g, (m, attr, path, tail) => {
      if (path.startsWith("assets/") || path.endsWith(".html") || path.endsWith(".xml") || path.endsWith(".txt") || path.endsWith(".webmanifest")) return `${attr}="${pre}${path}${tail || ""}"`;
      return `${attr}="${pre}${path}${path && !path.endsWith("/") ? "/" : ""}index.html${tail || ""}"`;
    });
  }
  writeFileSync(file, out);
}
const urls = pages.map(([p]) => p).filter((p) => !p.endsWith(".html") && p !== "/thank-you/");
writeFileSync(join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((p) => `<url><loc>${abs(p)}</loc><lastmod>${today}</lastmod><changefreq>${p === "/" ? "weekly" : "monthly"}</changefreq><priority>${p === "/" ? "1.0" : p.split("/").length <= 3 ? "0.8" : "0.6"}</priority></url>`).join("\n")}\n</urlset>\n`);
writeFileSync(join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /thank-you/\n\n# AI crawlers are welcome — see /llms.txt\nUser-agent: GPTBot\nAllow: /\nUser-agent: ClaudeBot\nAllow: /\nUser-agent: PerplexityBot\nAllow: /\nUser-agent: Google-Extended\nAllow: /\n\nSitemap: ${abs("/sitemap.xml")}\n`);
const llms = `# ${C.name}\n\n> ${C.tagline} based in Erode, Tamil Nadu, India, with offices in Coimbatore and Chennai. Services: ${services.map((s) => s.name.toLowerCase()).join(", ")}. Serves businesses across Tamil Nadu and clients in the UK, UAE and Singapore. Contact: ${C.email}, ${C.phoneDisplay}.\n\nFounded ${C.founded}. Fixed quotations (no percentage of ad spend), month-to-month retainers, a live client dashboard, and a free 20-point growth audit for new clients.\n\n## Services\n${services.map((s) => `- [${s.name}](${abs(`/services/${s.slug}/`)}): ${s.short}`).join("\n")}\n\n## Offices\n${C.locations.map((l) => `- [${l.city}](${abs(`/locations/${l.slug}/`)}): ${l.line1}, ${l.line2}, ${l.city} ${l.pincode}${l.hq ? " (headquarters)" : ""}`).join("\n")}\n\n## How we work\n- [The first 90 days](${abs("/work/")}): audit → plan → build → grow\n- [Free growth audit](${abs("/free-audit/")})\n- [About](${abs("/about/")})\n\n## Insights\n${insights.map((a) => `- [${a.title}](${abs(`/insights/${a.slug}/`)}): ${a.summary}`).join("\n")}\n\n## Optional\n- [Full text of the site](${abs("/llms-full.txt")})\n- [Contact](${abs("/contact/")})\n`;
writeFileSync(join(OUT, "llms.txt"), llms);
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<header[\s\S]*?<\/header>|<footer[\s\S]*?<\/footer>/g, "").replace(/<h([1-3])[^>]*>/g, (m, n) => `\n${"#".repeat(+n)} `).replace(/<li[^>]*>/g, "\n- ").replace(/<\/p>|<\/h[1-3]>|<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim();
writeFileSync(join(OUT, "llms-full.txt"), `# ${C.name} — full site text\n\n` + pages.filter(([p]) => !p.endsWith(".html") && p !== "/thank-you/").map(([p, h]) => `\n\n---\nURL: ${abs(p)}\n\n${strip(h)}`).join(""));
writeFileSync(join(OUT, "manifest.webmanifest"), JSON.stringify({ name: C.name, short_name: C.shortName, start_url: "/", display: "browser", background_color: "#ffffff", theme_color: "#ff831f", icons: [{ src: "/assets/icon-512.png", sizes: "512x512", type: "image/png" }, { src: "/assets/app-icon.svg", sizes: "any", type: "image/svg+xml" }] }));
writeFileSync(join(OUT, ".htaccess"), `# dotindot.in — Apache (Hostinger)
Options -Indexes
ErrorDocument 404 /404.html
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
RewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]
RewriteRule ^ https://%1%{REQUEST_URI} [L,R=301]
# trailing slash for folders, no .html in URLs
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^(.*[^/])$ /$1/ [L,R=301]
<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
  Header set Permissions-Policy "camera=(), microphone=(), geolocation=()"
  Header set Strict-Transport-Security "max-age=31536000; includeSubDomains"
  <FilesMatch "\\.(svg|png|jpg|jpeg|webp|avif|ico|woff2|js|css)$">Header set Cache-Control "public, max-age=31536000, immutable"</FilesMatch>
  <FilesMatch "\\.(html|xml|txt|webmanifest)$">Header set Cache-Control "public, max-age=600, must-revalidate"</FilesMatch>
</IfModule>
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css application/javascript application/json image/svg+xml application/manifest+json
</IfModule>
<IfModule mod_mime.c>
  AddType image/svg+xml .svg
  AddType application/manifest+json .webmanifest
  AddCharset UTF-8 .html .txt .xml .js .css
</IfModule>
`);
console.log(`built ${pages.length} pages → ${OUT}`);
