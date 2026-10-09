"""Optional demo data for v2.6 (AI Agents + Org Structure). NOT run at startup — call seed_v26() manually
for a demo/staging database. Idempotent: agents upsert by id, usage only inserted once, org only built when empty."""
import random
from datetime import date, timedelta, datetime, timezone
from database import db

NOW = lambda: datetime.now(timezone.utc).isoformat()

AGENTS = [
    {"id": "agent-01", "name": "Proposal Writer", "platform": "claude", "agent_type": "content", "status": "active",
     "purpose": "Turns discovery-call notes into a first-draft proposal with scope, timeline and pricing table.",
     "owner_id": "user-sales", "assignee_ids": ["user-sales", "user-pm", "user-midhun"], "client_ids": [], "project_ids": [],
     "monthly_cost": 1700, "minutes_saved_per_run": 90, "access_url": "https://claude.ai",
     "playbook": "1. Paste the call notes and the client's website.\n2. Use the 'Proposal from notes' prompt.\n3. Check pricing against the rate card before sending.\n4. Save the final version to the lead in Sales → Pipeline.",
     "guardrails": "Never paste client passwords or contracts. Always have a human check numbers and dates.",
     "prompts": [{"id": "p1", "title": "Proposal from notes", "when_to_use": "After a discovery call",
                  "prompt": "You are a proposal writer for dotindot Creative, a digital marketing & web agency. Using the notes below, write a proposal with: 1) understanding of the client's goal, 2) scope in bullet points, 3) a 3-phase timeline, 4) a pricing table in INR. Keep it under 600 words.\n\nNotes:\n"},
                 {"id": "p2", "title": "Tighten an existing proposal", "when_to_use": "Before sending",
                  "prompt": "Shorten this proposal by 30% without losing scope items. Keep the tone confident and plain."}]},
    {"id": "agent-02", "name": "SEO Blog Drafter", "platform": "custom_gpt", "agent_type": "content", "status": "active",
     "purpose": "Drafts SEO blog posts from a keyword brief in the client's brand voice.",
     "owner_id": "user-marketing", "assignee_ids": ["user-marketing", "user-employee"], "client_ids": ["seed-client-01", "seed-client-03"],
     "project_ids": [], "monthly_cost": 1700, "minutes_saved_per_run": 120, "access_url": "https://chat.openai.com",
     "playbook": "Give it the keyword, search intent and 3 competitor URLs. Ask for an outline first, approve it, then the full draft.",
     "guardrails": "Fact-check every statistic. Run the draft through a plagiarism check before publishing.",
     "prompts": [{"id": "p1", "title": "Outline first", "when_to_use": "Every new post",
                  "prompt": "Create an H2/H3 outline for a 1,500-word blog post targeting the keyword below. Include FAQ section ideas.\n\nKeyword:"}]},
    {"id": "agent-03", "name": "Ad Copy Generator", "platform": "chatgpt", "agent_type": "content", "status": "active",
     "purpose": "Writes Meta and Google ad variations (headlines, primary text, CTAs) for A/B tests.",
     "owner_id": "user-ads", "assignee_ids": ["user-ads"], "client_ids": ["seed-client-02", "seed-client-05"], "project_ids": [],
     "monthly_cost": 1700, "minutes_saved_per_run": 45, "access_url": "https://chat.openai.com",
     "playbook": "Ask for 10 variations, pick the best 3, and log which one won in the campaign notes.",
     "guardrails": "Follow each platform's ad policy — no unverifiable claims.",
     "prompts": [{"id": "p1", "title": "10 Meta ad variations", "when_to_use": "New campaign or creative refresh",
                  "prompt": "Write 10 Meta ad variations for the offer below. For each: headline (max 40 chars), primary text (max 125 chars), CTA."}]},
    {"id": "agent-04", "name": "Social Caption Studio", "platform": "claude", "agent_type": "content", "status": "active",
     "purpose": "Plans a month of posts and writes captions and hashtags per platform.",
     "owner_id": "user-social", "assignee_ids": ["user-social", "user-designer"], "client_ids": ["seed-client-04"], "project_ids": [],
     "monthly_cost": 1700, "minutes_saved_per_run": 60, "access_url": "https://claude.ai",
     "playbook": "Start each month with the 'Content calendar' prompt, then write captions in weekly batches.",
     "guardrails": "Check every caption against the client's brand do's and don'ts.",
     "prompts": [{"id": "p1", "title": "Content calendar", "when_to_use": "First week of the month",
                  "prompt": "Create a 4-week Instagram + LinkedIn content calendar for the brand below: 3 posts/week, mix of educational, behind-the-scenes and offer posts."}]},
    {"id": "agent-05", "name": "Lead Qualifier", "platform": "n8n", "agent_type": "automation", "status": "active",
     "purpose": "Reads website form leads, scores them and creates a lead in the pipeline with a summary.",
     "owner_id": "user-midhun", "assignee_ids": ["user-sales"], "client_ids": [], "project_ids": [],
     "monthly_cost": 2400, "minutes_saved_per_run": 15, "access_url": "",
     "playbook": "Runs automatically on every form submission. Sales reviews the score each morning and logs a run for each lead they act on.",
     "guardrails": "Don't let it email leads directly — a human always sends the first reply.", "prompts": []},
    {"id": "agent-06", "name": "Code Review Assistant", "platform": "copilot", "agent_type": "code", "status": "active",
     "purpose": "Reviews pull requests and suggests fixes for client websites and apps.",
     "owner_id": "user-dev", "assignee_ids": ["user-dev"], "client_ids": [], "project_ids": ["seed-project-01", "seed-project-04"],
     "monthly_cost": 850, "minutes_saved_per_run": 30, "access_url": "https://github.com",
     "playbook": "Ask for a review on every PR before requesting a human review.",
     "guardrails": "Never paste production secrets or .env files.", "prompts": []},
    {"id": "agent-07", "name": "Moodboard Maker", "platform": "midjourney", "agent_type": "design", "status": "active",
     "purpose": "Generates moodboards and visual directions for brand and campaign kick-offs.",
     "owner_id": "user-designer", "assignee_ids": ["user-designer"], "client_ids": ["seed-client-06"], "project_ids": [],
     "monthly_cost": 2500, "minutes_saved_per_run": 75, "access_url": "https://www.midjourney.com",
     "playbook": "Use 3–4 reference words from the brief plus the brand colours. Present at most 2 directions to the client.",
     "guardrails": "Generated images are for internal direction only unless the client approves usage.", "prompts": []},
    {"id": "agent-08", "name": "Expense Receipt Parser", "platform": "make", "agent_type": "automation", "status": "active",
     "purpose": "Reads uploaded receipts, extracts vendor, amount and GST, and pre-fills the expense form.",
     "owner_id": "user-finance", "assignee_ids": ["user-finance"], "client_ids": [], "project_ids": [],
     "monthly_cost": 900, "minutes_saved_per_run": 6, "access_url": "", "playbook": "Upload receipts in a batch every Friday.",
     "guardrails": "Finance still approves every expense.", "prompts": []},
    {"id": "agent-09", "name": "Client Report Summariser", "platform": "gemini", "agent_type": "analytics", "status": "active",
     "purpose": "Summarises monthly analytics exports into a one-page client update.",
     "owner_id": "user-pm", "assignee_ids": ["user-pm", "user-marketing"], "client_ids": [], "project_ids": [],
     "monthly_cost": 1950, "minutes_saved_per_run": 50, "access_url": "https://gemini.google.com",
     "playbook": "Export GA4 + Search Console as CSV, upload both, ask for 'wins, issues, next month'.",
     "guardrails": "Remove client PII from exports first.", "prompts": []},
    {"id": "agent-10", "name": "Research Scout", "platform": "perplexity", "agent_type": "research", "status": "testing",
     "purpose": "Quick competitor and market research with sources, before pitches.",
     "owner_id": "user-admin", "assignee_ids": [], "open_to_all": True, "client_ids": [], "project_ids": [],
     "monthly_cost": 1700, "minutes_saved_per_run": 40, "access_url": "https://www.perplexity.ai",
     "playbook": "Ask for 5 competitors with pricing and positioning; always open the sources.",
     "guardrails": "Treat numbers as leads to verify, not facts.", "prompts": []},
]

