import { readFileSync } from "node:fs";
// All copy for dotindot.in. Plain, confident, specific.
// Nothing here claims a client, a number or an office we can't back up. Clients, testimonials, team, offices, certifications and numbers
// are entered in the app (Website editor), starting from site.config.json.

// Services, written so a busy business owner gets it on first read. Plain words first; the trade terms live in
// `aka` (shown small under the title) and `technical` (a collapsed "For your technical team" list).
export const services = [
  {
    slug: "performance-ads", name: "Online ads", aka: "performance marketing", icon: "target",
    short: "Ads on Facebook, Instagram, Google and YouTube that bring you customers.",
    tagline: "Pay for customers, not just views.",
    promise: "Ads that bring you enquiries and sales, at a cost that makes sense for your business.",
    plain: "We create and run ads for your business on Facebook, Instagram, Google and YouTube. People who might buy from you see the ad, tap it and send you their details. Every week we stop what isn't working, so each new customer costs you less.",
    flow: [["We show your ad", "to people likely to buy, in the places you sell to"], ["They send their details", "their name and number reach you straight away"], ["You make the sale", "and tell us which enquiries were good, so we find more like them"]],
    example: "Say you install solar panels. We show your ad to homeowners in your area who are looking into solar. Someone taps “Get a quote”, fills in a short form, and their name and number reach your phone straight away.",
    gets: ["Ads written, designed and set up for you", "A simple page where interested people leave their details", "Every enquiry sent straight to you", "New ad ideas tested every month", "A short monthly report: what you spent, how many enquiries you got, and what each one cost"],
    needs: ["Half an hour in the first week to tell us who your best customers are", "Your ad budget, which you pay directly to Facebook or Google", "Someone who calls new enquiries back quickly and tells us which ones were good"],
    highlights: ["Facebook, Instagram, Google and YouTube ads", "Enquiries sent straight to you", "New ads tested every month", "A clear monthly report"],
    fit: ["You want more enquiries or sales, not just likes", "You run ads but can't tell if they pay off", "You're opening in a new city or country"],
    steps: [["Week 1", "We learn about your customers and set up tracking, so we can see which ads bring sales"], ["Week 2", "Your ads and enquiry page go live"], ["Weeks 3–4", "We stop the ads that don't work and put more behind the ones that do"], ["Every month", "Fresh ads, and a report you can read in five minutes"]],
    faq: [["How much should we spend on ads?", "Enough for the ad platforms to learn who buys from you: usually enough for about 30 enquiries or sales a month. If your budget is too small to work, we'll tell you before you spend it."],
      ["Do you take a percentage of our ad spend?", "No. You pay us one fixed monthly fee, agreed upfront. Your ad money goes directly to Facebook, Google and the others, so you always see where it went."],
      ["How soon will we see results?", "Ads usually go live within 7 working days. The first two weeks are for learning. By week 4 the cost of each enquiry should start coming down."],
      ["Facebook or Google: which is better?", "Google shows your ad when people search for what you sell. Facebook and Instagram show it while people scroll. Many businesses use both. After the free audit we'll suggest where to start."]],
    technical: ["Meta, Google, YouTube, LinkedIn and TikTok campaigns", "Pixel and server-side conversion tracking (Conversions API, enhanced conversions) that survives privacy changes", "Creative testing every month, scored by cost per qualified lead or sale", "Campaign landing pages, separate from your homepage", "Offline conversions fed back from your CRM, so platforms optimise for real customers"],
  },
  {
    slug: "social-content", name: "Social media", aka: "social media marketing and content", icon: "social",
    short: "We plan, create and post on your Instagram, Facebook, LinkedIn and YouTube.",
    tagline: "Post regularly, without doing it yourself.",
    promise: "Regular, good-looking posts that make people trust you and buy from you, without you doing the work.",
    plain: "We plan what to post each month, make the videos and posts, write the captions and put them up for you. We also reply to comments and messages, and show you every month how your accounts are growing.",
    flow: [["We plan the month", "you approve the plan before anything goes out"], ["We make and post", "short videos, photo posts and stories, in your brand's voice"], ["You see the growth", "followers, views and enquiries, every month"]],
    example: "Say you run a furniture showroom. Each month we film a few short videos in your store, turn them into reels and posts, and publish them through the month. When someone comments “price?”, we reply and pass serious buyers to you.",
    gets: ["A monthly plan you approve first", "Short videos (reels), photo posts and stories", "Captions written for your customers", "Comments and messages answered in working hours", "A monthly report: followers, views and enquiries"],
    needs: ["A short call to agree how your brand should sound", "Access to your social media accounts", "A few hours a month for filming, or the photos and videos you already have"],
    highlights: ["A monthly posting plan", "Reels, posts and stories made for you", "Comments and messages answered", "A monthly growth report"],
    fit: ["You know you should post more, but there's never time", "You want people to know and trust you before they call", "You're a founder who wants to be known in your industry"],
    steps: [["Week 1", "We agree your style, topics and the first month's plan"], ["Week 2", "Scripts, filming (or your photos and videos) and first edits"], ["Weeks 3–4", "Posting starts, and we reply to comments and messages"], ["Every month", "We keep what grew, drop what didn't, and plan the next month"]],
    faq: [["Do you film, or do we send videos?", "Either works. We can guide your team through a filming list on a video call, work with a local crew in your city, or edit videos you already have."],
      ["Which platforms should we be on?", "Wherever your customers spend their free time. For most shops and consumer brands that's Instagram and Facebook. If you sell to other businesses, start with LinkedIn."],
      ["How will we know it's working?", "Every month you get one simple report for each account: new followers, how many people saw your posts, how many reacted, and how many enquiries came from social media."]],
    technical: ["Monthly content pillars and calendar", "Short-form video edited for retention in the first three seconds", "AI-assisted scripting and captioning, checked by a person for tone", "Community management for comments and DMs", "A monthly dashboard: followers, reach, views, engagement and leads, per account"],
  },
  {
    slug: "seo-ai-search", name: "Google & AI search", aka: "SEO and AI search optimisation", icon: "search",
    short: "Get found when people search Google or ask ChatGPT for what you sell.",
    tagline: "Be the answer when customers search.",
    promise: "Show up when customers search Google or Google Maps, or ask an AI assistant, for what you sell.",
    plain: "When someone searches Google for what you sell, or asks ChatGPT or Gemini who's best for it, we work to make your business one of the answers. We fix your website so Google understands it, write helpful pages that answer your customers' questions, and keep your business details correct everywhere online.",
    flow: [["We fix your website", "so Google can read it properly and it loads fast"], ["We write helpful pages", "that answer the questions your customers actually ask"], ["You get found", "on Google, on Google Maps and in AI answers"]],
    example: "Say you run a dental clinic. People search “dentist near me open on Sunday” or ask ChatGPT “best clinic for braces in my city”. We make sure your website has a clear page answering exactly that, and your Google Business Profile is complete, so yours is one of the names that comes up.",
    gets: ["Your website's technical problems found and fixed", "New pages and articles that answer your customers' questions", "Your Google Business Profile and other listings set up properly", "Your business made easy for AI tools to quote", "A monthly report: where you rank, how many people visit, and where AI tools mention you"],
    needs: ["Access to your website and Google accounts", "The questions your customers ask you most, and your answers", "A little patience: the first results show in weeks, the big ones in a few months"],
    highlights: ["Show up higher on Google", "Appear in ChatGPT and Gemini answers", "Google Maps and local listings", "A monthly ranking report"],
    fit: ["Customers can't find you on Google", "Competitors show up in ChatGPT's answers and you don't", "Your website gets few visitors", "You're opening in a new city or country"],
    steps: [["Weeks 1–2", "We check your website and find out what your customers search for"], ["Weeks 3–4", "Fixes go live and we agree which pages to write"], ["Months 2–3", "New pages go up and your rankings start to move"], ["Every month", "Rankings, visitors and AI mentions, in one report"]],
    faq: [["What does SEO mean?", "Search engine optimisation: improving your website so it shows up higher on Google when people search for what you sell. You don't pay Google per click; you earn the place."],
      ["What is AI search?", "More people now ask ChatGPT, Gemini or Perplexity instead of searching Google. These tools answer by quoting a few websites. AI search work makes your pages clear and trustworthy enough to be the ones they quote. It builds on good SEO; it doesn't replace it."],
      ["How long does it take?", "Fixes to your website help within weeks. Ranking for searches many businesses compete for usually takes four to six months of steady work. You'll see progress every month, so you're never guessing."],
      ["Do you guarantee the first position?", "No honest agency can, because Google decides. We guarantee the work, a clear monthly report, and that you own every page we create."]],
    technical: ["Technical audit and fixes: speed, Core Web Vitals, indexing, structured data (schema)", "Content planned from search and AI-prompt research", "AI-search readiness: llms.txt, FAQ and organisation schema, consistent business details across the web", "International SEO: hreflang, country targeting and local listings", "Monthly ranking, traffic and AI-mention tracking"],
  },
  {
    slug: "websites-apps", name: "Websites & apps", aka: "web design and development", icon: "web",
    short: "Fast, good-looking websites that turn visitors into enquiries, and custom apps.",
    tagline: "A website that brings you enquiries.",
    promise: "A website that looks good on every phone, loads fast and turns visitors into enquiries.",
    plain: "We design and build your website. We help you with the words, make it look good on phones, make it load fast, and make sure every enquiry reaches you. We also build online stores, booking systems, customer portals and tools for your team.",
    flow: [["We plan it with you", "what visitors should see, and what you want them to do"], ["We design, you approve", "you see the design before we build anything"], ["We build and launch", "fast, phone-friendly and ready for Google"]],
    example: "Say you run a clinic. Your new website shows your services and timings clearly, lets patients book a slot from their phone, and sends each booking to you on WhatsApp and to your front desk.",
    gets: ["A page plan, and help writing the words", "Designs you approve before we build", "A website that's fast and works on every phone", "Every enquiry form sent straight to you", "Hosting set up, a handover call and 30 days of free fixes after launch"],
    needs: ["An hour or two to tell us about your business and customers", "Your logo, photos and any content you already have", "Quick feedback when we share designs"],
    highlights: ["Business websites and online stores", "Booking systems and customer portals", "Fast, phone-friendly, ready for Google", "Every enquiry sent to you"],
    fit: ["Your website is slow, old or doesn't bring enquiries", "You don't have a website yet", "You want to sell online or take bookings", "You need a portal or tool that nobody sells ready-made"],
    steps: [["Week 1", "We learn about your business and plan the pages"], ["Weeks 2–3", "Design: you review it and we refine it"], ["Weeks 3–5", "We build it and add your content"], ["Launch", "Speed and Google checks, then we hand it over"]],
    faq: [["How long does a website take?", "A business website: three to five weeks. An online store: six to eight. Custom apps are planned with you and get a fixed quotation."],
      ["Can we update it ourselves?", "Yes, if you want to. We'll build it on something your team can update without calling us every time."],
      ["Who owns the website?", "You do. The domain, hosting and code are in your name from day one."]],
    technical: ["Sitemap and messaging built around your customers' questions", "The right stack for the job: static for speed, Shopify or WordPress for easy editing, React and Python for custom apps", "Core Web Vitals, accessibility and SEO built in", "Forms connected to your CRM, analytics and conversion tracking", "Hosting, SSL, backups and a 30-day warranty"],
  },
  {
    slug: "brand-video", name: "Logo, brand & video", aka: "branding and video production", icon: "brand",
    short: "Logos, packaging and videos that make your business look established.",
    tagline: "Look as good as you are.",
    promise: "A logo, look and videos that make your business look as good as it really is.",
    plain: "We create how your business looks and sounds: a name if you need one, your logo, colours, packaging, and a simple guide so everything stays consistent. We also make videos: short ads, product videos and films about your company.",
    flow: [["We get to know you", "your customers, your competitors, what makes you different"], ["We show you ideas", "a few directions to choose from"], ["You get everything", "the files, templates and a guide to using them"]],
    example: "Say you're launching a snack brand. We help with the name, design the logo and the pack, and make a short video for Instagram and your website, so it looks like a brand people already know.",
    gets: ["A logo and colours that suit your business", "A brand guide anyone on your team can follow", "Packaging, brochures, presentations and social media templates", "Videos: ads, product videos and company films", "Video ads in several sizes and languages"],
    needs: ["A conversation about your business, customers and competitors", "Your feedback at each stage", "For videos: access to your product, place or team, if we're filming"],
    highlights: ["Name, logo and colours", "Packaging and a brand guide", "Ad and product videos", "Company films"],
    fit: ["You're starting a new business or product", "Your business looks smaller than it really is", "You're entering a new market", "You need videos regularly, on a sensible budget"],
    steps: [["Week 1", "We learn about you, your customers and your competitors"], ["Weeks 2–3", "You see a few creative directions and pick one"], ["Weeks 3–5", "We refine it and design everything you need"], ["Handover", "All files, templates and your brand guide"]],
    faq: [["What do a logo and brand cost?", "It depends on what you need, from a simple logo and colours to a complete brand with packaging. We'll understand your needs on the first call and send a fixed quotation."],
      ["Do you work in languages other than English?", "Yes. We make videos in several languages and adapt brands for new markets, with native speakers checking every line."]],
    technical: ["Naming and positioning", "Logo and identity system with a brand book", "Packaging, decks, social templates and stationery", "Brand films, product and explainer videos", "AI-assisted video ad variations in multiple formats and languages"],
  },
  {
    slug: "ai-automation", name: "AI assistants & automation", aka: "AI agents and marketing automation", icon: "ai",
    short: "AI that replies to customers on WhatsApp and chat, day and night, and handles the busywork.",
    tagline: "Never miss an enquiry again.",
    promise: "An AI assistant that replies to every customer in seconds, day and night, and hands serious buyers to your team.",
    plain: "We set up an AI assistant that replies to your customers on WhatsApp, Instagram, your website and email, at any time of day. It answers common questions, asks what they need, books calls and passes serious buyers to your team. We also automate repetitive office work, like follow-ups, data entry and weekly reports.",
    flow: [["A customer messages you", "on WhatsApp, at 11 at night"], ["The assistant replies in seconds", "answers questions, asks what they need, books a call"], ["Your team takes over", "with the full conversation, when it matters"]],
    example: "Say a customer sends “price for 5 kW solar?” on WhatsApp late at night. The assistant replies straight away, asks about their roof and electricity bill, books a site visit, and sends your sales team the details for the morning.",
    gets: ["An assistant that answers only from information you approve", "Replies on WhatsApp, Instagram, website chat and email", "Calls and visits booked into your calendar", "Automatic follow-ups until the customer replies", "Reports and routine paperwork done for you"],
    needs: ["Your common questions and the right answers: prices, services, timings", "Access to your WhatsApp Business and other accounts", "Someone on your team to take over hot enquiries"],
    highlights: ["Replies on WhatsApp and chat, day and night", "Answers only what you approve", "Books calls and follows up", "Reports and paperwork done for you"],
    fit: ["You get more messages than your team can answer", "Enquiries come on WhatsApp, calls, forms and DMs, and some get missed", "Your team copies information between tools by hand", "Your week starts with putting together last week's report"],
    steps: [["Week 1", "We map how enquiries and work flow today"], ["Week 2", "We build the assistant and teach it your approved answers"], ["Week 3", "We test it on real conversations, with your team watching"], ["Every month", "We read the conversations with you, improve the answers and automate the next task"]],
    faq: [["Will the AI say something wrong to my customers?", "It answers only from information you've approved and passes anything else to a person. You can read every conversation, and we review them with you every month."],
      ["Which tools do you connect?", "WhatsApp Business, Instagram and Facebook messages, website chat, Gmail and Google Workspace, Google Sheets, Odoo and other customer databases (CRMs), Shopify, Razorpay, Stripe, Calendly and custom systems. Nothing is locked in."],
      ["Which AI do you use?", "Claude, ChatGPT or Gemini, whichever suits each job, always on business accounts. For voice and Indian languages, including Tamil, we use AI built for them."],
      ["What does it cost to run?", "A fixed quotation to set it up, then a monthly fee that covers hosting, AI usage, monitoring and improvements. No per-user licences."],
      ["Who owns it?", "You do. It runs in your accounts, with your data, and we write down how every part works so another team could take it over."],
      ["Can we see one working?", "Yes, you're looking at one: Dot, the assistant in the corner of this site, answers questions and passes enquiries to our team the same way. Ask it anything."]],
    usecases: [["Sales", ["Reply to every enquiry in seconds and ask the right questions", "Book calls and site visits straight into the calendar", "Follow up until the customer replies, then hand over"]],
      ["Marketing", ["A weekly summary of your ads, enquiries and sales, written for you", "First drafts of posts and emails, checked by a person", "Tell Facebook and Google which enquiries became sales, so your ads improve"]],
      ["Customer service", ["WhatsApp and chat answers for common questions, order status and bookings", "Review requests sent at the right moment", "Every conversation saved, searchable and handed over when needed"]],
      ["Operations", ["Invoices, purchase orders and forms read and entered for you", "Approvals and reminders that don't need chasing", "An internal assistant that answers from your procedures and price lists"]]],
    integrations: ["WhatsApp Business", "Instagram & Facebook DMs", "Website chat", "Gmail & Google Workspace", "Google Sheets", "Odoo", "Popular CRMs", "Shopify", "Razorpay", "Stripe", "Calendly", "Slack", "n8n", "Claude", "ChatGPT", "Gemini", "Indian-language voice"],
    safety: [["Approved answers only", "The assistant answers from the information you sign off, and says so when it doesn't know."], ["A person one tap away", "Hot enquiries, complaints and anything unusual go to your team straight away, with the conversation attached."],
      ["Everything saved", "Every message, decision and hand-over is recorded and reviewed with you every month."], ["Your accounts, your data", "It runs in your WhatsApp, CRM and Google accounts, with consent and opt-outs built in."]],
    technical: ["WhatsApp Business Platform (Meta's official API), web chat and email agents", "Retrieval from approved knowledge only, with human hand-off rules", "Lead scoring, routing and follow-up sequences", "Workflows on n8n, documented and portable", "Claude, GPT or Gemini per task, via business API accounts"],
  },
];

