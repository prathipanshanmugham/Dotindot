// Project billing vocabulary — the same words the backend uses (backend/revenue.py).
export const SERVICES = [
  ["web", "Website"], ["software", "ERP & software"], ["social", "Social media"], ["ads", "Ads"], ["seo", "SEO"],
  ["branding", "Branding"], ["video", "Video"], ["influencer", "Influencers"], ["ai", "AI automation"], ["other", "Other"],
];
export const SERVICE_LABEL = Object.fromEntries(SERVICES);
export const CYCLES = [["monthly", "Month"], ["quarterly", "Quarter"], ["half_yearly", "Half-year"], ["yearly", "Year"]];
export const CYCLE_MONTHS = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };
export const CYCLE_WORD = { monthly: "month", quarterly: "quarter", half_yearly: "half-year", yearly: "year" };

const n0 = (v) => Number(v) || 0;
export const rupees = (v) => `₹${Math.round(n0(v)).toLocaleString("en-IN")}`;

/** Monthly value of a recurring fee (₹30,000 a quarter → ₹10,000). */
export const toMonthly = (amount, cycle) => n0(amount) / (CYCLE_MONTHS[cycle] || 1);

/** "₹30,000 / month" or "₹2,00,000 one-time" — what a project is worth. */
export const billingText = (p) =>
  p?.billing_type === "recurring" ? `${rupees(p.recurring_amount)} / ${CYCLE_WORD[p.billing_cycle] || "month"}` : `${rupees(p?.budget)} one-time`;