TASKS = {
    "agent-01": ["Proposal for {c}", "Revised scope for {c}", "Retainer proposal draft"],
    "agent-02": ["Blog: local SEO guide", "Blog: product launch post", "Blog outline for {c}"],
    "agent-03": ["Meta ad variations for {c}", "Google RSA headlines", "Creative refresh copy"],
    "agent-04": ["October content calendar", "Captions week 2", "LinkedIn carousel copy"],
    "agent-05": ["Qualified inbound lead", "Scored website enquiry"],
    "agent-06": ["PR review: checkout fix", "PR review: landing page", "Refactor suggestions"],
    "agent-07": ["Moodboard for {c}", "Campaign visual direction"],
    "agent-08": ["Weekly receipt batch"],
    "agent-09": [],
    "agent-10": ["Competitor scan for pitch", "Market sizing notes"],
}
USERS_BY_AGENT = {a["id"]: (a["assignee_ids"] or ["user-admin", "user-sales", "user-pm"]) for a in AGENTS}
CLIENT_NAMES = ["Bombay Brew Co", "FinEdge", "Desert Pearl", "GreenLeaf"]


async def seed_v26():
    for a in AGENTS:
        doc = {"open_to_all": False, "currency": "INR", **a, "created_at": NOW(), "updated_at": NOW(), "created_by": "user-admin"}
        await db.ai_agents.update_one({"id": a["id"]}, {"$setOnInsert": doc}, upsert=True)

    if not await db.ai_agent_usage.find_one({"id": "usage-0001"}):
        rnd = random.Random(26)
        names = {u["id"]: u["name"] for u in await db.users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)}
        n = 0
        today = date.today()
        for a in AGENTS:
            tasks = TASKS.get(a["id"]) or []
            if not tasks:
                continue  # agent-09 stays idle on purpose
            per_week = {"agent-05": 6, "agent-08": 1, "agent-10": 1}.get(a["id"], 3)
            users = USERS_BY_AGENT[a["id"]]
            # leave one assignee unused for adoption-gap insight
            active_users = users[:-1] if len(users) > 2 else users
            for day in range(0, 56):
                if rnd.random() > per_week / 7:
                    continue
                n += 1
                uid = rnd.choice(active_users)
                outcome = rnd.choices(["success", "partial", "failed"], [80, 15, 5])[0]
                await db.ai_agent_usage.insert_one({
                    "id": f"usage-{n:04d}", "agent_id": a["id"], "user_id": uid, "user_name": names.get(uid, uid),
                    "date": (today - timedelta(days=day)).isoformat(),
                    "task": rnd.choice(tasks).format(c=rnd.choice(CLIENT_NAMES)),
                    "client_id": rnd.choice(a["client_ids"]) if a["client_ids"] else None,
                    "project_id": rnd.choice(a["project_ids"]) if a["project_ids"] else None,
                    "minutes_saved": a["minutes_saved_per_run"] * (1 if outcome == "success" else 0.5 if outcome == "partial" else 0),
                    "outcome": outcome, "rating": rnd.choice([3, 4, 4, 5, 5]) if outcome != "failed" else 2,
                    "note": "", "created_at": NOW(),
                })

    if await db.org_nodes.count_documents({}) == 0:
        from routes_org import bootstrap, BootstrapBody
        admin = await db.users.find_one({"role": "super_admin"}, {"_id": 0})
        if admin:
            await bootstrap(BootstrapBody(), user=admin)