// what customers come to us with, in their words → the service that solves it (services page and home)
export const needs = [
  ["I want more enquiries and sales", "performance-ads"],
  ["People can't find us on Google", "seo-ai-search"],
  ["Our website is old, slow or brings no enquiries", "websites-apps"],
  ["We never find time to post on social media", "social-content"],
  ["We miss calls, WhatsApp messages and enquiries", "ai-automation"],
  ["Our logo and look feel small next to competitors", "brand-video"],
];

// words customers hear from agencies, explained
export const glossary = [
  ["Lead", "Someone who has shown interest and shared how to reach them, like a name and phone number. We also call it an enquiry."],
  ["Cost per lead", "What you spend on ads divided by the enquiries they bring. If 10,000 in ads brings 50 enquiries, each cost 200."],
  ["SEO", "Search engine optimisation: improving your website so it shows up higher on Google, without paying per click."],
  ["AI search", "Getting your business mentioned when people ask ChatGPT, Gemini or Perplexity a question instead of searching Google."],
  ["Landing page", "A single web page made for one ad or offer, with one clear thing to do, like “Get a quote”."],
  ["CRM", "Your list of customers and enquiries, and what happens next with each. It can be as simple as a Google Sheet."],
  ["Reels", "Short, upright videos, usually under a minute, on Instagram, Facebook and YouTube."],
  ["AI assistant", "Software that reads customer messages and replies in plain language, using only information you've approved."],
];


