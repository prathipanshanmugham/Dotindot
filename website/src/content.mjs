import { readFileSync } from "node:fs";
// All copy for dotindot.in. Plain, confident, specific.
// Nothing here claims a client, a number or an office we can't back up. Clients, testimonials, team, offices, certifications and numbers
// are entered in the app (Website editor), starting from site.config.json.

export const services = [
  {
    slug: "performance-ads", name: "Performance marketing", short: "Meta, Google, LinkedIn and TikTok ads judged on what a customer costs you.",
    tagline: "Paid media measured on revenue, not reach.",
    promise: "Paid campaigns with one job: bring in customers at a cost that makes sense for your margins.",
    intro: "We plan, build and run campaigns on Meta, Google, YouTube, LinkedIn and TikTok, then optimise every week against the leads and sales that actually landed in your CRM — not the clicks the platforms like to brag about.",
    highlights: ["Meta, Google, LinkedIn and TikTok campaigns", "Server-side conversion tracking", "Monthly creative testing", "Campaign landing pages"],
    deliverables: ["Account, pixel and server-side conversion tracking that survives privacy changes", "Creative testing every month, scored by cost per qualified lead or sale", "Landing pages built for the campaign, not your homepage", "Weekly optimisation and a monthly report in plain language", "A lead-quality loop: your sales team flags junk, we tune targeting"],
    fit: ["You sell something people search for or scroll past", "You can tell us what a customer is worth", "Your ads run but nobody can say what they return", "You're entering a new country and need demand fast"],
    steps: [["Week 1", "Tracking audit and fixes, offer and audience plan"], ["Week 2", "Creative and landing pages, campaigns live"], ["Weeks 3–4", "Learning phase, first cuts and doubles-down"], ["Every month", "New creative, budget shifts, a report you'll actually read"]],
    faq: [["How much should we spend on ads?", "Enough for the platforms to learn — roughly 30 or more conversions a month. We'll tell you plainly if your budget is too small to work, before you spend it."],
      ["Do you take a percentage of ad spend?", "No. One flat monthly fee agreed upfront. You pay Meta, Google and the rest directly, so you always see where every unit of currency went."],
      ["How soon will we see results?", "Campaigns usually go live within 7 working days. Weeks 1–2 are learning; by week 4 we expect a steady cost per lead to start pushing down."]],
    icon: "target",
  },
  {
    slug: "social-content", name: "Social media & content", short: "Reels, carousels and stories planned a month ahead and posted for you.",
    tagline: "An audience that grows — and buys.",
    promise: "A content system that grows an audience people actually buy from — on Instagram, LinkedIn, YouTube, TikTok and Facebook.",
    intro: "Monthly themes, scripts, shoots, edits built for retention, captions written for your customer, and the follower, reach, view and engagement numbers tracked month on month so everyone can see what's working.",
    highlights: ["Monthly content calendar", "Short-form video, carousels and stories", "Community management", "Growth reporting every month"],
    deliverables: ["A monthly content calendar you approve before anything goes out", "Short-form video, carousels and stories, edited for the first three seconds", "AI-assisted scripting and captioning, human-checked for tone", "Community management: comments and DMs answered in working hours", "A monthly growth dashboard: followers, reach, views, engagement and leads"],
    fit: ["Founders building a personal brand", "Consumer brands that live or die on attention", "B2B companies that want LinkedIn to bring in pipeline", "Teams that post when there's time, which means rarely"],
    steps: [["Week 1", "Brand voice, pillars and the first month's calendar"], ["Week 2", "Scripts, shoot or asset collection, first edits"], ["Weeks 3–4", "Publishing, community, first numbers"], ["Every month", "Keep what grew, drop what didn't, repeat"]],
    faq: [["Do you shoot, or do we send footage?", "Both work. We can run remote shoots with your team using a shot list, work with local crews in your city, or edit what you already have."],
      ["Which platforms should we be on?", "Wherever your customers already spend their evenings. For most consumer brands that's Instagram and TikTok; for B2B, LinkedIn first."],
      ["How do you report growth?", "One dashboard with followers, reach, views and engagement for every account, every month — plus the enquiries that came from social."]],
    icon: "social",
  },
  {
    slug: "seo-ai-search", name: "SEO & AI search", short: "Rank on Google and get cited when people ask ChatGPT, Gemini or Perplexity.",
    tagline: "Found on Google. Cited by AI.",
    promise: "Show up on Google's first page and inside AI assistants' answers for the questions your customers actually ask.",
    intro: "Search has split in two: the classic results page, and AI answers that quote a handful of sources. We work on both — technical SEO, content built around real questions, structured data, and clear, citable pages that assistants like to quote.",
    highlights: ["Technical SEO and Core Web Vitals", "Content from search and AI-prompt research", "AI-search readiness and schema", "International and local SEO"],
    deliverables: ["Technical audit and fixes: speed, Core Web Vitals, indexing, schema", "Content planned from real search and AI-prompt research", "AI-search readiness: llms.txt, FAQ and organisation schema, entity consistency", "International SEO: hreflang, country targeting and local listings", "A monthly ranking, traffic and AI-mention report"],
    fit: ["You're invisible for searches you should own", "Competitors keep getting quoted by AI assistants and you don't", "You're launching in a new country or language", "Your site has content but no traffic"],
    steps: [["Weeks 1–2", "Technical audit, keyword and prompt research"], ["Weeks 3–4", "Fixes shipped, content plan approved"], ["Months 2–3", "Content and authority work, first movement"], ["Every month", "Rankings, traffic and AI mentions, side by side"]],
    faq: [["How long does SEO take?", "Technical fixes show up in weeks. Competitive terms take four to six months of consistent work. You'll see progress every month, so you're never guessing."],
      ["What is AI search optimisation?", "Making sure that when someone asks an assistant “who's the best at X”, your pages are clear, consistent and trustworthy enough to be quoted. It builds on good SEO; it doesn't replace it."],
      ["Do you guarantee rankings?", "Nobody honest can. We guarantee the work, the reporting, and that you own every page we build."]],
    icon: "search",
  },
  {
    slug: "websites-apps", name: "Websites & apps", short: "Fast, search-ready websites and custom web apps wired into your CRM.",
    tagline: "Fast, findable and built to convert.",
    promise: "Websites built around the one thing you want visitors to do — and fast enough that they stay long enough to do it.",
    intro: "From a sharp marketing site to e-commerce, booking flows, client portals and internal tools. We design for your customer, write the words with you, build it clean, and connect every form to your CRM so no enquiry falls through the cracks.",
    highlights: ["Marketing sites and e-commerce", "Client portals and custom web apps", "Speed, accessibility and SEO built in", "Every form wired into your CRM"],
    deliverables: ["Sitemap and messaging built around your customer's questions", "Design you review before a line of code is written", "The right stack for the job: static for speed, Shopify or WordPress for easy editing, custom React and Python for apps", "Speed, accessibility and SEO built in, not bolted on", "Lead capture into your CRM, analytics, hosting and a 30-day warranty"],
    fit: ["Your current site is slow, dated or undersells you", "You need landing pages that convert ad traffic", "You sell online and checkout leaks money", "You need a portal, dashboard or tool nobody sells off the shelf"],
    steps: [["Week 1", "Discovery, sitemap and messaging"], ["Weeks 2–3", "Design rounds with you"], ["Weeks 3–5", "Build, content, integrations"], ["Launch", "Speed and SEO checks, tracking, handover"]],
    faq: [["How long does a website take?", "A marketing site: three to five weeks. E-commerce: six to eight. Custom apps are scoped individually with a fixed quotation."],
      ["Can our team edit it ourselves?", "Yes, if you want to. We'll pick a stack your team can update without calling us every time."],
      ["Who owns the site?", "You do. Domain, hosting and code sit in your name from day one."]],
    icon: "web",
  },
  {
    slug: "brand-video", name: "Brand & video", short: "Identity, packaging and video that make you look like the category leader.",
    tagline: "A brand that looks like the category leader.",
    promise: "A brand people recognise at a glance — name, logo, voice, packaging — and video that tells your story in thirty seconds.",
    intro: "Naming and identity for new ventures, refreshes for established ones, and video: brand films, product videos, explainers, reels and AI-assisted ad variations, scripted and edited by our team.",
    highlights: ["Naming, logo and identity systems", "Packaging and brand guidelines", "Brand films and product videos", "AI-assisted video ads at scale"],
    deliverables: ["Logo and identity system with a brand book", "Packaging, decks, social templates and stationery", "Brand films, product and explainer videos", "AI-assisted video ads in multiple formats and languages", "Launch kits for campaigns and new markets"],
    fit: ["You're launching something new", "Your brand looks smaller than your business", "You're entering a new market and need to look local", "You need video at a pace your budget can survive"],
    steps: [["Week 1", "Discovery and positioning"], ["Weeks 2–3", "Concepts and direction"], ["Weeks 3–5", "Refinement and the full system"], ["Handover", "Brand book, files and templates"]],
    faq: [["What does a brand identity cost?", "It's quoted per scope — from a starter identity to a full system. We'll scope it on the first call and send a fixed quotation."],
      ["Do you work in languages other than English?", "Yes. We produce multilingual video and adapt identities for new markets, with native speakers checking every line."]],
    icon: "brand",
  },
  {
    slug: "ai-automation", name: "AI agents & automation", short: "Agents that answer, qualify and follow up — on WhatsApp, chat and email, all night.",
    tagline: "Every enquiry answered, day and night.",
    promise: "Put AI where it saves real hours: answering enquiries, qualifying leads, following up, and writing the report.",
    intro: "We build practical automations on the tools you already use — WhatsApp Business, your CRM, Google Workspace, your website — and AI agents trained on your business that answer and qualify enquiries around the clock, then hand over to a human the moment it matters.",
    highlights: ["WhatsApp, chat and email agents", "Lead routing and follow-up", "Automated reporting and dashboards", "Custom internal tools"],
    deliverables: ["WhatsApp, web chat and email agents trained only on what you approve", "Instant lead routing, scoring and follow-up sequences", "Review requests and reputation workflows", "Automated reporting and live dashboards", "Custom internal tools and AI integrations"],
    fit: ["You get more enquiries than people to answer them", "Leads arrive on WhatsApp, forms, calls and DMs, and some vanish", "Your team copies data between tools by hand", "Your Monday starts with building last week's report"],
    steps: [["Week 1", "Map the workflow and the hand-offs"], ["Week 2", "Build and train on your approved answers"], ["Week 3", "Test with real conversations, human in the loop"], ["Every month", "Review transcripts, improve answers, add the next workflow"]],
    faq: [["Will the AI say something wrong to my customers?", "It answers only from information you've approved and hands anything else to a person. You can read every conversation."],
      ["Which tools do you connect?", "WhatsApp Business API, Meta and Google lead forms, Google Workspace, Shopify, Stripe, Razorpay, popular CRMs and custom systems."]],
    icon: "ai",
  },
];

