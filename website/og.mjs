// Dev-only: renders a 1200×630 share image per page into assets/og/ (and assets/og.png for the home page).
// Needs Playwright. Usage: node og.mjs && node build.mjs
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { services, insights, markets } from "./src/content.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const font = readFileSync(join(ROOT, "assets/fonts/schibsted.woff2")).toString("base64");
const wm = readFileSync(join(ROOT, "assets/wordmark-color.svg"), "utf8");
const map = JSON.parse(readFileSync(join(ROOT, "assets/vendor/worldmap.json"), "utf8"));

// the dotted world, with India at the centre of arcs to each market
const K = 6.0, OX = 610, OY = 56;
const dots = [];
for (let i = 0; i < map.p.length; i += 2) dots.push(`<circle cx="${(OX + map.p[i] * K).toFixed(1)}" cy="${(OY + map.p[i + 1] * K).toFixed(1)}" r="2.1"/>`);
const P = (n) => [OX + map.pins[n][0] * K, OY + map.pins[n][1] * K];
const hub = P("Chennai");
const arcs = ["London", "New York", "Dubai", "Singapore", "Sydney"].map((n) => {
  const b = P(n), mx = (hub[0] + b[0]) / 2, d = Math.hypot(b[0] - hub[0], b[1] - hub[1]);
  return `<path d="M${hub[0]} ${hub[1]} Q${mx} ${(hub[1] + b[1]) / 2 - d * .32} ${b[0]} ${b[1]}" fill="none" stroke="#ff7a1a" stroke-width="2.2" stroke-opacity=".8"/><circle cx="${b[0]}" cy="${b[1]}" r="6" fill="#ff7a1a"/>`;
}).join("");
const MAP = `<svg class="map" viewBox="0 0 1200 630" aria-hidden="true"><g fill="#d5dae2">${dots.join("")}</g>${arcs}<circle cx="${hub[0]}" cy="${hub[1]}" r="7" fill="#0e1b33"/></svg>`;

const cards = [
  ["home", "Marketing that performs. Technology that scales.", "AI-first growth agency for brands worldwide"],
  ["services", "Services", "Performance marketing, SEO & AI search, websites, brand, AI automation"],
  ...services.map((s) => [`services-${s.slug}`, s.name, s.tagline]),
  ["clients", "Clients", "Who we work with"],
  ["markets", "Markets", "UK, US, UAE, Singapore, Australia and India"],
  ...markets.map((m) => [`markets-${m.slug}`, `Marketing for brands in ${m.name}`, `Your hours, invoiced in ${m.cur}`]),
  ["insights", "Insights", "Practical thinking on marketing, search and AI"],
  ...insights.map((a) => [`insights-${a.slug}`, a.title, `${a.minutes} min read`]),
  ["speed-test", "Website speed test", "Free, powered by Google PageSpeed Insights"],
  ["growth-score", "Marketing health check", "A 60-second assessment with a score out of 100"],
  ["process", "How we work", "Audit, plan, build, grow"],
  ["about", "About Dotindot", "An AI-first growth agency working worldwide"],
  ["contact", "Contact", "A specialist replies within one working day"],
  ["free-audit", "Free growth audit", "Website, search, social and ads, independently reviewed"],
  ["careers", "Careers", "Marketing, content and engineering roles"],
];
const escH = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const title = (t) => {
  const parts = t.split(/(?<=\.)\s+/); // keep full stops orange
  return parts.map((p) => escH(p.replace(/\.$/, "")) + '<span class="stop">.</span>').join(" ");
};
const page = (t, sub) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:S;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:400 900}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;background:#fff;font-family:S,sans-serif;color:#0e1b33}
.map{position:absolute;inset:0;width:1200px;height:630px}
.wm{position:absolute;left:72px;top:64px;width:200px}.wm svg{width:100%;height:auto}
.txt{position:absolute;left:72px;bottom:72px;width:${t.length > 44 ? 900 : 760}px}
h1{font-weight:800;font-size:${t.length > 60 ? 58 : t.length > 34 ? 70 : 92}px;line-height:1.02;letter-spacing:-.04em}
.stop{color:#ff7a1a}
p{margin-top:22px;font-size:28px;font-weight:500;color:#5c6679;letter-spacing:-.01em}
.bar{position:absolute;left:0;right:0;bottom:0;height:10px;background:#0e1b33}
.bar i{position:absolute;left:0;top:0;bottom:0;width:180px;background:#ff7a1a}
</style></head><body>${MAP}<span class="wm">${wm}</span><div class="txt"><h1>${title(t)}</h1><p>${escH(sub)}</p></div><div class="bar"><i></i></div></body></html>`;

mkdirSync(join(ROOT, "assets/og"), { recursive: true });
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1200, height: 630 } });
for (const [key, t, sub] of cards) {
  await pg.setContent(page(t, sub)); await pg.waitForTimeout(80);
  await pg.screenshot({ path: join(ROOT, `assets/og/${key}.jpg`), type: "jpeg", quality: 88 });
  if (key === "home") await pg.screenshot({ path: join(ROOT, "assets/og.png"), type: "png" });
}
await b.close();
console.log(`rendered ${cards.length} share images → assets/og/`);