export const steps = [
  { n: "01", title: "Audit", when: "Days 1–5", text: "We look at your website, how you show up on Google and in AI answers, your social media and any ads you run. You get a written report and a 30-minute call explaining it, whether or not you work with us." },
  { n: "02", title: "Plan", when: "Days 5–10", text: "A plan for the next 90 days: what we'll do, what it costs, and the numbers we'll be judged on, with one fixed quotation in your currency." },
  { n: "03", title: "Build", when: "Days 10–30", text: "We set everything up: ads, pages, posts, videos and automations. You approve everything before it goes live." },
  { n: "04", title: "Grow", when: "Day 30 onwards", text: "Every week we improve what's running. Every month we review the results with you, and you can open a live dashboard any time. We keep what works and drop what doesn't." },
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
  ["AI-first, people-led", "AI does the research, first drafts, checking and reports, so work moves faster and costs less. Experienced people make the decisions and approve everything your customers see."],
  ["One team for everything", "Ads, Google, social media, websites and automation under one roof, working from one plan and one report. No passing you between agencies, no finger-pointing."],
  ["Built for global brands", "We work in your hours across the UK, Europe, the Middle East, Asia-Pacific and the Americas, and quote and invoice in your currency."],
  ["Transparent by default", "A live client portal with reports, approvals and invoices. Fixed quotations, month-to-month terms and never a percentage of your ad spend."],
];