export const steps = [
  { n: "01", title: "Audit", when: "Days 1–5", text: "We review your website, search and AI-search visibility, social accounts and ad accounts. You get a written report and a 30-minute walkthrough, whether or not you go on to work with us." },
  { n: "02", title: "Plan", when: "Days 5–10", text: "A 90-day plan: channels, budget, creative and the exact numbers we'll be measured on, with one fixed quotation in your currency." },
  { n: "03", title: "Build", when: "Days 10–30", text: "Tracking, landing pages, creative, content, campaigns and automations. You approve everything before it goes live." },
  { n: "04", title: "Grow", when: "Day 30 onwards", text: "Weekly optimisation, a monthly review with your team and a live dashboard you can open any time. We keep what works and cut what doesn't." },
];

// how AI and people split the work (about page)
export const aiHuman = [
  ["Drafts and variations", "Research, first drafts, ad variations, resizes and subtitles in minutes.", "Specialists choose what is on-brand and worth the money."],
  ["Monitoring", "Watches spend, rankings and site health around the clock.", "Strategists decide what to change, and why."],
  ["Reporting", "Pulls every channel into one live dashboard.", "Account leads explain what the numbers mean for your business."],
  ["First response", "Answers and qualifies new enquiries instantly, from approved information only.", "Your team takes over the moment a conversation matters."],
];

