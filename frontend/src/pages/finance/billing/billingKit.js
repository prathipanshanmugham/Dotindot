// v3.2 Billing — shared helpers
export const SYMBOL = { INR: "₹", USD: "$", EUR: "€", AED: "AED ", GBP: "£", SGD: "S$", AUD: "A$", CAD: "C$", THB: "฿", JPY: "¥" };

export const money = (v, cur = "INR", dec = 2) => {
  const n = Number(v) || 0;
  const s = Math.abs(n).toLocaleString(cur === "INR" ? "en-IN" : "en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return `${n < 0 ? "−" : ""}${SYMBOL[cur] || cur + " "}${s}`;
};
export const moneyShort = (v, cur = "INR") => {
  const n = Number(v) || 0, a = Math.abs(n), sign = n < 0 ? "−" : "", sym = SYMBOL[cur] || cur + " ";
  if (cur === "INR") {
    if (a >= 1e7) return `${sign}${sym}${(a / 1e7).toFixed(2)} Cr`;
    if (a >= 1e5) return `${sign}${sym}${(a / 1e5).toFixed(2)} L`;
  } else if (a >= 1e6) return `${sign}${sym}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}${sym}${(a / 1e3).toFixed(1)}K`;
  return `${sign}${sym}${a.toFixed(0)}`;
};

export const STATUS_TONE = { draft: "gray", sent: "blue", accepted: "green", rejected: "red", expired: "amber", converted: "violet", cancelled: "gray",
  paid: "green", part_paid: "amber", overdue: "red", issued: "green" };
export const STATUS_LABEL = { draft: "Draft", sent: "Sent", accepted: "Accepted", rejected: "Rejected", expired: "Expired", converted: "Converted", cancelled: "Cancelled",
  paid: "Paid", part_paid: "Part paid", overdue: "Overdue", issued: "Issued" };
export const TYPE_LABEL = { quotation: "Quotation", proforma: "Proforma", invoice: "Invoice", credit_note: "Credit note" };
export const TYPE_SHORT = { quotation: "QTN", proforma: "PI", invoice: "INV", credit_note: "CN" };

/** Line + document totals, mirroring the server so the editor can show live numbers. */
export function computeTotals(items, currency, taxMode, discountPct, discountAmount, roundOff, defaultRate) {
  const isGst = taxMode === "gst_intra" || taxMode === "gst_inter";
  const r2 = (x) => Math.round((Number(x) || 0) * 100 + 1e-6) / 100;
  const lines = items.map((it) => {
    const gross = r2((Number(it.qty) || 0) * (Number(it.unit_price) || 0));
    const disc = r2(gross * (Number(it.discount_pct) || 0) / 100);
    const net = r2(gross - disc);
    const rate = isGst ? (it.tax_rate === "" || it.tax_rate == null ? defaultRate : Number(it.tax_rate)) : 0;
    return { ...it, gross, discount: disc, net, rate };
  });
  const subtotal = r2(lines.reduce((s, l) => s + l.net, 0));
  let overall = r2(Number(discountAmount) || subtotal * (Number(discountPct) || 0) / 100);
  overall = Math.min(overall, subtotal);
  const taxable = r2(subtotal - overall);
  const factor = subtotal ? taxable / subtotal : 0;
  let tax = 0;
  lines.forEach((l) => { l.taxable = r2(l.net * factor); l.tax = r2(l.taxable * l.rate / 100); tax += l.tax; });
  tax = r2(tax);
  const gross = r2(taxable + tax);
  const total = roundOff && currency === "INR" ? Math.round(gross) : gross;
  return { lines, subtotal, discount: overall, taxable, cgst: taxMode === "gst_intra" ? r2(tax / 2) : 0, sgst: taxMode === "gst_intra" ? r2(tax / 2) : 0,
    igst: taxMode === "gst_inter" ? tax : 0, tax, roundOff: r2(total - gross), total };
}

export const fileToDataUrl = (file, maxKB = 400) => new Promise((resolve, reject) => {
  if (!file) return resolve(null);
  if (file.size > maxKB * 1024) return reject(new Error(`Keep it under ${maxKB} KB — export a smaller image`));
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error("Couldn't read the file"));
  r.readAsDataURL(file);
});