// the disciplines on the team
export const expertise = ["Online ads", "Google and AI search", "Social media and content", "Logo and brand design", "Video production", "Websites and apps", "AI assistants and automation", "Reports and analytics"];

// industries we work in (from real client work)
export const industries = ["Energy and solar", "Manufacturing and industrial", "Retail and e-commerce", "Consumer brands", "Professional services", "Technology"];

export const faqs = [
  ["What does Dotindot do?", "We help businesses get more customers online. We run your ads and social media, get you found on Google and in AI answers, build websites and apps, design logos and make videos, and set up AI assistants that reply to customers for you, for businesses anywhere in the world."],
  ["Where are you based?", "Our team is headquartered in India and works with clients around the world over video calls, WhatsApp and a shared client portal. We travel when a project needs it."],
  ["Which time zones do you cover?", "Our day overlaps comfortably with Europe, the Gulf and Asia-Pacific. For the Americas we hold calls early or late, and the work keeps moving while you sleep."],
  ["Which currencies do you invoice in?", "USD, GBP, EUR, CAD, AED, SGD, THB, JPY, AUD or INR — whatever's simplest for your accounts team. Quotations come in the same currency."],
  ["How much does it cost?", "Every engagement gets a fixed quotation after the free audit. Retainers are monthly; one-off projects like websites and brand identities are priced per scope. We never take a percentage of your ad spend."],
  ["How do we know it's working?", "You get a live dashboard showing where your enquiries come from, what each one cost, follower growth, video views and Google rankings, plus a monthly call where we go through it together."],
  ["Do we have to sign a long contract?", "No. Retainers are month to month with 30 days' notice. Projects have a fixed scope and timeline."],
  ["What does “AI-first” mean?", "AI does the first drafts, the checking and the number-crunching, so work happens faster and costs less. People on our team make every decision your customers see."],
];