export const values = [
  ["Evidence over adjectives", "We report cost per lead, revenue and rankings, not “great engagement”. If we can't measure it, we say so."],
  ["Speed is a feature", "Fast websites, fast replies, fast decisions. Slow is just expensive."],
  ["Plain language", "Clear plans, clear reports and no jargon in client conversations."],
  ["You own everything", "Ad accounts, code, content and data sit in your name from day one."],
  ["Long-term partnerships", "Month-to-month terms and fixed quotations. We earn the next month by delivering this one."],
];

// why brands choose us (home + about)
export const whyUs = [
  ["AI-first, specialist-led", "AI handles research, drafting, monitoring and reporting so work moves faster and costs less. Senior specialists own the strategy and approve everything your customers see."],
  ["One team for every channel", "Paid media, search, content, websites and automation under one roof, working from one plan and one dashboard. No hand-offs between agencies, no finger-pointing."],
  ["Built for global brands", "We work in your hours across the UK, Europe, the Middle East, Asia-Pacific and the Americas, and quote and invoice in your currency."],
  ["Transparent by default", "A live client portal with reports, approvals and invoices. Fixed quotations, month-to-month terms and never a percentage of your ad spend."],
];

// the disciplines on the team
export const expertise = ["Performance marketing", "Search and AI-search optimisation", "Social media and content production", "Brand and visual design", "Video production", "Full-stack web and app engineering", "AI agents and marketing automation", "Analytics and reporting"];

