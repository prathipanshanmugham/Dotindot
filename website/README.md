# dotindot.in — public website

Static, framework-free, built for speed and search. Lighthouse (mobile): Performance 100 · Accessibility 100 · SEO 100.

## Edit → build → upload
1. Edit `site.config.json` (phone, email, WhatsApp, addresses, social links, GA4 id, real proof numbers, testimonials, case studies)
   and `src/content.mjs` (service copy, FAQs, insights, careers).
2. `node build.mjs` → everything lands in `dist/` (25 pages, sitemap.xml, robots.txt, llms.txt, llms-full.txt, manifest, .htaccess).
3. Upload the **contents** of `dist/` to `public_html/` on Hostinger (File Manager or FTP), replacing the old site. Done.

## Lead capture → CRM
Every form posts JSON to `leadIntakeUrl` in `site.config.json`. Get the key from the ops platform:
Lead Flow → **Our capture link** (needs the Sales pipeline permission) → copy the URL into `leadIntakeUrl`, rebuild, upload.
Leads land in Sales → Pipeline with source (website / ads / linkedin / referral from UTM and referrer), the page, landing page and UTM tags in the notes.
If the intake isn't configured or fails, the form offers WhatsApp and the phone number instead — nothing is lost.
The ops platform's `CORS_ORIGINS` (backend `.env`) must include `https://dotindot.in` (or be `*`).

## SEO & AI search
Per-page title/description/canonical/Open Graph, JSON-LD (Organization, LocalBusiness per office, Service, FAQPage, Article, JobPosting, BreadcrumbList),
clean URLs, sitemap, robots with AI crawlers allowed, `llms.txt` + `llms-full.txt`, fast first paint (one inline stylesheet, one 7 KB script, no frameworks).

## Files
- `src/styles.css` — the stylesheet (inlined at build)
- `src/site.js` — menu, forms, hero dots (only script on the site)
- `src/content.mjs` — copy
- `assets/` — brand SVGs, icons, `og.png` (social share image)
