// Dev-only: renders a 1200×630 share image per page into assets/og/. Needs Playwright (npm i -D playwright) and a built dist/.
// Usage: node build.mjs && node og.mjs && node build.mjs   (the second build picks the images up)
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { services, insights, markets, seoTitles } from "./src/content.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const html = readFileSync(join(ROOT, "dist/index.html"), "utf8");
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/url\(\/assets\//g, `url(file://${ROOT}/assets/`);
const dot = html.match(/<svg class="dotf"[\s\S]*?<\/svg>/)[0];
const wm = readFileSync(join(ROOT, "assets/wordmark-color.svg"), "utf8");

const cards = [
  ["home", "Make your brand impossible to scroll past.", "AI-first marketing studio for brands worldwide", "happy"],
  ["services", "Everything your brand needs online.", "Ads, social, SEO & AI search, websites, brand, AI agents", "happy"],
  ...services.map((s) => [`services-${s.slug}`, s.tagline, s.name, "love"]),
  ["markets", "Wherever your customers are.", "UK, US, UAE, Singapore, Australia, India", "wow"],
  ...markets.map((m) => [`markets-${m.slug}`, `Marketing for brands in ${m.name}.`, `Your hours, invoiced in ${m.cur}`, "wow"]),
  ["insights", "Practical notes from the work.", "Insights on ads, SEO, AI search and websites", "wink"],
  ...insights.map((a) => [`insights-${a.slug}`, a.title, `${a.minutes} min read`, "wink"]),
  ["speed-test", "How fast is your website, really?", "Free speed test, powered by Google PageSpeed", "wow"],
  ["growth-score", "How loud is your dot?", "A 60-second marketing health check", "wink"],
  ["process", "From hello to growth in four steps.", "Audit, plan, build, grow", "happy"],
  ["about", "We're dotindot.", "An AI-first, remote-first marketing studio", "happy"],
  ["contact", "Say hello.", "A human replies within one working day", "love"],
  ["free-audit", "Free growth audit.", "Website, search, social and ads — honestly reviewed", "love"],
  ["careers", "Work with us.", "Remote marketing, content and engineering roles", "happy"],
];

const page = (title, sub, mood) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}
body{margin:0;width:1200px;height:630px;overflow:hidden;background:#fff}
.og{position:relative;width:1200px;height:630px;padding:70px 76px;box-sizing:border-box}
.og h1{font-size:${title.length > 48 ? 72 : title.length > 30 ? 88 : 104}px;line-height:.95;font-stretch:108%;letter-spacing:-.045em;max-width:8.6em;text-wrap:balance}
.og .sub{position:absolute;left:76px;bottom:128px;font:600 28px var(--text);color:var(--slate);max-width:700px}
.og .wm{position:absolute;left:76px;bottom:62px;width:190px}
.og .dw{position:absolute;right:72px;bottom:66px;width:230px}
.og .dw svg,.og .wm svg{width:100%;height:auto;overflow:visible}
.og i{position:absolute;border-radius:50%;background:var(--dot)}
.og .bar{position:absolute;left:0;top:0;width:100%;height:14px;background:var(--dot)}
</style></head><body><div class="og"><div class="bar"></div><h1>${title.replace(/</g, "&lt;")}</h1><p class="sub">${sub.replace(/</g, "&lt;")}</p><span class="wm">${wm}</span>
<span class="dw" data-mood="${mood}">${dot}</span><i style="right:64px;top:58px;width:22px;height:22px"></i><i style="right:150px;top:240px;width:14px;height:14px"></i><i style="right:330px;bottom:96px;width:10px;height:10px"></i></div></body></html>`;

mkdirSync(join(ROOT, "assets/og"), { recursive: true });
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
for (const [key, title, sub, mood] of cards) {
  const f = join(ROOT, "dist/_og.html"); writeFileSync(f, page(title, sub, mood));
  await p.goto("file://" + f); await p.waitForTimeout(150);
  await p.screenshot({ path: join(ROOT, `assets/og/${key}.jpg`), type: "jpeg", quality: 86 });
}
await b.close();
console.log(`rendered ${cards.length} share images → assets/og/`);