// industries we work in (from real client work)
export const industries = ["Energy and solar", "Manufacturing and industrial", "Retail and e-commerce", "Consumer brands", "Professional services", "Technology"];

export const faqs = [
  ["What does Dotindot do?", "We're an AI-first growth agency. We run ads, make content, do SEO and AI-search optimisation, build websites and apps, create brands and video, and automate the repetitive parts of marketing with AI agents — for brands anywhere in the world."],
  ["Where are you based?", "Our team is headquartered in India and works with clients around the world over video calls, WhatsApp and a shared client portal. We travel when a project needs it."],
  ["Which time zones do you cover?", "Our day overlaps comfortably with Europe, the Gulf and Asia-Pacific. For the Americas we hold calls early or late, and the work keeps moving while you sleep."],
  ["Which currencies do you invoice in?", "USD, GBP, EUR, CAD, AED, SGD, THB, JPY, AUD or INR — whatever's simplest for your accounts team. Quotations come in the same currency."],
  ["How much does it cost?", "Every engagement gets a fixed quotation after the free audit. Retainers are monthly; one-off projects like websites and brand identities are priced per scope. We never take a percentage of your ad spend."],
  ["How do we know it's working?", "Every client gets a live dashboard — leads by source, cost per lead, follower growth, views, rankings — and a monthly review where we go through it together."],
  ["Do we have to sign a long contract?", "No. Retainers are month to month with 30 days' notice. Projects have a fixed scope and timeline."],
  ["What does “AI-first” mean in practice?", "AI does the drafting, monitoring and number-crunching so it happens faster and at lower cost. Specialists make every decision a customer sees."],
];

// Articles live in insights.json (body in simple Markdown: ## headings, - lists, 1. lists, **bold**, [links](url)).
// Once the app's Website editor is used, articles are managed there and this file is only the starting point.
const _ins = JSON.parse(readFileSync(new URL("./insights.json", import.meta.url), "utf8"));
const _words = (t) => String(t).split(/\s+/).filter(Boolean).length;
export const insights = _ins.map((a) => ({ minutes: Math.max(1, Math.round(_words(a.body) / 220)), ...a }));

export const careers = [
  { title: "Performance marketer", place: "Remote, full-time", text: "You've run Meta and Google campaigns to a cost per customer and can explain, calmly, why it moved." },
  { title: "Content creator (short-form video)", place: "Remote, full-time", text: "You script, shoot and edit short-form video, and you know what holds attention in the first second." },
  { title: "Full-stack developer (React / Python)", place: "Remote, full-time", text: "You've shipped production apps, you care about speed, and you write code other people enjoy reading." },
  { title: "AI automation engineer", place: "Remote, full-time", text: "You've built agents and workflows that real customers use, and you know when not to use AI." },
];

export const tools = ["Meta Ads", "Google Ads", "GA4", "LinkedIn Ads", "TikTok Ads", "YouTube", "Search Console", "Shopify", "WordPress", "React", "Python", "n8n", "WhatsApp Business", "ChatGPT", "Claude", "Midjourney", "Kling", "ElevenLabs", "Canva", "Figma", "Looker Studio"];

// ---------- SEO titles per service (title tag only; the page H1 stays short) ----------
export const seoTitles = {
  "performance-ads": "Performance marketing agency — Meta, Google, LinkedIn & TikTok ads",
  "social-content": "Social media marketing agency — content, reels & community",
  "seo-ai-search": "SEO & AI search (GEO) agency — rank on Google, get cited by ChatGPT",
  "websites-apps": "Website design & development agency — fast sites and web apps",
  "brand-video": "Branding & video production agency — identity, packaging, video ads",
  "ai-automation": "AI agents & marketing automation agency — WhatsApp, chat and CRM",
};