// Articles live in insights.json (body in simple Markdown: ## headings, - lists, 1. lists, **bold**, [links](url)).
// Once the app's Website editor is used, articles are managed there and this file is only the starting point.
const _ins = JSON.parse(readFileSync(new URL("./insights.json", import.meta.url), "utf8"));
const _words = (t) => String(t).split(/\s+/).filter(Boolean).length;
export const insights = _ins.map((a) => ({ minutes: Math.max(1, Math.round(_words(a.body) / 220)), ...a }));

// the roles that were on the careers page before HR → Hiring; used only until the app publishes its own job list
export const careers = JSON.parse(readFileSync(new URL("./careers.json", import.meta.url), "utf8")).map((r) => ({ ...r, place: `${r.location}, full-time`, text: r.summary }));

export const tools = ["Meta Ads", "Google Ads", "GA4", "LinkedIn Ads", "TikTok Ads", "YouTube", "Search Console", "Shopify", "WordPress", "React", "Python", "n8n", "WhatsApp Business", "ChatGPT", "Claude", "Midjourney", "Kling", "ElevenLabs", "Canva", "Figma", "Looker Studio"];

// ---------- SEO titles per service (title tag only; the page H1 stays short) ----------
export const seoTitles = {
  "performance-ads": "Online ads that bring customers — Facebook, Instagram & Google ads (performance marketing)",
  "social-content": "Social media management — reels, posts & replies, done for you",
  "seo-ai-search": "SEO & AI search — get found on Google, Google Maps and ChatGPT",
  "websites-apps": "Website design & development — fast websites, online stores and web apps",
  "brand-video": "Logo design, branding & video production",
  "ai-automation": "AI assistant for WhatsApp & website chat — AI automation for business",
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
// AI automation on the home page: what it does for a business, in plain words
export const automations = [
  ["Every enquiry answered in seconds", "WhatsApp, Instagram, website chat and email, around the clock, in your customers' language."],
  ["Leads qualified and routed", "The right questions asked, the lead scored, and hot ones sent straight to the right person."],
  ["Follow-up that never forgets", "Reminders, quotes and nudges until the lead replies, then a human takes over."],
  ["Meetings booked for you", "Calls, demos and site visits go straight into your team's calendar."],
  ["Reports that write themselves", "A weekly summary of ads, leads and sales, in plain English, every Monday morning."],
  ["Busywork off your team's plate", "Invoices, forms and data entry handled, so people spend time on customers."],
];

export const quiz = [
  { q: "How fast does your website load on a phone?", a: [["Under 2 seconds", 3], ["2–5 seconds", 1], ["Over 5 seconds", 0]], fix: "Speed up your website — every second costs enquiries." },
  { q: "Ask ChatGPT for the best in your field. Are you named?", a: [["Yes", 3], ["Not sure", 1], ["No", 0]], fix: "Get cited by AI assistants (AI search optimisation)." },
  { q: "How often do you post on social media?", a: [["Weekly or more", 3], ["Occasionally", 1], ["Rarely or never", 0]], fix: "Build a content calendar that runs itself." },
  { q: "Do you know what one lead costs you?", a: [["Precisely", 3], ["Roughly", 1], ["We don't track it", 0]], fix: "Set up tracking so every lead has a known cost." },
  { q: "How fast do you reply to a new enquiry?", a: [["Under 5 minutes", 3], ["Same day", 1], ["A day or more", 0]], fix: "Answer every enquiry in seconds with an AI agent." },
  { q: "Do people recognise your brand at a glance?", a: [["Instantly", 3], ["Somewhat", 1], ["Not yet", 0]], fix: "Sharpen your brand so you look like the category leader." },
];