// ---------- markets (international SEO; facts only, no invented clients) ----------
export const markets = [
  { slug: "united-kingdom", name: "the UK", country: "United Kingdom", code: "GB", city: "London", tz: "Europe/London", cur: "GBP",
    overlap: "India is 4½–5½ hours ahead of the UK. Your morning is our afternoon, so we overlap every working day — and work you approve at 5 pm is often waiting when you open your laptop.",
    platforms: "Google and Meta for demand, LinkedIn for B2B pipeline, TikTok and YouTube Shorts for reach with under-35s.",
    rules: "UK GDPR and PECR: consent-first tracking, cookie banners that actually comply, and audiences built on first-party data.",
    search: "Google dominates UK search, and AI Overviews now sit above the results for many commercial questions — so being the cited source matters as much as ranking.",
    faq: [["Do you invoice in pounds?", "Yes. Quotations and invoices in GBP, paid by bank transfer or card — no currency maths for your finance team."],
      ["How do calls work across time zones?", "We schedule in UK working hours. Most clients get a weekly call in their morning and daily updates on WhatsApp or Slack."],
      ["Will our ads and content sound British?", "Yes. We write in British English for UK brands and localise offers, spelling, prices and references for the market."]] },
  { slug: "germany", name: "Germany", country: "Germany", code: "DE", city: "Berlin", tz: "Europe/Berlin", cur: "EUR",
    overlap: "India is 3½–4½ hours ahead of Germany. We start before you do, so drafts and reports are ready when your day begins, and we share your whole morning and lunch.",
    platforms: "Google and Meta for demand, LinkedIn for B2B pipeline, YouTube and TikTok for reach, and Amazon when your buyers shop there.",
    rules: "GDPR, consent-first cookies under the TDDDG, an Impressum on every website and tracking built on first-party data.",
    search: "Google leads German search, buyers compare carefully and trust detail. Clear, factual pages with proper structure are what both Google and AI assistants quote.",
    faq: [["Do you invoice in euros?", "Yes. Quotations and invoices in EUR, paid by bank transfer or card."],
      ["Can you run campaigns in German?", "Yes. We localise campaigns into German, and every line is checked by a native speaker before it goes live."],
      ["Is your tracking GDPR-compliant?", "Yes. Consent mode, server-side tracking and cookie banners set up to German standards, so measurement doesn't cost you compliance."]] },
  { slug: "netherlands", name: "the Netherlands", country: "Netherlands", code: "NL", city: "Amsterdam", tz: "Europe/Amsterdam", cur: "EUR",
    overlap: "India is 3½–4½ hours ahead of Amsterdam: we overlap from your first coffee to mid-afternoon, every working day.",
    platforms: "Google, Meta, LinkedIn (one of Europe's most active B2B audiences), TikTok and YouTube, plus bol.com for retail brands.",
    rules: "GDPR and Dutch cookie rules: consent before tracking, honest banners and audiences built on first-party data.",
    search: "Dutch buyers search in Dutch and English and use AI assistants early in their research. We build pages that rank and get cited in both languages.",
    faq: [["Do you invoice in euros?", "Yes. Quotations and invoices in EUR."],
      ["Dutch or English campaigns?", "Both. We test Dutch and English creative side by side, and Dutch copy is checked by a native speaker before it goes live."],
      ["Can you support an Amsterdam team in person?", "Most of the work runs on video calls, a shared dashboard and Slack or WhatsApp. For launches and workshops we can plan a visit."]] },
  { slug: "united-states", name: "the US", country: "United States", code: "US", city: "New York", tz: "America/New_York", cur: "USD",
    overlap: "We're 9½–10½ hours ahead of the East Coast and 12½–13½ ahead of the West. We take calls in your morning or evening, and the work runs while you sleep — you wake up to progress.",
    platforms: "Google, Meta, YouTube, LinkedIn and TikTok, plus Reddit and Amazon when your buyers live there.",
    rules: "CAN-SPAM for email, TCPA for SMS, and state privacy laws such as California's CCPA/CPRA: opt-ins and suppression lists done properly.",
    search: "US buyers increasingly start with ChatGPT, Perplexity and Google's AI Mode. We optimise to be named in those answers, not just listed on page one.",
    faq: [["Do you invoice in dollars?", "Yes. USD quotations and invoices, paid by bank transfer or card."],
      ["Can you work US hours?", "We overlap with your early morning and late evening every day, and we'll schedule calls inside your working hours. Urgent changes get picked up the same day."],
      ["Why work with a studio in India?", "Senior people, AI-first workflows and sensible costs — with the same tools, standards and reporting you'd expect from an agency down the street."]] },
  { slug: "canada", name: "Canada", country: "Canada", code: "CA", city: "Toronto", tz: "America/Toronto", cur: "CAD",
    overlap: "We're 9½–10½ hours ahead of Toronto and 12½–13½ ahead of Vancouver. Calls happen in your morning or late afternoon, and the work runs overnight — you start the day with progress.",
    platforms: "Google, Meta, YouTube, LinkedIn and TikTok, with French-language campaigns for Quebec.",
    rules: "CASL for email and SMS consent, PIPEDA for personal data and Quebec's Law 25, with French where the Charter of the French Language requires it.",
    search: "English and French search, and fast-growing use of AI assistants for comparisons. Bilingual, well-structured pages win both.",
    faq: [["Do you invoice in Canadian dollars?", "Yes. CAD quotations and invoices, paid by bank transfer or card."],
      ["Can you run campaigns in French for Quebec?", "Yes. French creative and landing pages, checked by a native speaker, with Quebec's language and privacy rules built in."],
      ["Is your email marketing CASL-compliant?", "Yes. Express consent, clear sender identity and a working unsubscribe on every message."]] },
  { slug: "uae", name: "the UAE", country: "United Arab Emirates", code: "AE", city: "Dubai", tz: "Asia/Dubai", cur: "AED",
    overlap: "We're just 1½ hours ahead of Dubai — practically the same working day, Monday to Friday.",
    platforms: "Instagram, Snapchat, TikTok, Google and YouTube — and WhatsApp, because that's where your customers actually reply.",
    rules: "Opt-in WhatsApp and SMS marketing and PDPL-aware data handling, with Arabic and English creative where it matters.",
    search: "Bilingual search behaviour (Arabic and English) and fast-growing AI assistant use mean pages need to be clear, structured and quotable in both languages.",
    faq: [["Do you invoice in dirhams?", "Yes — quotations and invoices in AED."],
      ["Can you run Arabic campaigns?", "Yes. We plan bilingual campaigns and have Arabic copy written and checked by native speakers before anything goes live."],
      ["Do you set up WhatsApp automation?", "Yes. WhatsApp Business API agents that answer, qualify and book in English and Arabic, then hand over to your team."]] },
  { slug: "singapore", name: "Singapore", country: "Singapore", code: "SG", city: "Singapore", tz: "Asia/Singapore", cur: "SGD",
    overlap: "Singapore is 2½ hours ahead of us, so we share most of your working day.",
    platforms: "Google, Meta, LinkedIn for regional B2B, TikTok and YouTube — often planned across Southeast Asia, not just one island.",
    rules: "PDPA-compliant data collection and respect for the Do Not Call registry on every campaign.",
    search: "A small, competitive market where the same buyers research on Google, LinkedIn and AI assistants — authority and clarity win.",
    faq: [["Do you invoice in SGD?", "Yes, in Singapore dollars."],
      ["Can you run regional campaigns across Southeast Asia?", "Yes. We plan and report by country, so you can see what Malaysia, Indonesia or the Philippines return separately."],
      ["Do you work with B2B tech companies?", "Yes — LinkedIn, content, SEO and AI-search work is a natural fit for B2B and SaaS brands."]] },
  { slug: "thailand", name: "Thailand", country: "Thailand", code: "TH", city: "Bangkok", tz: "Asia/Bangkok", cur: "THB",
    overlap: "Bangkok is just 1½ hours ahead of us, so we share almost your entire working day.",
    platforms: "LINE Official Accounts and LINE Ads, Facebook, Instagram, TikTok and YouTube, plus Shopee and Lazada for e-commerce brands.",
    rules: "Thailand's Personal Data Protection Act (PDPA): consent before marketing messages and careful handling of customer data.",
    search: "Google dominates Thai search, much of it in Thai and on mobile. Pages need to be fast, local and clear in Thai as well as English.",
    faq: [["Do you invoice in baht?", "Yes. Quotations and invoices in THB."],
      ["Can you create content in Thai?", "Yes. We localise campaigns into Thai, and every line is checked by a native speaker before it goes live."],
      ["Do you work with LINE?", "Yes. LINE Official Account setup, broadcasts, chat automation and LINE Ads, connected to your CRM."]] },
  { slug: "japan", name: "Japan", country: "Japan", code: "JP", city: "Tokyo", tz: "Asia/Tokyo", cur: "JPY",
    overlap: "Tokyo is 3½ hours ahead of us: we overlap from your late morning to the end of your day.",
    platforms: "Google and Yahoo! JAPAN search ads, LINE, X, Instagram, YouTube and TikTok — X matters more in Japan than almost anywhere else.",
    rules: "The APPI for personal data, and Japan's rules on stealth marketing: every sponsored post and influencer collaboration clearly labelled.",
    search: "Google and Yahoo! JAPAN lead search. Japanese buyers research thoroughly, so detailed, trustworthy pages in natural Japanese are what rank and get cited.",
    faq: [["Do you invoice in yen?", "Yes. Quotations and invoices in JPY."],
      ["Can you create content in Japanese?", "Yes. Japanese copy is localised for the market, not machine-translated, and checked by a native speaker before it goes live."],
      ["Do you run influencer campaigns in Japan?", "Yes, with every collaboration disclosed as advertising, as Japanese law requires."]] },
  { slug: "australia", name: "Australia", country: "Australia", code: "AU", city: "Sydney", tz: "Australia/Sydney", cur: "AUD",
    overlap: "Sydney is 4½–5½ hours ahead of India: we overlap from your lunch to your close, and our evening covers your next morning's prep.",
    platforms: "Google, Meta, TikTok, LinkedIn and YouTube, with strong local SEO for service businesses.",
    rules: "Privacy Act 1988 and the Spam Act 2003: proper consent, clear sender identity and an unsubscribe that works.",
    search: "Australians lean heavily on Google Maps and reviews for local services, and on AI assistants for comparisons — we work on both.",
    faq: [["Do you invoice in AUD?", "Yes, in Australian dollars."],
      ["Can you handle local SEO for multiple locations?", "Yes — Google Business Profiles, location pages, reviews and citations for each location."],
      ["How do we meet?", "Video calls in your working hours, a shared dashboard, and WhatsApp or Slack for day-to-day."]] },
  { slug: "india", name: "India", country: "India", code: "IN", city: "Chennai", tz: "Asia/Kolkata", cur: "INR",
    overlap: "Same time zone, same working day — and the same WhatsApp group, if you like.",
    platforms: "Instagram, YouTube, Google, Meta and WhatsApp, with creative in English, Tamil, Hindi and other regional languages.",
    rules: "Consent and data handling designed for India's Digital Personal Data Protection Act, 2023.",
    search: "Mobile-first, vernacular and voice-heavy search, plus fast-growing AI assistant use — your pages need to be quick, clear and local.",
    faq: [["Do you invoice in rupees with GST?", "Yes. GST invoices in INR, with UPI or bank transfer."],
      ["Can we meet in person?", "Yes, for projects that need it. Most of the work runs on video calls, WhatsApp and a shared dashboard."],
      ["Do you run regional-language campaigns?", "Yes — Tamil, Hindi and other languages for ads, reels and landing pages."]] },
];

// ---------- marketing health check ----------
export const quiz = [
  { q: "How fast does your website load on a phone?", a: [["Under 2 seconds", 3], ["2–5 seconds", 1], ["Over 5 seconds", 0]], fix: "Speed up your website — every second costs enquiries." },
  { q: "Ask ChatGPT for the best in your field. Are you named?", a: [["Yes", 3], ["Not sure", 1], ["No", 0]], fix: "Get cited by AI assistants (AI search optimisation)." },
  { q: "How often do you post on social media?", a: [["Weekly or more", 3], ["Occasionally", 1], ["Rarely or never", 0]], fix: "Build a content calendar that runs itself." },
  { q: "Do you know what one lead costs you?", a: [["Precisely", 3], ["Roughly", 1], ["We don't track it", 0]], fix: "Set up tracking so every lead has a known cost." },
  { q: "How fast do you reply to a new enquiry?", a: [["Under 5 minutes", 3], ["Same day", 1], ["A day or more", 0]], fix: "Answer every enquiry in seconds with an AI agent." },
  { q: "Do people recognise your brand at a glance?", a: [["Instantly", 3], ["Somewhat", 1], ["Not yet", 0]], fix: "Sharpen your brand so you look like the category leader." },
];
